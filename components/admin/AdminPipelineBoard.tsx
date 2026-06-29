"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Stage } from "@/generated/prisma/client";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/stages";
import FloatingModal from "@/components/admin/FloatingModal";
import { toastSuccess, toastError } from "@/lib/toast";
import { CheckCircle, ExternalLink } from "lucide-react";

type PipelineBeneficiary = {
  id: string;
  name: string;
  phone: string;
  stage: Stage;
  pendingStage: Stage | null;
  guideName: string | null;
};

type OpenView = Stage | "pending-requests";

type Props = {
  beneficiaries: PipelineBeneficiary[];
};

export default function AdminPipelineBoard({ beneficiaries }: Props) {
  const router = useRouter();
  const [openView, setOpenView] = useState<OpenView | null>(null);
  const [quickView, setQuickView] = useState<PipelineBeneficiary | null>(null);
  const [pending, startTransition] = useTransition();

  const byStage = STAGE_ORDER.reduce(
    (acc, stage) => {
      acc[stage] = beneficiaries.filter((b) => b.stage === stage);
      return acc;
    },
    {} as Record<Stage, PipelineBeneficiary[]>
  );

  const pendingRequests = beneficiaries.filter((b) => b.pendingStage);
  const pendingTotal = pendingRequests.length;

  function approve(beneficiaryId: string, action: "registration" | "transition") {
    startTransition(async () => {
      const res = await fetch("/api/stage-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل الاعتماد");
        return;
      }
      toastSuccess("تم الاعتماد بنجاح");
      router.refresh();
    });
  }

  const modalList =
    openView === "pending-requests"
      ? pendingRequests
      : openView
        ? byStage[openView]
        : [];

  const modalTitle =
    openView === "pending-requests"
      ? `طلبات انتقال معلّقة (${pendingTotal})`
      : openView
        ? `${STAGE_LABELS[openView]} (${modalList.length})`
        : "";

  return (
    <>
      <div className="card">
        <h2 className="mb-4 text-xl font-bold text-primary">لوحة تتبع المسار (Pipeline)</h2>
        <p className="mb-4 text-sm text-brand-gray">
          انقر على أي مرحلة لعرض المستفيدين واعتماد الانتقالات
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {STAGE_ORDER.map((stage) => {
            const count = byStage[stage].length;
            const pendingCount = byStage[stage].filter((b) => b.pendingStage).length;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setOpenView(stage)}
                className="rounded-xl border-2 border-surface-border bg-surface-muted/50 p-4 text-start transition hover:border-primary hover:bg-primary/5"
              >
                <p className="text-sm font-bold text-primary">{STAGE_LABELS[stage]}</p>
                <p className="mt-2 text-3xl font-bold text-primary">{count}</p>
                {pendingCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-red-800">
                    {pendingCount} طلب معلّق
                  </p>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpenView("pending-requests")}
            className="rounded-xl border-2 border-red-200 bg-red-50/50 p-4 text-start transition hover:border-primary"
          >
            <p className="text-sm font-bold text-primary">طلبات معلّقة</p>
            <p className="mt-2 text-3xl font-bold text-primary">{pendingTotal}</p>
          </button>
        </div>
      </div>

      {openView && (
        <FloatingModal title={modalTitle} onClose={() => setOpenView(null)} wide>
          {modalList.length === 0 ? (
            <p className="text-center text-brand-gray">لا يوجد مستفيدون</p>
          ) : (
            <ul className="space-y-3">
              {modalList.map((b) => (
                <li
                  key={b.id}
                  className="cursor-pointer rounded-lg border border-surface-border bg-surface p-4 text-start text-sm transition hover:border-primary"
                  onClick={() => setQuickView(b)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 font-bold text-primary">{b.name}</p>
                    <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {b.stage === "PENDING_APPROVAL" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => approve(b.id, "registration")}
                          className="btn-primary !px-3 !py-1.5 text-xs"
                        >
                          <CheckCircle className="inline h-3 w-3" />
                          اعتماد التسجيل
                        </button>
                      )}
                      {b.pendingStage && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => approve(b.id, "transition")}
                          className="btn-primary !px-3 !py-1.5 text-xs"
                        >
                          <CheckCircle className="inline h-3 w-3" />
                          اعتماد {STAGE_LABELS[b.pendingStage]}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-brand-gray" dir="ltr">{b.phone}</p>
                  {b.guideName && (
                    <p className="mt-2 text-brand-gray">المرشد: {b.guideName}</p>
                  )}
                  {b.pendingStage && (
                    <p className="mt-2 inline-block rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-red-900">
                      طلب: {STAGE_LABELS[b.pendingStage]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </FloatingModal>
      )}

      {quickView && (
        <FloatingModal
          title={`عرض سريع — ${quickView.name}`}
          onClose={() => setQuickView(null)}
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-brand-gray">الجوال</dt>
              <dd dir="ltr">{quickView.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-gray">المرحلة</dt>
              <dd className="font-semibold text-primary">{STAGE_LABELS[quickView.stage]}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-gray">المرشد</dt>
              <dd>{quickView.guideName ?? "—"}</dd>
            </div>
            {quickView.pendingStage && (
              <div>
                <dt className="text-xs text-brand-gray">طلب معلّق</dt>
                <dd>{STAGE_LABELS[quickView.pendingStage]}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickView.pendingStage && (
              <button
                type="button"
                disabled={pending}
                onClick={() => approve(quickView.id, "transition")}
                className="btn-primary !px-3 !py-2 text-sm"
              >
                <CheckCircle className="inline h-4 w-4" />
                الانتقال للمرحلة التالية
              </button>
            )}
            <a
              href={`/dashboard/admin?tab=management&beneficiary=${quickView.id}`}
              className="btn-secondary inline-flex !px-3 !py-2 text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              عرض الملف الكامل
            </a>
          </div>
        </FloatingModal>
      )}
    </>
  );
}
