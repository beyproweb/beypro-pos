import React, { useEffect, useState } from "react";
import secureFetch from "../utils/secureFetch"; // ✅ Add this import

export default function MergeTableModal({ open, onClose, onConfirm, currentTable, t }) {
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);

    secureFetch("/orders")
      .then((data) => {
        const activeTables = Array.from({ length: 20 }, (_, i) => {
          const tableNum = i + 1;
          const order = (Array.isArray(data) ? data : []).find((o) => {
            if (!o) return false;
            const normalized = Number(o.table_number);
            const status = (o.status || "").toLowerCase();
            return Number.isFinite(normalized) && normalized === tableNum && status !== "closed";
          });
          return {
            tableNum,
            hasOrder: !!order,
            orderId: order?.id ?? null,
          };
        });
        setTables(activeTables);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Failed to fetch orders:", err);
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 min-w-[350px] relative">
        <button
          className="absolute top-3 right-3 text-xl text-gray-500"
          onClick={onClose}
        >
          ✖
        </button>
        <h2 className="text-xl font-bold mb-4">
          {t ? t("Merge") : "Merge"}
        </h2>
        <p className="mb-3 text-gray-700">
          {t
            ? t("Select a table to merge INTO. This will combine all items.")
            : "Select a table to merge INTO. This will combine all items."}
        </p>

        {loading ? (
          <p>{t ? t("Loading...") : "Loading..."}</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {tables.map((tbl) => (
              <button
                key={tbl.tableNum}
                disabled={
                  !tbl.hasOrder || tbl.tableNum === Number(currentTable)
                }
                onClick={() => setSelected({ tableNum: tbl.tableNum, orderId: tbl.orderId })}
                className={`rounded-xl px-4 py-3 font-bold text-lg border-2
                  ${
                    !tbl.hasOrder
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
                      : selected?.tableNum === tbl.tableNum
                      ? "bg-fuchsia-500 text-white border-fuchsia-500"
                      : "bg-blue-100 text-blue-800 border-blue-400 hover:bg-blue-300"
                  }
                `}
                style={{
                  opacity:
                    !tbl.hasOrder || tbl.tableNum === Number(currentTable)
                      ? 0.5
                      : 1,
                }}
              >
                {tbl.tableNum}
                {tbl.tableNum === Number(currentTable) && (
                  <span className="ml-1 text-xs font-normal text-blue-400">
                    (Current)
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 font-bold"
          >
            {t ? t("Cancel") : "Cancel"}
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="px-4 py-2 rounded-lg bg-fuchsia-600 text-white font-bold disabled:opacity-40"
          >
            {t ? t("Merge") : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
