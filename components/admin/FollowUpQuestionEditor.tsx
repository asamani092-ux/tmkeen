"use client";

import SubmitButton from "@/components/ui/SubmitButton";

export type FollowUpQuestionDraft = {
  label: string;
  fieldType: string;
  options: string;
  required: boolean;
  helperText: string;
};

type Props = {
  month: number;
  initial?: FollowUpQuestionDraft;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (draft: FollowUpQuestionDraft) => void;
  onCancel?: () => void;
};

const FIELD_TYPES = [
  { value: "text", label: "نص قصير" },
  { value: "textarea", label: "نص طويل" },
  { value: "yes_no", label: "نعم / لا" },
  { value: "select", label: "قائمة منسدلة" },
  { value: "radio", label: "اختيار واحد" },
];

export default function FollowUpQuestionEditor({
  month,
  initial,
  loading = false,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit({
      label: String(form.get("label") ?? "").trim(),
      fieldType: String(form.get("fieldType") ?? "text"),
      options: String(form.get("options") ?? ""),
      required: form.get("required") === "on",
      helperText: String(form.get("helperText") ?? "").trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card-section space-y-3">
      <p className="font-semibold text-primary">
        {initial ? "تعديل سؤال" : "إضافة سؤال"} — شهر {month}
      </p>
      <input
        name="label"
        className="input-field"
        placeholder="نص السؤال"
        defaultValue={initial?.label ?? ""}
        required
      />
      <select name="fieldType" className="input-field" defaultValue={initial?.fieldType ?? "text"}>
        {FIELD_TYPES.map((ft) => (
          <option key={ft.value} value={ft.value}>
            {ft.label}
          </option>
        ))}
      </select>
      <input
        name="options"
        className="input-field"
        placeholder="خيارات (select/radio) مفصولة بفاصلة"
        defaultValue={initial?.options ?? ""}
      />
      <input
        name="helperText"
        className="input-field"
        placeholder="نص توضيحي (اختياري)"
        defaultValue={initial?.helperText ?? ""}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={initial?.required ?? true} />
        مطلوب
      </label>
      <div className="flex gap-2">
        <SubmitButton loading={loading} className="btn-primary flex-1 !py-2 text-sm">
          {submitLabel}
        </SubmitButton>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 !py-2 text-sm">
            إلغاء
          </button>
        )}
      </div>
    </form>
  );
}
