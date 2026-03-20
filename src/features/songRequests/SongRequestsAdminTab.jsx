import React from "react";

const getStatusToneClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "completed") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (normalized === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
};

function SongRequestsAdminTab({
  t,
  requests = [],
  tables = [],
  loading = false,
  updatingId = null,
  onApprove,
  onComplete,
  onCancel,
}) {
  const tablesByNumber = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(tables) ? tables : []).forEach((table) => {
      const tableNumber = Number(table?.tableNumber);
      if (Number.isFinite(tableNumber) && tableNumber > 0) {
        map.set(tableNumber, table);
      }
    });
    return map;
  }, [tables]);

  if (loading) {
    return (
      <div className="px-6 py-10 text-center text-slate-500">
        {t("Loading song requests...")}
      </div>
    );
  }

  if (!requests.length) {
    return (
      <div className="px-6 py-10 text-center text-slate-500">
        {t("No song requests yet.")}
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {requests.map((request) => {
          const isUpdating = Number(updatingId) === Number(request.id);
          const isPending = String(request.status || "").toLowerCase() === "pending";
          const isApproved = String(request.status || "").toLowerCase() === "approved";
          const requestTableNumber = Number(request.table_number);
          const linkedTable =
            Number.isFinite(requestTableNumber) && requestTableNumber > 0
              ? tablesByNumber.get(requestTableNumber) || null
              : null;
          const guestHasLeft = Boolean(linkedTable?.isFreeTable);

          return (
            <div
              key={request.id}
              className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("Table")} {request.table_number || "—"}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {request.song_name || t("Unknown song")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("Queue")}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    #{request.queue_number || "—"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusToneClass(
                    request.status
                  )}`}
                >
                  {t(request.status || "pending")}
                </span>
                <div className="text-xs text-slate-500">
                  {request.created_at
                    ? new Date(request.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </div>
              </div>

              {guestHasLeft ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                  {t("Guest has leave")}
                </div>
              ) : null}

              {isPending ? (
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onApprove?.(request)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? t("Updating...") : t("Approve")}
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onCancel?.(request)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl bg-rose-600 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? t("Updating...") : t("Cancel")}
                  </button>
                </div>
              ) : null}

              {isApproved ? (
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onComplete?.(request)}
                    className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-sky-600 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? t("Updating...") : t("Close Song")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(SongRequestsAdminTab);
