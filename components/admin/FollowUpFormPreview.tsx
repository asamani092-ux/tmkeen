"use client";

type PreviewQuestion = {
  id: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  helperText: string;
};

type Props = {
  month: number;
  questions: PreviewQuestion[];
};

export default function FollowUpFormPreview({ month, questions }: Props) {
  return (
    <div className="card-section space-y-3">
      <p className="font-semibold text-primary">معاينة — شهر {month}</p>
      {questions.length === 0 ? (
        <p className="text-sm text-brand-gray">لا أسئلة بعد</p>
      ) : (
        questions.map((q) => (
          <div key={q.id}>
            <label className="label-field">
              {q.label}
              {q.required ? " *" : ""}
            </label>
            {q.helperText && <p className="mb-1 text-xs text-brand-gray">{q.helperText}</p>}
            {q.fieldType === "textarea" ? (
              <textarea className="input-field resize-none" rows={2} disabled />
            ) : q.fieldType === "yes_no" || q.fieldType === "radio" ? (
              <div className="flex flex-wrap gap-4 text-sm text-brand-gray">
                {(q.fieldType === "yes_no" ? ["نعم", "لا"] : q.options).map((o) => (
                  <span key={o}>{o}</span>
                ))}
              </div>
            ) : q.fieldType === "select" ? (
              <select className="input-field" disabled>
                <option>اختر...</option>
                {q.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input className="input-field" disabled />
            )}
          </div>
        ))
      )}
    </div>
  );
}
