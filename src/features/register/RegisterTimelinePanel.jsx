import React from "react";

export default function RegisterTimelinePanel({
  t,
  combinedEvents,
  showRegisterLog,
  setShowRegisterLog,
  formatCurrency,
}) {
  if (!combinedEvents.length) return null;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setShowRegisterLog((v) => !v)}
        className={`
          px-4 py-2 rounded-xl font-semibold transition-all shadow
          ${showRegisterLog ? "bg-blue-200 text-blue-900" : "bg-gray-100 text-gray-700 hover:bg-blue-100"}
        `}
      >
        {showRegisterLog ? t("Hide Register Log") : t("Show Register Log")}
      </button>
      {showRegisterLog && (
        <div className="bg-white/90 border border-blue-100 rounded-2xl p-4 mt-3 max-h-64 overflow-y-auto shadow">
          <div className="flex text-xs font-bold text-gray-400 pb-2 px-1">
            <span className="min-w-[90px]">Type</span>
            <span className="min-w-[90px]">Amount</span>
            <span className="flex-1">Reason / Note</span>
            <span className="w-14 text-right">Time</span>
          </div>
          <ul className="divide-y">
            {combinedEvents.map((event, idx) => (
              <li key={idx} className="flex items-center py-2 gap-2 text-sm">
                <span className="font-semibold min-w-[90px] text-[10px] uppercase tracking-wide text-slate-500">
                  {event.type}
                </span>
                <span className="tabular-nums min-w-[90px] font-semibold text-slate-900">
                  {event.amount ? formatCurrency(parseFloat(event.amount)) : ""}
                </span>
                <span
                  className={`flex-1 text-sm max-w-[180px] ${
                    event.type === "entry"
                      ? "font-semibold text-lime-800"
                      : event.type === "expense"
                      ? "font-semibold text-orange-800"
                      : "text-gray-600 italic"
                  }`}
                >
                  {event.note || (["entry", "expense"].includes(event.type) ? "(No reason provided)" : "")}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {event.created_at &&
                    new Date(event.created_at).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
