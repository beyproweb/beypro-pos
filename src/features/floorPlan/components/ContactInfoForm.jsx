import React from "react";
import { useTranslation } from "react-i18next";

function Field({ label, error = "", children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</div>
      {children}
      {error ? <div className="mt-1.5 text-sm text-rose-600 dark:text-rose-300">{error}</div> : null}
    </label>
  );
}

export default function ContactInfoForm({
  values,
  onChange,
  errors = {},
  notesLabel = "Notes",
  showNotes = true,
  fieldRefs = {},
}) {
  const { t } = useTranslation();
  const inputClassName = (error) =>
    [
      "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition dark:bg-neutral-950 dark:text-neutral-50",
      error
        ? "border-rose-400 ring-4 ring-rose-100 focus:border-rose-500 dark:border-rose-500 dark:ring-rose-950/40"
        : "border-neutral-200 focus:border-neutral-400 dark:border-neutral-800",
    ].join(" ");
  return (
    <div className="grid grid-cols-1 gap-4">
      <Field label={t("Full Name")} error={errors.name}>
        <input
          ref={fieldRefs.name}
          type="text"
          value={values.name}
          onChange={(event) => onChange("name", event.target.value)}
          className={inputClassName(errors.name)}
        />
      </Field>
      <Field label={t("Phone")} error={errors.phone}>
        <input
          ref={fieldRefs.phone}
          type="tel"
          value={values.phone}
          onChange={(event) => onChange("phone", event.target.value)}
          className={inputClassName(errors.phone)}
        />
      </Field>
      <Field label={t("Email")} error={errors.email}>
        <input
          ref={fieldRefs.email}
          type="email"
          value={values.email}
          onChange={(event) => onChange("email", event.target.value)}
          className={inputClassName(errors.email)}
        />
      </Field>
      {showNotes ? (
        <Field label={notesLabel} error={errors.notes}>
          <textarea
            ref={fieldRefs.notes}
            rows={4}
            value={values.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            className={inputClassName(errors.notes)}
          />
        </Field>
      ) : null}
    </div>
  );
}
