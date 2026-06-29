import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { getNextStage, STAGE_LABELS } from "@/lib/stages";
import {
  CareerPlanStatus,
  FollowUpStatus,
  OpportunityType,
  SessionStatus,
} from "@/generated/prisma/client";
import { beneficiaryCanSeeOpportunity } from "@/lib/opportunity-visibility";
import {
  createNotification,
  notifyAdmins,
} from "@/lib/notifications";
import { getSystemSettings } from "@/lib/system-settings";
import { sendSessionScheduledEmails } from "@/lib/email-notify";
import type { CareerPlanTask } from "@/lib/copy/ar";

export type ActionResult = { success: true } | { success: false; error: string };

function parseTasks(raw: unknown): CareerPlanTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is CareerPlanTask =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as CareerPlanTask).id === "string" &&
      typeof (t as CareerPlanTask).title === "string" &&
      typeof (t as CareerPlanTask).done === "boolean"
  );
}

async function assertGuideBeneficiary(guideId: string, beneficiaryId: string) {
  return prisma.user.findFirst({
    where: {
      id: beneficiaryId,
      role: "BENEFICIARY",
      guideId,
      stage: "GUIDANCE",
    },
  });
}

export async function registerBeneficiary(data: {
  name: string;
  phone: string;
  email: string;
  password: string;
  educationLevel: string;
  experience: string;
  skills: string;
  careerInterests: string;
  cvUrl?: string;
  certificatesUrls?: string;
}): Promise<ActionResult> {
  if (!data.name || !data.phone || !data.email || !data.password) {
    return { success: false, error: "جميع الحقول الأساسية مطلوبة" };
  }
  if (data.password.length < 6) {
    return { success: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  }

  const email = data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "البريد الإلكتروني مسجل مسبقاً" };
  }

  const guide = await prisma.user.findFirst({
    where: { role: "GUIDE" },
    select: { id: true },
  });

  const created = await prisma.user.create({
    data: {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email,
      password: await hashPassword(data.password),
      role: "BENEFICIARY",
      stage: "PENDING_APPROVAL",
      stageEnteredAt: new Date(),
      guideId: guide?.id ?? null,
      educationLevel: data.educationLevel.trim(),
      experience: data.experience.trim(),
      skills: data.skills.trim(),
      careerInterests: data.careerInterests.trim(),
      cvUrl: data.cvUrl ?? null,
      certificatesUrls: data.certificatesUrls ?? null,
    },
  });

  await notifyAdmins(
    "تسجيل مستفيد جديد",
    `طلب اعتماد للمستفيد ${created.name} — يرجى المراجعة والاعتماد.`
  );

  const settings = await getSystemSettings();
  const { sendGenericEmail } = await import("@/lib/email-notify");
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  for (const admin of admins) {
    await sendGenericEmail({
      to: admin.email,
      subject: "تسجيل مستفيد جديد — منصة تمكين",
      body: `تم تسجيل مستفيد جديد: ${created.name} (${created.email}).\n\nيُرجى مراجعة الطلب واعتماده من لوحة المدير.`,
      senderEmail: settings.senderEmail,
    });
  }

  return { success: true };
}

export async function resetPasswordByPhone(data: {
  phone: string;
  password: string;
}): Promise<ActionResult> {
  if (!data.phone?.trim() || !data.password) {
    return { success: false, error: "رقم الجوال وكلمة المرور مطلوبان" };
  }
  if (data.password.length < 6) {
    return { success: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  }

  const user = await prisma.user.findFirst({
    where: { phone: data.phone.trim() },
  });
  if (!user) {
    return { success: false, error: "رقم الجوال غير مسجل" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(data.password) },
  });

  return { success: true };
}

export async function applyToOpportunity(
  opportunityId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "BENEFICIARY") {
    return { success: false, error: "غير مصرح" };
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return { success: false, error: "المستخدم غير موجود" };

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { success: false, error: "الفرصة غير موجودة" };
  }

  if (opportunity.status !== "متاحة") {
    return { success: false, error: "الفرصة غير متاحة حالياً" };
  }

  const targeted = await prisma.opportunityTarget.findUnique({
    where: {
      opportunityId_beneficiaryId: {
        opportunityId,
        beneficiaryId: session.id,
      },
    },
  });

  const canSee = beneficiaryCanSeeOpportunity(
    user.stage,
    opportunity.type,
    opportunity.id,
    targeted ? new Set([opportunityId]) : new Set()
  );

  if (!canSee) {
    return { success: false, error: "هذه الفرصة غير متاحة لمرحلتك الحالية" };
  }

  const existing = await prisma.application.findUnique({
    where: {
      beneficiaryId_opportunityId: {
        beneficiaryId: session.id,
        opportunityId,
      },
    },
  });
  if (existing) {
    return { success: false, error: "لقد تقدمت على هذه الفرصة مسبقاً" };
  }

  await prisma.application.create({
    data: {
      beneficiaryId: session.id,
      opportunityId,
      status: "PENDING",
    },
  });

  return { success: true };
}

export async function scheduleSession(data: {
  beneficiaryId: string;
  date: string;
  notes: string;
  meetingLink?: string;
  location?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: { id: data.beneficiaryId, role: "BENEFICIARY", guideId: session.id },
    select: { id: true, name: true, email: true },
  });
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  const guide = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true },
  });
  if (!guide) {
    return { success: false, error: "المرشد غير موجود" };
  }

  const date = new Date(data.date);
  if (Number.isNaN(date.getTime())) {
    return { success: false, error: "تاريخ غير صالح" };
  }

  const meetingLink = data.meetingLink?.trim() || null;
  const location = data.location?.trim() || null;

  await prisma.session.create({
    data: {
      beneficiaryId: data.beneficiaryId,
      guideId: session.id,
      date,
      notes: data.notes.trim(),
      meetingLink,
      location,
      status: "SCHEDULED",
    },
  });

  const dateStr = date.toLocaleString("ar-SA");
  await createNotification(
    data.beneficiaryId,
    "جلسة إرشاد مجدولة",
    `تم جدولة جلسة إرشاد في ${dateStr}.${meetingLink ? " يمكنك الانضمام عبر الرابط المرفق." : location ? ` الموقع: ${location}` : ""}`
  );

  const settings = await getSystemSettings();
  await sendSessionScheduledEmails({
    beneficiaryEmail: beneficiary.email,
    beneficiaryName: beneficiary.name,
    guideEmail: guide.email,
    guideName: guide.name,
    sessionDate: date,
    meetingLink,
    location,
    senderEmail: settings.senderEmail,
  });

  return { success: true };
}

export async function updateSession(data: {
  sessionId: string;
  date?: string;
  notes?: string;
  status?: SessionStatus;
  commitmentRating?: number | null;
  meetingLink?: string;
  location?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const existing = await prisma.session.findFirst({
    where: { id: data.sessionId, guideId: session.id },
  });
  if (!existing) {
    return { success: false, error: "الجلسة غير موجودة" };
  }

  const rating =
    data.commitmentRating != null ? Number(data.commitmentRating) : null;
  if (rating != null && (rating < 1 || rating > 5)) {
    return { success: false, error: "تقييم الالتزام يجب أن يكون بين 1 و 5" };
  }

  const date = data.date ? new Date(data.date) : undefined;
  if (date && Number.isNaN(date.getTime())) {
    return { success: false, error: "تاريخ غير صالح" };
  }

  const newStatus = data.status ?? existing.status;

  await prisma.session.update({
    where: { id: data.sessionId },
    data: {
      ...(date ? { date } : {}),
      ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(rating != null ? { commitmentRating: rating } : {}),
      ...(data.meetingLink !== undefined
        ? { meetingLink: data.meetingLink.trim() || null }
        : {}),
      ...(data.location !== undefined
        ? { location: data.location.trim() || null }
        : {}),
    },
  });

  const ratingApplies =
    rating != null &&
    (newStatus === "COMPLETED" ||
      newStatus === "ATTENDED" ||
      existing.status === "COMPLETED" ||
      existing.status === "ATTENDED");

  if (ratingApplies && existing.commitmentRating == null) {
    await prisma.user.update({
      where: { id: existing.beneficiaryId },
      data: {
        commitmentScore: { increment: rating * 4 },
        commitmentLevel: { increment: rating * 4 },
      },
    });
  }

  return { success: true };
}

/** Mark a scheduled session as attended with commitment rating — O(1) */
export async function markSessionAttended(data: {
  sessionId: string;
  commitmentRating: number;
}): Promise<ActionResult> {
  return updateSession({
    sessionId: data.sessionId,
    status: "ATTENDED",
    commitmentRating: data.commitmentRating,
  });
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const existing = await prisma.session.findFirst({
    where: { id: sessionId, guideId: session.id },
  });
  if (!existing) {
    return { success: false, error: "الجلسة غير موجودة" };
  }

  await prisma.session.delete({ where: { id: sessionId } });
  return { success: true };
}

export async function upsertCareerPlanTasks(data: {
  beneficiaryId: string;
  tasks: CareerPlanTask[];
  status?: CareerPlanStatus;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await assertGuideBeneficiary(session.id, data.beneficiaryId);
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  const existing = await prisma.careerPlan.findFirst({
    where: { beneficiaryId: data.beneficiaryId },
    orderBy: { updatedAt: "desc" },
  });

  const summary = data.tasks.map((t) => t.title).join("؛ ");

  if (existing) {
    await prisma.careerPlan.update({
      where: { id: existing.id },
      data: {
        tasks: data.tasks,
        ...(data.status ? { status: data.status } : {}),
      },
    });
  } else {
    await prisma.careerPlan.create({
      data: {
        beneficiaryId: data.beneficiaryId,
        tasks: data.tasks,
        status: data.status ?? "ACTIVE",
      },
    });
  }

  await prisma.user.update({
    where: { id: data.beneficiaryId },
    data: { careerPlan: summary },
  });

  return { success: true };
}

/** @deprecated kept for backward compatibility */
export async function updateCareerPlan(data: {
  beneficiaryId: string;
  careerPlan: string;
}): Promise<ActionResult> {
  const lines = data.careerPlan
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tasks: CareerPlanTask[] = lines.map((title, i) => ({
    id: `legacy-${i}`,
    title,
    done: false,
  }));
  return upsertCareerPlanTasks({
    beneficiaryId: data.beneficiaryId,
    tasks: tasks.length ? tasks : [{ id: "1", title: data.careerPlan.trim(), done: false }],
  });
}

export async function recommendStageUpgrade(
  beneficiaryId: string
): Promise<ActionResult & { pendingStage?: string }> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await assertGuideBeneficiary(session.id, beneficiaryId);
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  if (beneficiary.pendingStage) {
    return { success: false, error: "يوجد طلب انتقال معلّق بانتظار اعتماد المدير" };
  }

  const nextStage = getNextStage(beneficiary.stage);
  if (!nextStage) {
    return { success: false, error: "المستفيد في المرحلة النهائية" };
  }

  await prisma.user.update({
    where: { id: beneficiaryId },
    data: { pendingStage: nextStage },
  });

  const stageLabel =
    nextStage === "TRAINING"
      ? "الانتقال للتدريب"
      : `الانتقال إلى ${STAGE_LABELS[nextStage]}`;

  await notifyAdmins(
    "طلب توصية مرحلة",
    `المرشد ${session.name} يوصي ب${stageLabel} للمستفيد ${beneficiary.name}. يرجى الاعتماد.`
  );

  return { success: true, pendingStage: nextStage };
}

export async function createOpportunity(data: {
  type: OpportunityType;
  title: string;
  provider: string;
  duration: string;
  status: string;
  requirements: string;
  salary: string;
  jobType: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  if (!data.title || !data.provider || !data.duration || !data.status) {
    return { success: false, error: "جميع الحقول الأساسية مطلوبة" };
  }

  await prisma.opportunity.create({
    data: {
      type: data.type,
      title: data.title.trim(),
      provider: data.provider.trim(),
      duration: data.duration.trim(),
      status: data.status.trim(),
      requirements: data.requirements.trim(),
      salary: data.salary.trim() || null,
      jobType: data.jobType.trim() || null,
    },
  });

  return { success: true };
}

export async function updateOpportunity(
  id: string,
  data: Partial<{
    type: OpportunityType;
    title: string;
    provider: string;
    duration: string;
    status: string;
    requirements: string;
    salary: string;
    jobType: string;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const opp = await prisma.opportunity.findUnique({ where: { id } });
  if (!opp) return { success: false, error: "الفرصة غير موجودة" };

  await prisma.opportunity.update({
    where: { id },
    data: {
      ...(data.type ? { type: data.type } : {}),
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.provider !== undefined ? { provider: data.provider.trim() } : {}),
      ...(data.duration !== undefined ? { duration: data.duration.trim() } : {}),
      ...(data.status !== undefined ? { status: data.status.trim() } : {}),
      ...(data.requirements !== undefined
        ? { requirements: data.requirements.trim() }
        : {}),
      ...(data.salary !== undefined ? { salary: data.salary.trim() || null } : {}),
      ...(data.jobType !== undefined ? { jobType: data.jobType.trim() || null } : {}),
    },
  });

  return { success: true };
}

export async function deleteOpportunity(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const opp = await prisma.opportunity.findUnique({ where: { id } });
  if (!opp) return { success: false, error: "الفرصة غير موجودة" };

  await prisma.opportunity.delete({ where: { id } });
  return { success: true };
}

export async function createGuide(data: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  if (!data.name || !data.email || !data.phone || !data.password) {
    return { success: false, error: "جميع الحقول مطلوبة" };
  }

  const email = data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "البريد مسجل مسبقاً" };
  }

  await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      phone: data.phone.trim(),
      password: await hashPassword(data.password),
      role: "GUIDE",
      stage: "PENDING_APPROVAL",
    },
  });

  return { success: true };
}

export async function updateGuide(
  id: string,
  data: Partial<{ name: string; email: string; phone: string; password: string }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const guide = await prisma.user.findFirst({ where: { id, role: "GUIDE" } });
  if (!guide) return { success: false, error: "المرشد غير موجود" };

  await prisma.user.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.email !== undefined
        ? { email: data.email.toLowerCase().trim() }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}),
      ...(data.password
        ? { password: await hashPassword(data.password) }
        : {}),
    },
  });

  return { success: true };
}

export async function deleteGuide(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const guide = await prisma.user.findFirst({ where: { id, role: "GUIDE" } });
  if (!guide) return { success: false, error: "المرشد غير موجود" };

  const assigned = await prisma.user.count({ where: { guideId: id } });
  if (assigned > 0) {
    return {
      success: false,
      error: "لا يمكن حذف مرشد لديه مستفيدون مسندون",
    };
  }

  await prisma.user.delete({ where: { id } });
  return { success: true };
}

export async function assignGuideToBeneficiary(data: {
  beneficiaryId: string;
  guideId: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: { id: data.beneficiaryId, role: "BENEFICIARY" },
  });
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  if (data.guideId) {
    const guide = await prisma.user.findFirst({
      where: { id: data.guideId, role: "GUIDE" },
    });
    if (!guide) return { success: false, error: "المرشد غير موجود" };
  }

  await prisma.user.update({
    where: { id: data.beneficiaryId },
    data: { guideId: data.guideId },
  });

  return { success: true };
}

/** Admin updates beneficiary profile fields — O(1) */
export async function adminUpdateBeneficiary(
  beneficiaryId: string,
  data: {
    phone?: string;
    educationLevel?: string;
    experience?: string;
    skills?: string;
    careerInterests?: string;
    guideId?: string | null;
  }
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: { id: beneficiaryId, role: "BENEFICIARY" },
  });
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  if (data.guideId) {
    const guide = await prisma.user.findFirst({
      where: { id: data.guideId, role: "GUIDE" },
    });
    if (!guide) return { success: false, error: "المرشد غير موجود" };
  }

  await prisma.user.update({
    where: { id: beneficiaryId },
    data: {
      ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}),
      ...(data.educationLevel !== undefined
        ? { educationLevel: data.educationLevel.trim() }
        : {}),
      ...(data.experience !== undefined ? { experience: data.experience.trim() } : {}),
      ...(data.skills !== undefined ? { skills: data.skills.trim() } : {}),
      ...(data.careerInterests !== undefined
        ? { careerInterests: data.careerInterests.trim() }
        : {}),
      ...(data.guideId !== undefined ? { guideId: data.guideId } : {}),
    },
  });

  return { success: true };
}

export async function createFollowUp(data: {
  beneficiaryId: string;
  month: number;
  status?: FollowUpStatus;
  notes?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  if (![1, 2, 3, 4, 5, 6].includes(data.month)) {
    return { success: false, error: "شهر المتابعة يجب أن يكون بين 1 و 6" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: {
      id: data.beneficiaryId,
      role: "BENEFICIARY",
      OR: [{ stage: "FOLLOW_UP" }, { stage: "EMPLOYMENT" }, { isEmployed: true }],
    },
  });
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود أو غير مؤهل للمتابعة" };
  }

  try {
    await prisma.followUp.create({
      data: {
        beneficiaryId: data.beneficiaryId,
        month: data.month,
        status: data.status ?? "PENDING",
        notes: data.notes?.trim() ?? "",
      },
    });
  } catch {
    return { success: false, error: "سجل متابعة لهذا الشهر موجود مسبقاً" };
  }

  return { success: true };
}

export async function updateFollowUp(
  id: string,
  data: Partial<{ status: FollowUpStatus; notes: string }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const record = await prisma.followUp.findUnique({ where: { id } });
  if (!record) return { success: false, error: "السجل غير موجود" };

  await prisma.followUp.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
    },
  });

  return { success: true };
}

export async function deleteFollowUp(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const record = await prisma.followUp.findUnique({ where: { id } });
  if (!record) return { success: false, error: "السجل غير موجود" };

  await prisma.followUp.delete({ where: { id } });
  return { success: true };
}

export async function updateBeneficiaryProfile(data: {
  educationLevel: string;
  experience: string;
  skills: string;
  careerInterests: string;
  phone: string;
  cvUrl?: string;
  certificatesUrls?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "BENEFICIARY") {
    return { success: false, error: "غير مصرح" };
  }

  if (!data.phone?.trim()) {
    return { success: false, error: "رقم الجوال مطلوب" };
  }

  await prisma.user.update({
    where: { id: session.id },
    data: {
      educationLevel: data.educationLevel.trim(),
      experience: data.experience.trim(),
      skills: data.skills.trim(),
      careerInterests: data.careerInterests.trim(),
      phone: data.phone.trim(),
      ...(data.cvUrl !== undefined ? { cvUrl: data.cvUrl || null } : {}),
      ...(data.certificatesUrls !== undefined
        ? { certificatesUrls: data.certificatesUrls || null }
        : {}),
    },
  });

  return { success: true };
}

export async function setOpportunityTargets(
  opportunityId: string,
  beneficiaryIds: string[]
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp) return { success: false, error: "الفرصة غير موجودة" };

  const validIds = await prisma.user.findMany({
    where: { id: { in: beneficiaryIds }, role: "BENEFICIARY" },
    select: { id: true },
  });
  const idSet = new Set(validIds.map((b) => b.id));

  const existingTargets = await prisma.opportunityTarget.findMany({
    where: { opportunityId },
    select: { beneficiaryId: true },
  });
  const existingSet = new Set(existingTargets.map((t) => t.beneficiaryId));

  await prisma.$transaction(async (tx) => {
    await tx.opportunityTarget.deleteMany({ where: { opportunityId } });
    if (idSet.size > 0) {
      await tx.opportunityTarget.createMany({
        data: [...idSet].map((beneficiaryId) => ({ opportunityId, beneficiaryId })),
      });
    }
  });

  for (const beneficiaryId of idSet) {
    if (!existingSet.has(beneficiaryId)) {
      await createNotification(
        beneficiaryId,
        "فرصة جديدة موجهة إليك",
        `تم استهدافك لفرصة: ${opp.title} (${opp.provider}). راجع لوحة المستفيد للتفاصيل.`
      );
    }
  }

  return { success: true };
}

/** List tasks for a beneficiary — O(n) where n = task count */
export async function listTasksForBeneficiary(beneficiaryId: string) {
  return prisma.task.findMany({
    where: { beneficiaryId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      isCompleted: true,
      createdAt: true,
    },
  });
}

export async function createTask(data: {
  beneficiaryId: string;
  title: string;
  description?: string;
}): Promise<ActionResult & { taskId?: string }> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await assertGuideBeneficiary(session.id, data.beneficiaryId);
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  if (!data.title?.trim()) {
    return { success: false, error: "عنوان المهمة مطلوب" };
  }

  const task = await prisma.task.create({
    data: {
      beneficiaryId: data.beneficiaryId,
      guideId: session.id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
    },
  });

  return { success: true, taskId: task.id };
}

/** Update task title/description — O(1) */
export async function updateTask(data: {
  taskId: string;
  title?: string;
  description?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const existing = await prisma.task.findFirst({
    where: { id: data.taskId, guideId: session.id },
  });
  if (!existing) {
    return { success: false, error: "المهمة غير موجودة" };
  }

  if (data.title !== undefined && !data.title.trim()) {
    return { success: false, error: "عنوان المهمة مطلوب" };
  }

  await prisma.task.update({
    where: { id: data.taskId },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined
        ? { description: data.description.trim() || null }
        : {}),
    },
  });

  return { success: true };
}

/** Delete task — O(1) */
export async function deleteTask(taskId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const existing = await prisma.task.findFirst({
    where: { id: taskId, guideId: session.id },
  });
  if (!existing) {
    return { success: false, error: "المهمة غير موجودة" };
  }

  await prisma.task.delete({ where: { id: taskId } });
  return { success: true };
}

/** Toggle task completion by beneficiary — O(1) */
export async function toggleTaskCompletion(taskId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "BENEFICIARY") {
    return { success: false, error: "غير مصرح" };
  }

  const existing = await prisma.task.findFirst({
    where: { id: taskId, beneficiaryId: session.id },
  });
  if (!existing) {
    return { success: false, error: "المهمة غير موجودة" };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { isCompleted: !existing.isCompleted },
  });

  return { success: true };
}

/** Admin approves PENDING_APPROVAL → GUIDANCE — O(1) */
export async function approveRegistration(
  beneficiaryId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: { id: beneficiaryId, role: "BENEFICIARY", stage: "PENDING_APPROVAL" },
  });
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود أو ليس بانتظار الاعتماد" };
  }
  if (!beneficiary.guideId) {
    return { success: false, error: "يجب إسناد مرشد قبل اعتماد التسجيل" };
  }

  await prisma.user.update({
    where: { id: beneficiaryId },
    data: {
      stage: "GUIDANCE",
      stageEnteredAt: new Date(),
      pendingStage: null,
    },
  });

  await createNotification(
    beneficiaryId,
    "تم اعتماد تسجيلك",
    "تم اعتماد حسابك في منصة تمكين. يمكنك الآن البدء بمرحلة الإرشاد."
  );

  const settings = await getSystemSettings();
  const { sendGenericEmail } = await import("@/lib/email-notify");
  await sendGenericEmail({
    to: beneficiary.email,
    subject: "تم اعتماد تسجيلك في منصة تمكين",
    body: `مرحباً ${beneficiary.name}،\n\nتم اعتماد حسابك. يمكنك تسجيل الدخول والبدء بمرحلة الإرشاد.\n\nمع تحيات فريق منصة تمكين`,
    senderEmail: settings.senderEmail,
  });

  return { success: true };
}

/** Admin approves pending stage transition — O(1) */
export async function approveStageTransition(
  beneficiaryId: string
): Promise<ActionResult & { stage?: string }> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await prisma.user.findFirst({
    where: { id: beneficiaryId, role: "BENEFICIARY" },
  });
  if (!beneficiary || !beneficiary.pendingStage) {
    return { success: false, error: "لا يوجد طلب انتقال معلّق" };
  }

  const newStage = beneficiary.pendingStage;

  await prisma.user.update({
    where: { id: beneficiaryId },
    data: {
      stage: newStage,
      pendingStage: null,
      stageEnteredAt: new Date(),
      ...(newStage === "EMPLOYMENT" ? { isEmployed: true } : {}),
    },
  });

  await createNotification(
    beneficiaryId,
    "تحديث مرحلتك",
    `تم اعتماد انتقالك إلى مرحلة: ${STAGE_LABELS[newStage]}.`
  );

  if (newStage === "FOLLOW_UP") {
    const { initializeFollowUpProgram } = await import("@/lib/follow-up-service");
    await initializeFollowUpProgram(beneficiaryId);
  }

  const settings = await getSystemSettings();
  const { sendGenericEmail } = await import("@/lib/email-notify");
  await sendGenericEmail({
    to: beneficiary.email,
    subject: `انتقال إلى مرحلة ${STAGE_LABELS[newStage]}`,
    body: `مرحباً ${beneficiary.name}،\n\nتم اعتماد انتقالك إلى مرحلة: ${STAGE_LABELS[newStage]}.\n\nمع تحيات فريق منصة تمكين`,
    senderEmail: settings.senderEmail,
  });

  return { success: true, stage: newStage };
}

/** Guide edits beneficiary profile sections — O(1) */
export async function updateBeneficiaryByGuide(
  beneficiaryId: string,
  data: {
    cvContent?: string;
    professionalRecommendations?: string;
    selectedTrainingCourseIds?: string[];
    educationLevel?: string;
    experience?: string;
    skills?: string;
    careerInterests?: string;
  }
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "GUIDE") {
    return { success: false, error: "غير مصرح" };
  }

  const beneficiary = await assertGuideBeneficiary(session.id, beneficiaryId);
  if (!beneficiary) {
    return { success: false, error: "المستفيد غير موجود" };
  }

  await prisma.user.update({
    where: { id: beneficiaryId },
    data: {
      ...(data.cvContent !== undefined ? { cvContent: data.cvContent.trim() } : {}),
      ...(data.professionalRecommendations !== undefined
        ? { professionalRecommendations: data.professionalRecommendations.trim() }
        : {}),
      ...(data.selectedTrainingCourseIds !== undefined
        ? { selectedTrainingCourseIds: JSON.stringify(data.selectedTrainingCourseIds) }
        : {}),
      ...(data.educationLevel !== undefined
        ? { educationLevel: data.educationLevel.trim() }
        : {}),
      ...(data.experience !== undefined ? { experience: data.experience.trim() } : {}),
      ...(data.skills !== undefined ? { skills: data.skills.trim() } : {}),
      ...(data.careerInterests !== undefined
        ? { careerInterests: data.careerInterests.trim() }
        : {}),
    },
  });

  return { success: true };
}

/** Admin reviews application — O(1) */
export async function reviewApplication(data: {
  applicationId: string;
  status: "ACCEPTED" | "REJECTED";
  reviewNote?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "غير مصرح" };
  }

  const app = await prisma.application.findUnique({
    where: { id: data.applicationId },
    include: {
      beneficiary: { select: { id: true, name: true, email: true, stage: true } },
      opportunity: { select: { title: true, type: true } },
    },
  });

  if (!app) return { success: false, error: "التقديم غير موجود" };
  if (app.status !== "PENDING") {
    return { success: false, error: "تمت مراجعة هذا التقديم مسبقاً" };
  }

  await prisma.application.update({
    where: { id: data.applicationId },
    data: {
      status: data.status,
      reviewNote: data.reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
  });

  const statusLabel = data.status === "ACCEPTED" ? "مقبول" : "مرفوض";
  await createNotification(
    app.beneficiaryId,
    `تحديث حالة التقديم — ${statusLabel}`,
    `تقديمك على "${app.opportunity.title}": ${statusLabel}.${data.reviewNote ? ` ملاحظة: ${data.reviewNote}` : ""}`
  );

  const settings = await getSystemSettings();
  const { sendGenericEmail } = await import("@/lib/email-notify");
  await sendGenericEmail({
    to: app.beneficiary.email,
    subject: `تحديث تقديمك — ${app.opportunity.title}`,
    body: `مرحباً ${app.beneficiary.name}،\n\nتم ${statusLabel} تقديمك على "${app.opportunity.title}".${data.reviewNote ? `\n\nملاحظة: ${data.reviewNote}` : ""}\n\nمع تحيات فريق منصة تمكين`,
    senderEmail: settings.senderEmail,
  });

  if (
    data.status === "ACCEPTED" &&
    app.opportunity.type === "TRAINING" &&
    app.beneficiary.stage === "GUIDANCE"
  ) {
    await prisma.user.update({
      where: { id: app.beneficiaryId },
      data: { pendingStage: "TRAINING" },
    });
    await createNotification(
      app.beneficiaryId,
      "توصية بالانتقال للتدريب",
      "تم قبول تقديمك التدريبي. طلب الانتقال للتدريب بانتظار اعتماد المدير."
    );
  }

  return { success: true };
}

export { parseTasks };
