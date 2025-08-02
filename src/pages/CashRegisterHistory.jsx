import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/card";
import { CalendarIcon } from "lucide-react";
const API_URL = import.meta.env.VITE_API_URL || "";

export default function CashRegisterHistory() {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchHistory = () => {
    if (!from || !to) return;
    fetch(`${API_URL}/api/reports/cash-register-history?from=${from}&to=${to}`)
      .then(res => res.json())
      .then(setHistory)
      .catch(err => console.error("❌ Failed to fetch register history:", err));
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    setFrom(weekAgo);
    setTo(today);
  }, []);

  useEffect(() => {
    if (from && to) fetchHistory();
  }, [from, to]);

  return (
    <div className="p-6 min-h-screen text-gray-800 dark:text-white transition-colors">

      <div className="flex gap-4 mb-4 items-center">
        <div>
          <label className="text-sm block mb-1">{t("From")}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="p-2 rounded border dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="text-sm block mb-1">{t("To")}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="p-2 rounded border dark:bg-gray-800"
          />
        </div>
        <button
          onClick={fetchHistory}
          className="px-4 py-2 bg-accent text-white rounded shadow hover:brightness-110"
        >
          <CalendarIcon className="inline-block w-4 h-4 mr-1" />
          {t("Fetch")}
        </button>
      </div>

      <Card className="overflow-x-auto p-4 shadow-xl rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-300 dark:border-gray-700">
              <th className="p-2">{t("Date")}</th>
              <th className="p-2">{t("Opening Cash")}</th>
              <th className="p-2">{t("Closing Cash")}</th>
              <th className="p-2">{t("Cash Sales")}</th>
              <th className="p-2">{t("Supplier Expenses")}</th>
              <th className="p-2">{t("Staff Expenses")}</th>
              <th className="p-2">{t("Register Expenses")}</th>
              <th className="p-2">{t("Net Cash")}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r, i) => {
              const open = parseFloat(r.opening_cash) || 0;
              const close = parseFloat(r.closing_cash) || 0;
              const expenses =
                (parseFloat(r.supplier_expenses) || 0) +
                (parseFloat(r.staff_expenses) || 0) +
                (parseFloat(r.register_expenses) || 0);
              const net = close - open - expenses;

              return (
                <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2 text-blue-600">₺{!isNaN(open) ? open.toFixed(2) : "-"}</td>
                  <td className="p-2 text-green-600">₺{!isNaN(close) ? close.toFixed(2) : "-"}</td>
                  <td className="p-2 text-accent">₺{!isNaN(r.cash_sales) ? Number(r.cash_sales).toFixed(2) : "-"}</td>
                  <td className="p-2 text-red-500">₺{!isNaN(r.supplier_expenses) ? Number(r.supplier_expenses).toFixed(2) : "-"}</td>
                  <td className="p-2 text-red-500">₺{!isNaN(r.staff_expenses) ? Number(r.staff_expenses).toFixed(2) : "-"}</td>
                  <td className="p-2 text-red-500">₺{!isNaN(r.register_expenses) ? Number(r.register_expenses).toFixed(2) : "-"}</td>
                  <td className={`p-2 font-semibold ${net >= 0 ? "text-green-500" : "text-red-600"}`}>
                    ₺{net.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
