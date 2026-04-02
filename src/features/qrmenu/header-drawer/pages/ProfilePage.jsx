import React from "react";

function ProfilePage({ t, customer, onSave, onBack }) {
  const [form, setForm] = React.useState({
    email: customer?.email || "",
    username: customer?.username || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setForm({
      email: customer?.email || "",
      username: customer?.username || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
    });
  }, [customer]);

  const onChange = (key, value) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave?.(form);
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Unable to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("My Profile")}</h3>
      </div>

      <form className="p-4 space-y-3" onSubmit={submit}>
        <input
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder={t("Email (optional)")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <input
          value={form.username}
          onChange={(e) => onChange("username", e.target.value)}
          placeholder={t("Full Name")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <input
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder={t("Phone")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <input
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder={t("Address (optional)")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />

        {error ? <p className="text-xs text-rose-600">{t(error)}</p> : null}
        {saved ? <p className="text-xs text-emerald-600">{t("Profile updated.")}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "..." : t("Save")}
        </button>
      </form>
    </div>
  );
}

export default React.memo(ProfilePage);
