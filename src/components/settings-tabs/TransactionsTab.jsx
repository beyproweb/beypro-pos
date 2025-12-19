import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../../constants/transactionSettingsDefaults";

export default function TransactionsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_TRANSACTION_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState("");

  useSetting("transactions", setSettings, DEFAULT_TRANSACTION_SETTINGS);

  const presetNotes = useMemo(
    () =>
      Array.isArray(settings.presetNotes) && settings.presetNotes.length > 0
        ? settings.presetNotes
        : DEFAULT_TRANSACTION_SETTINGS.presetNotes,
    [settings.presetNotes]
  );

  const toggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddNote = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    if (presetNotes.includes(trimmed)) {
      setNewNote("");
      return;
    }
    setSettings((prev) => ({
      ...prev,
      presetNotes: [...presetNotes, trimmed],
    }));
    setNewNote("");
  };

  const handleRemoveNote = (value) => {
    setSettings((prev) => ({
      ...prev,
      presetNotes: presetNotes.filter((note) => note !== value),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("transactions", settings);
      alert(t("Save Settings"));
    } catch (err) {
      console.error("❌ Failed to save transactions settings", err);
      alert(t("Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-6 max-w-4xl mx-auto text-gray-900 dark:text-white space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-2">
          💳 {t("Transactions")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-300">
          {t("Configure payment flow and note presets for the transaction screen.")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={!!settings.autoCloseTableAfterPay}
            onChange={() => toggle("autoCloseTableAfterPay")}
            className="mt-1 h-5 w-5 accent-indigo-500"
          />
          <div>
            <div className="font-semibold text-sm">
              {t("Auto-close tables after payment")}
            </div>
            <div className="text-xs text-slate-500">
              {t("When a table is fully paid, close it and return to Table Overview automatically.")}
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={!!settings.autoClosePacketAfterPay}
            onChange={() => toggle("autoClosePacketAfterPay")}
            className="mt-1 h-5 w-5 accent-indigo-500"
          />
          <div>
            <div className="font-semibold text-sm">
              {t("Auto-close packet/phone orders after payment")}
            </div>
            <div className="text-xs text-slate-500">
              {t("After payment, close packet and phone orders and return to the Orders list.")}
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={!!settings.disableAutoPrintTable}
            onChange={() => toggle("disableAutoPrintTable")}
            className="mt-1 h-5 w-5 accent-indigo-500"
          />
          <div>
            <div className="font-semibold text-sm">
              {t("Disable auto-print for table orders")}
            </div>
            <div className="text-xs text-slate-500">
              {t("Skip automatic printing when new table orders are confirmed.")}
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={!!settings.disableAutoPrintPacket}
            onChange={() => toggle("disableAutoPrintPacket")}
            className="mt-1 h-5 w-5 accent-indigo-500"
          />
          <div>
            <div className="font-semibold text-sm">
              {t("Disable auto-print for packet/phone orders")}
            </div>
            <div className="text-xs text-slate-500">
              {t("Skip automatic printing when packet or phone orders are confirmed.")}
            </div>
          </div>
        </label>
      </div>

      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">
              📝 {t("Preset notes for extras modal")}
            </div>
            <div className="text-xs text-slate-500">
              {t("These shortcuts appear as chips in the extras modal.")}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              placeholder={t("Add preset note")}
            />
            <button
              onClick={handleAddNote}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition"
            >
              {t("Add")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {presetNotes.map((note) => (
            <span
              key={note}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            >
              {note}
              <button
                onClick={() => handleRemoveNote(note)}
                className="text-rose-500 hover:text-rose-600"
                title={t("Remove")}
              >
                ×
              </button>
            </span>
          ))}
          {presetNotes.length === 0 && (
            <span className="text-xs text-slate-500">{t("No presets configured yet.")}</span>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-500 transition disabled:opacity-60"
        >
          {saving ? t("Saving...") : `💾 ${t("Save Settings")}`}
        </button>
      </div>
    </div>
  );
}
