import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/card";
import { CalendarIcon } from "lucide-react";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";

export default function CashRegisterHistory() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [history, setHistory] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchHistory = async () => {
    if (!from || !to) return;
    try {
      const data = await secureFetch(
        `/reports/cash-register-history?from=${from}&to=${to}`
      );
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Failed to fetch register history:", err);
    }
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
                  <td className="p-2 text-blue-600">
                    {!isNaN(open) ? formatCurrency(open) : "-"}
                  </td>
                  <td className="p-2 text-green-600">
                    {!isNaN(close) ? formatCurrency(close) : "-"}
                  </td>
                  <td className="p-2 text-accent">
                    {!isNaN(r.cash_sales)
                      ? formatCurrency(Number(r.cash_sales))
                      : "-"}
                  </td>
                  <td className="p-2 text-red-500">
                    {!isNaN(r.supplier_expenses)
                      ? formatCurrency(Number(r.supplier_expenses))
                      : "-"}
                  </td>
                  <td className="p-2 text-red-500">
                    {!isNaN(r.staff_expenses)
                      ? formatCurrency(Number(r.staff_expenses))
                      : "-"}
                  </td>
                  <td className="p-2 text-red-500">
                    {!isNaN(r.register_expenses)
                      ? formatCurrency(Number(r.register_expenses))
                      : "-"}
                  </td>
                  <td className={`p-2 font-semibold ${net >= 0 ? "text-green-500" : "text-red-600"}`}>
                    {formatCurrency(net)}
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
