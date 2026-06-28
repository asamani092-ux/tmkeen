"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SubmitButton from "@/components/ui/SubmitButton";
import { toastSuccess, toastError } from "@/lib/toast";
import { formatDaysRemaining } from "@/lib/follow-up-program";
import { ClipboardList } from "lucide-react";

type Question = {
  id: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  helperText: string;
};

type FollowUpRecord = {
  month: number;
  status: string;
  submittedAt: string | null;
  dueAt: string | null;
};

type Props = {
  activeMonth: number | null;
  questions: Question[];
  records: FollowUpRecord[];
};

export default function FollowUpMonthForm({ activeMonth, questions, records }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!activeMonth) {
    return (
      <section className="card">
        <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-primary">
          <ClipboardList className="h-6 w-6" />
          متابعة ما بعد التوظيف
        </h2>
        <p className="text-brand-gray">انتهى برنامج المتابعة أو لم يبدأ بعد.</p>
      </section>
    );
  }

  const current = records.find((r) => r.month === activeMonth);
  if (current?.status === "COMPLETED") {
    return (
      <section className="card">
        <h2 className="mb-2 text-xl font-bold text-primary">متابعة — الشهر {activeMonth}</h2>
        <p className="text-green-700">تم إرسال نموذج هذا الشهر بنجاح.</p>
      </section>
    );
  }

  const dueLabel =
    current?.dueAt ? formatDaysRemaining(new Date(current.dueAt)) : "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/follow-up-program/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: activeMonth, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "فشل الإرسال");
        return;
      }
      toastSuccess("تم إرسال النموذج بنجاح");
      router.refresh();
    });
  }

  return (
    <section className="card border-2 border-primary/20">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-primary">
        <ClipboardList className="h-6 w-6" />
        متابعة ما بعد التوظيف — الشهر {activeMonth}
      </h2>
      {dueLabel && <p className="mb-4 text-sm text-brand-gray">{dueLabel}</p>}

      {questions.length === 0 ? (
        <p className="text-brand-gray">لم يُعدّ المدير أسئلة هذا الشهر بعد.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {questions.map((q) => (
            <div key={q.id}>
              <label className="label-field">
                {q.label}
                {q.required ? " *" : ""}
              </label>
              {q.helperText && (
                <p className="mb-1 text-xs text-brand-gray">{q.helperText}</p>
              )}
              {q.fieldType === "textarea" ? (
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  required={q.required}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                />
              ) : q.fieldType === "yes_no" ? (
                <select
                  className="input-field"
                  required={q.required}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                >
                  <option value="">اختر...</option>
                  <option value="نعم">نعم</option>
                  <option value="لا">لا</option>
                </select>
              ) : q.fieldType === "select" ? (
                <select
                  className="input-field"
                  required={q.required}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                >
                  <option value="">اختر...</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : q.fieldType === "radio" ? (
                <div className="flex flex-wrap gap-4">
                  {q.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={o}
                        required={q.required}
                        checked={answers[q.id] === o}
                        onChange={() =>
                          setAnswers((a) => ({ ...a, [q.id]: o }))
                        }
                      />
                      {o}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="input-field"
                  required={q.required}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
          <SubmitButton loading={pending} className="btn-primary w-full">
            إرسال النموذج
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
