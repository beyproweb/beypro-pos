import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";
import { saveSetting } from "../hooks/useSetting";
import {
  DEFAULT_PAYMENT_METHODS,
  normalizePaymentSettings,
  serializePaymentSettings,
  slugifyPaymentId,
  formatPaymentLabel,
  getPaymentMethodIcon,
} from "../../utils/paymentMethods";

export default function PaymentMethodsTab() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState(() =>
    normalizePaymentSettings({ methods: DEFAULT_PAYMENT_METHODS })
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMethodLabel, setNewMethodLabel] = useState("");
  const [newMethodIcon, setNewMethodIcon] = useState("💳");

  useEffect(() => {
    let mounted = true;
    secureFetch("/settings/payments")
      .then((data) => {
        if (!mounted) return;
        setPayments(normalizePaymentSettings(data));
      })
      .catch(() => {
        if (mounted) {
          setPayments(normalizePaymentSettings({ methods: DEFAULT_PAYMENT_METHODS }));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const methodFields = useMemo(() => payments.methods || [], [payments.methods]);

  const handleToggleMethod = (id) => {
    setPayments((prev) => ({
      ...prev,
      methods: (prev.methods || []).map((method) =>
        method.id === id
          ? { ...method, enabled: !(method.enabled !== false) }
          : method
      ),
    }));
  };

  const handleLabelChange = (id, value) => {
    setPayments((prev) => ({
      ...prev,
      methods: (prev.methods || []).map((method) =>
        method.id === id ? { ...method, label: value } : method
      ),
    }));
  };

  const handleIconChange = (id, value) => {
    setPayments((prev) => ({
      ...prev,
      methods: (prev.methods || []).map((method) =>
        method.id === id ? { ...method, icon: value.slice(0, 3) } : method
      ),
    }));
  };

  const handleDeleteMethod = (id) => {
    setPayments((prev) => ({
      ...prev,
      methods: (prev.methods || []).filter((method) => method.id !== id),
    }));
  };

  const handleAddMethod = () => {
    const cleanLabel = newMethodLabel.trim();
    if (!cleanLabel) return;
    const idBase = slugifyPaymentId(cleanLabel);
    setPayments((prev) => {
      const exists = prev.methods?.some((method) => method.id === idBase);
      const uniqueId = exists ? `${idBase}_${Date.now().toString(36)}` : idBase;
      const nextMethods = [
        ...(prev.methods || []),
        {
          id: uniqueId,
          label: formatPaymentLabel(cleanLabel),
          icon: newMethodIcon || "💳",
          enabled: true,
          builtIn: false,
        },
      ];
      return { ...prev, methods: nextMethods };
    });
    setNewMethodLabel("");
    setNewMethodIcon("💳");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = serializePaymentSettings(payments);
      await saveSetting("payments", payload);
      alert("💳 Payment methods saved!");
    } catch (err) {
      alert("❌ Failed to save settings");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        {t("Loading payment settings")}…
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-4xl mx-auto text-gray-900 dark:text-white transition-colors duration-300 space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
          💰 {t("Payment Methods")}
        </h2>

        <div className="space-y-4">
          {methodFields.map((method) => (
            <div
              key={method.id}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/40"
            >
              <div className="flex items-center gap-3 w-full sm:w-1/3">
                <input
                  type="text"
                  maxLength={3}
                  value={method.icon || getPaymentMethodIcon(methodFields, method.id)}
                  onChange={(e) => handleIconChange(method.id, e.target.value)}
                  className="w-16 text-center text-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl py-2"
                  aria-label={t("Icon")}
                />
                <input
                  type="text"
                  value={method.label}
                  onChange={(e) => handleLabelChange(method.id, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                  placeholder={t("Payment name")}
                />
              </div>
              <div className="flex items-center gap-4 w-full sm:w-2/3 justify-between">
                <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={method.enabled !== false}
                    onChange={() => handleToggleMethod(method.id)}
                    className="w-5 h-5 accent-indigo-500"
                  />
                  {method.enabled !== false ? t("Enabled") : t("Disabled")}
                </label>
                {!method.builtIn && (
                  <button
                    onClick={() => handleDeleteMethod(method.id)}
                    className="text-rose-500 hover:text-rose-600 text-sm font-semibold"
                  >
                    {t("Remove")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center">
          <input
            type="text"
            value={newMethodIcon}
            maxLength={3}
            onChange={(e) => setNewMethodIcon(e.target.value)}
            className="w-20 text-center text-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl py-2"
            placeholder="💳"
          />
          <input
            type="text"
            value={newMethodLabel}
            onChange={(e) => setNewMethodLabel(e.target.value)}
            className="flex-1 w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
            placeholder={t("Add new payment method (e.g. Papara)")}
          />
          <button
            onClick={handleAddMethod}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-500 transition"
          >
            ➕ {t("Add")}
          </button>
        </div>
      </div>

      <hr className="border-indigo-200 dark:border-indigo-700" />

      <div>
        <h3 className="text-xl font-semibold text-indigo-700 dark:text-indigo-400 mb-4">
          {t("Add Credit Card")}
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder={t("Cardholder Name")}
            value={payments.defaultCard.name}
            onChange={(e) =>
              setPayments((prev) => ({
                ...prev,
                defaultCard: { ...prev.defaultCard, name: e.target.value },
              }))
            }
            className="p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="text"
            placeholder={t("Card Number")}
            maxLength={19}
            value={payments.defaultCard.number}
            onChange={(e) =>
              setPayments((prev) => ({
                ...prev,
                defaultCard: { ...prev.defaultCard, number: e.target.value },
              }))
            }
            className="p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="text"
            placeholder={t("MM/YY")}
            maxLength={5}
            value={payments.defaultCard.expiry}
            onChange={(e) =>
              setPayments((prev) => ({
                ...prev,
                defaultCard: { ...prev.defaultCard, expiry: e.target.value },
              }))
            }
            className="p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="text"
            placeholder={t("CVC")}
            maxLength={4}
            value={payments.defaultCard.cvc}
            onChange={(e) =>
              setPayments((prev) => ({
                ...prev,
                defaultCard: { ...prev.defaultCard, cvc: e.target.value },
              }))
            }
            className="p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-bold shadow hover:brightness-110 transition-all disabled:opacity-60"
        >
          {saving ? t("Saving...") : `💾 ${t("Save Settings")}`}
        </button>
      </div>
    </div>
  );
}
