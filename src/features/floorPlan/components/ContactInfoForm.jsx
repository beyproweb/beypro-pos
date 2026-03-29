import React from "react";

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
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Field label="Full Name" error={errors.name}>
        <input
          type="text"
          value={values.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </Field>
      <Field label="Phone" error={errors.phone}>
        <input
          type="tel"
          value={values.phone}
          onChange={(event) => onChange("phone", event.target.value)}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </Field>
      <Field label="Email" error={errors.email}>
        <input
          type="email"
          value={values.email}
          onChange={(event) => onChange("email", event.target.value)}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </Field>
      {showNotes ? (
        <Field label={notesLabel} error={errors.notes}>
          <textarea
            rows={4}
            value={values.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Field>
      ) : null}
    </div>
  );
}
