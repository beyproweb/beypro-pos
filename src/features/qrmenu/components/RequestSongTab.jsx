import React from "react";
import { Music2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const getStatusToneClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (normalized === "completed") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200";
  }
  if (normalized === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
};

function RequestSongTab({
  t: providedT = null,
  requests = [],
  songName = "",
  onSongNameChange,
  onSubmit,
  submitting = false,
}) {
  const { t: hookT } = useTranslation();
  const t = typeof providedT === "function" ? providedT : hookT;
  const isInteractive =
    typeof onSongNameChange === "function" && typeof onSubmit === "function";
  const hasActiveSongRequest = React.useMemo(
    () =>
      (Array.isArray(requests) ? requests : []).some((request) => {
        const status = String(request?.status || "").trim().toLowerCase();
        return status === "pending" || status === "approved";
      }),
    [requests]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isInteractive || submitting || hasActiveSongRequest) return;
    onSubmit();
  };

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-white px-5 py-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-900 sm:px-7 sm:py-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-100 blur-3xl dark:bg-sky-500/10" />
      <div className="pointer-events-none absolute -bottom-20 left-0 h-44 w-44 rounded-full bg-cyan-100 blur-3xl dark:bg-cyan-500/10" />

      <div className="relative space-y-5">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
            <Music2 className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white">
              {t("Request Song")}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("Add a song to the queue")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-neutral-200">
              {t("Enter a song name and follow its queue number and live status updates here.")}
            </p>
          </div>
        </div>

        {isInteractive ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            {hasActiveSongRequest ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {t("You can request a new song after the current one is cancelled or closed.")}
              </div>
            ) : null}
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-100">
              {t("Song name")}
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={songName}
                onChange={(event) => onSongNameChange(event.target.value)}
                placeholder={
                  hasActiveSongRequest
                    ? t("Current song request is still active")
                    : t("Enter song name")
                }
                disabled={hasActiveSongRequest}
                className="h-24 w-full min-w-0 flex-1 rounded-3xl border-2 border-slate-300 bg-slate-50 px-5 text-[17px] text-slate-900 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 md:h-12 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:px-4 md:text-sm md:shadow-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-400 dark:focus:border-sky-400 dark:focus:ring-sky-500/20 md:dark:border-neutral-700 md:dark:bg-neutral-950"
              />
              <button
                type="submit"
                disabled={submitting || hasActiveSongRequest || !String(songName || "").trim()}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {submitting ? t("Sending...") : t("Send Request")}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-200">
            {t("Song request controls will appear here for checked-in guests.")}
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("Requests")}
          </div>
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-neutral-700 dark:text-neutral-300">
              {t("No song requests yet.")}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-800/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        {request.song_name || t("Unknown song")}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500 dark:text-neutral-300">
                        {t("Queue")} #{request.queue_number || "—"}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusToneClass(
                        request.status
                      )}`}
                    >
                      {t(request.status || "pending")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default React.memo(RequestSongTab);
