import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";

export default function PaymentMethodsTab() {
  const { t } = useTranslation();

  const [payments, setPayments] = useState({
    enabledMethods: {
      cash: true,
      credit_card: true,
      papara: false,
      iyzico: false,
    },
    defaultCard: {
      name: "",
      number: "",
      expiry: "",
      cvc: "",
    },
  });

  useSetting("payments", setPayments, {
    enabledMethods: {
      cash: true,
      credit_card: true,
      papara: false,
      iyzico: false,
    },
    defaultCard: {
      name: "",
      number: "",
      expiry: "",
      cvc: "",
    },
  });

  const handleSave = async () => {
    await saveSetting("payments", payments);
    alert("💳 Payment methods saved!");
  };

  return (
  <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-4xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
    <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
      💰 {t("Payment Methods")}
    </h2>

    {/* Method Toggles */}
    <div className="space-y-5">
      {Object.entries(payments.enabledMethods).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-lg capitalize text-gray-800 dark:text-white">
            {t(key.replace("_", " "))}
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={() =>
                setPayments((prev) => ({
                  ...prev,
                  enabledMethods: {
                    ...prev.enabledMethods,
                    [key]: !value,
                  },
                }))
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
        </div>
      ))}
    </div>

    <hr className="my-8 border-indigo-200 dark:border-indigo-700" />

    {/* Default Credit Card */}
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

    <div className="flex justify-end mt-10">
      <button
        onClick={handleSave}
        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-bold shadow hover:brightness-110 transition-all"
      >
        💾 {t("Save Settings")}
      </button>
    </div>
  </div>
);

}
