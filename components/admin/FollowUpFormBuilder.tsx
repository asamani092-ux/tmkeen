"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import FollowUpQuestionEditor, {
  type FollowUpQuestionDraft,
} from "@/components/admin/FollowUpQuestionEditor";
import FollowUpFormPreview from "@/components/admin/FollowUpFormPreview";
import { toastSuccess, toastError } from "@/lib/toast";
import { Pencil, Trash2, Eye, ChevronUp, ChevronDown } from "lucide-react";

type Question = {
  id: string;
  month: number;
  label: string;
  fieldType: string;
  options: string[];
  sortOrder: number;
  required: boolean;
  helperText: string;
};

export default function FollowUpFormBuilder() {
  const router = useRouter();
  const [month, setMonth] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadQuestions(m: number) {
    setLoading(true);
    const res = await fetch(`/api/follow-up-form/questions?month=${m}`);
    const data = await res.json();
    setQuestions(
      (data.questions ?? []).map((q: Question & { options: unknown }) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options.map(String) : [],
      }))
    );
    setLoading(false);
  }

  function onMonthChange(m: number) {
    setMonth(m);
    setPreview(false);
    setEditingId(null);
    loadQuestions(m);
  }

  useEffect(() => {
    loadQuestions(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAdd(draft: FollowUpQuestionDraft) {
    startTransition(async () => {
      const res = await fetch("/api/follow-up-form/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          label: draft.label,
          fieldType: draft.fieldType,
          options: draft.options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          required: draft.required,
          helperText: draft.helperText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل الإضافة");
        return;
      }
      toastSuccess("تمت إضافة السؤال");
      await loadQuestions(month);
      router.refresh();
    });
  }

  function handleUpdate(id: string, draft: FollowUpQuestionDraft) {
    startTransition(async () => {
      const res = await fetch(`/api/follow-up-form/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          fieldType: draft.fieldType,
          options: draft.options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          required: draft.required,
          helperText: draft.helperText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل التحديث");
        return;
      }
      toastSuccess("تم تحديث السؤال");
      setEditingId(null);
      await loadQuestions(month);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/follow-up-form/questions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toastError("فشل الحذف");
        return;
      }
      toastSuccess("تم الحذف");
      if (editingId === id) setEditingId(null);
      await loadQuestions(month);
    });
  }

  function moveQuestion(id: string, direction: "up" | "down") {
    const sorted = [...monthQuestions].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((q) => q.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;

    startTransition(async () => {
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const resA = await fetch(`/api/follow-up-form/questions/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      });
      const resB = await fetch(`/api/follow-up-form/questions/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      });
      if (!resA.ok || !resB.ok) {
        toastError("فشل إعادة الترتيب");
        return;
      }
      await loadQuestions(month);
    });
  }

  const monthQuestions = questions
    .filter((q) => q.month === month)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const editingQuestion = editingId
    ? monthQuestions.find((q) => q.id === editingId)
    : null;

  return (
    <div className="card space-y-4">
      <h3 className="text-lg font-bold text-primary">نماذج متابعة ما بعد التوظيف</h3>
      <p className="text-sm text-brand-gray">
        أنشئ أسئلة لكل شهر (1–6). يظهر للمستفيد نموذج الشهر النشط فقط.
      </p>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMonthChange(m)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              month === m ? "bg-primary text-white" : "bg-surface-muted text-brand-gray"
            }`}
          >
            شهر {m}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="ms-auto flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1.5 text-sm"
        >
          <Eye className="h-4 w-4" />
          {preview ? "إخفاء المعاينة" : "معاينة"}
        </button>
      </div>

      {preview ? (
        <FollowUpFormPreview month={month} questions={monthQuestions} />
      ) : (
        <>
          {loading ? (
            <p className="text-sm text-brand-gray">جاري التحميل...</p>
          ) : (
            <ul className="space-y-2">
              {monthQuestions.map((q, i) => (
                <li
                  key={q.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-surface-border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <p className="font-semibold text-primary">{q.label}</p>
                    <p className="text-xs text-brand-gray">
                      {q.fieldType}
                      {q.required ? " · مطلوب" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, "up")}
                      disabled={pending || i === 0}
                      className="rounded p-1 text-brand-gray hover:bg-surface-muted disabled:opacity-40"
                      title="أعلى"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, "down")}
                      disabled={pending || i === monthQuestions.length - 1}
                      className="rounded p-1 text-brand-gray hover:bg-surface-muted disabled:opacity-40"
                      title="أسفل"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(q.id)}
                      disabled={pending}
                      className="rounded p-1 text-primary hover:bg-surface-muted"
                      title="تعديل"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(q.id)}
                      disabled={pending}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      title="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editingQuestion ? (
            <FollowUpQuestionEditor
              month={month}
              initial={{
                label: editingQuestion.label,
                fieldType: editingQuestion.fieldType,
                options: editingQuestion.options.join(", "),
                required: editingQuestion.required,
                helperText: editingQuestion.helperText,
              }}
              loading={pending}
              submitLabel="حفظ التعديل"
              onSubmit={(draft) => handleUpdate(editingQuestion.id, draft)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <FollowUpQuestionEditor
              month={month}
              loading={pending}
              submitLabel="إضافة السؤال"
              onSubmit={handleAdd}
            />
          )}
        </>
      )}
    </div>
  );
}
