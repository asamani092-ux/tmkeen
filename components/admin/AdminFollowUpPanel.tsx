"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FloatingModal from "@/components/admin/FloatingModal";
import SubmitButton from "@/components/ui/SubmitButton";
import { useSyncFromProps } from "@/lib/use-sync-from-props";
import { toastSuccess, toastError } from "@/lib/toast";
import { FOLLOW_UP_STATUS_LABELS } from "@/lib/labels";
import { Eye, Trash2 } from "lucide-react";

type FollowUp = {
  id: string;
  month: number;
  status: string;
  notes: string;
  answers?: Record<string, string> | null;
  beneficiary: { id: string; name: string; phone: string };
};

type EmployedBeneficiary = {
  id: string;
  name: string;
  phone?: string;
};

type Props = {
  followUps: FollowUp[];
  employedBeneficiaries: EmployedBeneficiary[];
};

type GroupedBeneficiary = {
  id: string;
  name: string;
  phone: string;
  records: FollowUp[];
};

function MonthProgress({ records }: { records: FollowUp[] }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5, 6].map((m) => {
        const r = records.find((x) => x.month === m);
        const color =
          r?.status === "COMPLETED"
            ? "bg-green-600"
            : r?.status === "MISSED"
              ? "bg-red-500"
              : r
                ? "bg-yellow-400"
                : "bg-surface-border";
        return (
          <span
            key={m}
            className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
            title={`شهر ${m}`}
          />
        );
      })}
    </div>
  );
}

export default function AdminFollowUpPanel({
  followUps: initial,
  employedBeneficiaries,
}: Props) {
  const router = useRouter();
  const [followUps, setFollowUps] = useSyncFromProps(initial);
  const [selected, setSelected] = useState<GroupedBeneficiary | null>(null);
  const [viewAnswers, setViewAnswers] = useState<FollowUp | null>(null);
  const [answerLabels, setAnswerLabels] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedBeneficiary>();
    for (const f of followUps) {
      const id = f.beneficiary.id;
      const existing = map.get(id);
      if (existing) {
        existing.records.push(f);
      } else {
        map.set(id, {
          id,
          name: f.beneficiary.name,
          phone: f.beneficiary.phone,
          records: [f],
        });
      }
    }
    for (const b of employedBeneficiaries) {
      if (!map.has(b.id)) {
        map.set(b.id, {
          id: b.id,
          name: b.name,
          phone: b.phone ?? "—",
          records: [],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [followUps, employedBeneficiaries]);

  async function openAnswers(record: FollowUp) {
    setViewAnswers(record);
    const res = await fetch(`/api/follow-up-form/questions?month=${record.month}`);
    const data = await res.json();
    const labels: Record<string, string> = {};
    for (const q of data.questions ?? []) {
      labels[q.id] = q.label;
    }
    setAnswerLabels(labels);
  }

  function programAction(beneficiaryId: string, action: "complete" | "withdraw") {
    let reason: string | undefined;
    if (action === "withdraw") {
      reason = window.prompt("سبب السحب من المتابعة (اختياري):") ?? undefined;
      if (reason === null) return;
    }
    startTransition(async () => {
      const res = await fetch("/api/follow-up-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, action, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل العملية");
        return;
      }
      toastSuccess(action === "complete" ? "تم إكمال البرنامج" : "تم سحب المستفيد");
      setSelected(null);
      router.refresh();
    });
  }

  async function handleSaveNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const notes = new FormData(e.currentTarget).get("notes") as string;
    const latest = [...selected.records].sort((a, b) => b.month - a.month)[0];
    if (!latest) {
      toastError("لا يوجد سجل متابعة — يبدأ البرنامج تلقائياً عند دخول مرحلة FOLLOW_UP");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/follow-ups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: latest.id, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل الحفظ");
        return;
      }
      toastSuccess("تم حفظ الملاحظة");
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch("/api/follow-ups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toastError("فشل الحذف");
        return;
      }
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
      router.refresh();
    });
  }

  return (
    <>
      <div className="card overflow-x-auto p-0">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="text-xl font-bold text-primary">متابعة ما بعد التوظيف</h2>
          <p className="mt-1 text-sm text-brand-gray">
            برنامج 6 أشهر — انقر على المستفيد للتفاصيل والإجراءات
          </p>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-primary/5 text-primary">
            <tr>
              <th className="px-4 py-3">المستفيد</th>
              <th className="px-4 py-3">الجوال</th>
              <th className="px-4 py-3">التقدم (6 أشهر)</th>
              <th className="px-4 py-3">آخر حالة</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-gray">
                  لا يوجد مستفيدون في متابعة ما بعد التوظيف
                </td>
              </tr>
            ) : (
              grouped.map((g) => {
                const sorted = [...g.records].sort((a, b) => b.month - a.month);
                const latest = sorted[0];
                return (
                  <tr
                    key={g.id}
                    onClick={() => setSelected(g)}
                    className="cursor-pointer border-t border-surface-border transition hover:bg-secondary/10"
                  >
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                      {g.phone}
                    </td>
                    <td className="px-4 py-3">
                      <MonthProgress records={g.records} />
                    </td>
                    <td className="px-4 py-3">
                      {latest
                        ? FOLLOW_UP_STATUS_LABELS[
                            latest.status as keyof typeof FOLLOW_UP_STATUS_LABELS
                          ] ?? latest.status
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <FloatingModal title={`متابعة: ${selected.name}`} onClose={() => setSelected(null)} wide>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => programAction(selected.id, "complete")}
              disabled={pending}
              className="btn-primary !px-3 !py-1.5 text-xs"
            >
              إكمال البرنامج
            </button>
            <button
              type="button"
              onClick={() => programAction(selected.id, "withdraw")}
              disabled={pending}
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              سحب من المتابعة
            </button>
          </div>

          <ul className="mb-6 max-h-56 space-y-2 overflow-y-auto">
            {[...selected.records]
              .sort((a, b) => a.month - b.month)
              .map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-2 rounded-lg border border-surface-border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <p className="font-semibold text-primary">شهر {f.month}</p>
                    <p className="text-brand-gray">
                      {FOLLOW_UP_STATUS_LABELS[
                        f.status as keyof typeof FOLLOW_UP_STATUS_LABELS
                      ] ?? f.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {f.status === "COMPLETED" && f.answers && (
                      <button
                        type="button"
                        onClick={() => openAnswers(f)}
                        className="rounded p-1 text-primary hover:bg-surface-muted"
                        title="عرض الإجابات"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id)}
                      disabled={pending}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
          </ul>

          <form onSubmit={handleSaveNote} className="space-y-3 border-t border-surface-border pt-4">
            <h3 className="font-bold text-primary">ملاحظة إدارية</h3>
            <textarea name="notes" rows={2} className="input-field resize-none" placeholder="ملاحظات على المستفيد..." required />
            <SubmitButton loading={pending} className="btn-primary w-full !py-2 text-sm">
              حفظ الملاحظة
            </SubmitButton>
          </form>
        </FloatingModal>
      )}

      {viewAnswers && (
        <FloatingModal
          title={`إجابات — شهر ${viewAnswers.month}`}
          onClose={() => setViewAnswers(null)}
        >
          <dl className="space-y-3">
            {Object.entries(viewAnswers.answers ?? {}).map(([qid, ans]) => (
              <div key={qid}>
                <dt className="text-xs font-semibold text-brand-gray">
                  {answerLabels[qid] ?? qid}
                </dt>
                <dd className="text-primary">{ans}</dd>
              </div>
            ))}
          </dl>
        </FloatingModal>
      )}
    </>
  );
}
