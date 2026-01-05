import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

export default function LogFilesTab() {
  const { t, i18n } = useTranslation();
  const [selectedLog, setSelectedLog] = useState("register");

  const [dateFilter, setDateFilter] = useState({
    from: "",
    to: "",
  });

  const [logEntries, setLogEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const logTypes = [
    { key: "register", label: "Cash Register Logs" },
    { key: "suppliers", label: "Supplier Orders" },
    { key: "payments", label: "Payment History" },
    { key: "login", label: "Login Activity" },
  ];

 useEffect(() => {
  if (!selectedLog || (!dateFilter.from && !dateFilter.to)) return;

  const params = new URLSearchParams();
  if (dateFilter.from) params.append("from", dateFilter.from);
  if (dateFilter.to) params.append("to", dateFilter.to);
  const query = params.toString();
  const endpoint = `/settings/logs/${selectedLog}${query ? `?${query}` : ""}`;

  setLoading(true);
  secureFetch(endpoint)
    .then((data) => {
      if (Array.isArray(data)) {
        setLogEntries(data);
      } else {
        setLogEntries([]);
        console.warn("⚠️ Unexpected response (not array):", data);
      }
      setLoading(false);
    })
    .catch((err) => {
      console.error("❌ Failed to fetch logs:", err);
      setLogEntries([]);
      setLoading(false);
    });
}, [selectedLog, dateFilter]);

 const isRegisterLog = selectedLog === "register";
  const columns = useMemo(() => {
    if (isRegisterLog) {
      return [
        { key: "created_at", label: t("Timestamp") },
        { key: "type", label: t("Type") },
        { key: "amount", label: t("Amount") },
        { key: "note", label: t("Note") },
        { key: "staff", label: t("Staff") },
      ];
    }
    return [
      { key: "date", label: t("Date") },
      { key: "action", label: t("Action") },
      { key: "user", label: t("User") },
    ];
  }, [isRegisterLog, t]);

  const renderCell = (entry, column) => {
    if (column.key === "amount") {
      const value = parseFloat(entry.amount);
      return Number.isFinite(value) ? `₺${value.toFixed(2)}` : "₺0.00";
    }
    if (column.key === "created_at") {
      if (!entry.created_at) return entry.date || "—";
      const dt = new Date(entry.created_at);
      return Number.isNaN(dt.getTime())
        ? entry.created_at
        : dt.toLocaleString(i18n.language);
    }
    return entry[column.key] || "—";
  };

 return (
  <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-5xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
    <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
      📁 {t("Log Files & Activity")}
    </h2>

    {/* Log type selector */}
    <div className="flex flex-wrap gap-3 mb-6">
      {logTypes.map((log) => (
        <button
          key={log.key}
          onClick={() => setSelectedLog(log.key)}
          className={`px-4 py-2 rounded-full border font-medium text-sm transition ${
            selectedLog === log.key
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-indigo-100 dark:hover:bg-indigo-700"
          }`}
        >
          {t(log.label)}
        </button>
      ))}
    </div>

    {/* Date Filter */}
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("From")}</label>
        <input
          type="date"
          value={dateFilter.from}
          onChange={(e) =>
            setDateFilter((prev) => ({ ...prev, from: e.target.value }))
          }
          className="p-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("To")}</label>
        <input
          type="date"
          value={dateFilter.to}
          onChange={(e) =>
            setDateFilter((prev) => ({ ...prev, to: e.target.value }))
          }
          className="p-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>
    </div>

    {/* Log Table */}
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm text-left">
        <thead className="bg-gray-100 dark:bg-gray-700 border-b text-gray-600 dark:text-gray-300 uppercase">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-6 text-gray-500 dark:text-gray-400">
                {t("Loading...")}
              </td>
            </tr>
          ) : logEntries.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-6 text-gray-500 dark:text-gray-400">
                {t("No logs found for selected range.")}
              </td>
            </tr>
          ) : (
            logEntries.map((entry, idx) => (
              <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2">
                    {renderCell(entry, col)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {/* Export Buttons */}
    <div className="flex justify-end mt-6 gap-3">
      <button className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white border rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm">
        📤 {t("Export CSV")}
      </button>
      <button className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white border rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm">
        📄 {t("Download PDF")}
      </button>
    </div>
  </div>
);

}
