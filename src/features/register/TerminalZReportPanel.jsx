import React, { useRef } from "react";

export default function TerminalZReportPanel({
  t,
  reconLoading,
  posCardTotal,
  terminalCardTotal,
  setTerminalCardTotal,
  useDetectedValues,
  zReportConfidence,
  terminalTxCount,
  setTerminalTxCount,
  terminalRefundTotal,
  setTerminalRefundTotal,
  terminalCashTotal,
  setTerminalCashTotal,
  terminalGrandTotal,
  setTerminalGrandTotal,
  config,
  cardBreakdown,
  cardDifference,
  cardDiffColor,
  detectedTable,
  detectedDelivery,
  splitCardDiff,
  terminalReportUploading,
  handleTerminalReceiptUpload,
  tableReceiptCount,
  deliveryReceiptCount,
  zReportPreviewUrls,
  terminalReportUrls,
  terminalReportUrl,
  terminalReportDetails,
  handleDeleteTerminalReceipt,
  zReportDetected,
  handleUseDetectedToggle,
  formatCurrency,
}) {
  const deliveryReceiptInputRef = useRef(null);
  const tableReceiptInputRef = useRef(null);
  const uploadingTable = Boolean(terminalReportUploading?.table);
  const uploadingDelivery = Boolean(terminalReportUploading?.delivery);
  const cardTypes = ["table", "delivery", "phone", "takeaway", "unknown"];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Block 2</p>
          <h3 className="text-lg font-semibold text-slate-900">{t("Terminal reconciliation")}</h3>
          <p className="text-xs text-slate-500">
            {t("Optional for now; you can still close without these.")}
          </p>
        </div>
        {reconLoading && <span className="text-xs text-slate-500">{t("Loading snapshot...")}</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-700">{t("POS Card Total")}</label>
          <div className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold tabular-nums">
            {formatCurrency(posCardTotal)}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Terminal Card Total")} ({t("optional")})
          </label>
          <input
            type="number"
            value={terminalCardTotal}
            onChange={(e) => setTerminalCardTotal(e.target.value)}
            className="w-full mt-1 px-3 py-3 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm text-lg disabled:bg-slate-100"
            placeholder={`${config?.symbol || ""}0.00`}
            min="0"
            disabled={useDetectedValues && zReportConfidence?.overall === "high"}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Terminal Tx Count")} ({t("optional")})
          </label>
          <input
            type="number"
            value={terminalTxCount}
            onChange={(e) => setTerminalTxCount(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm disabled:bg-slate-100"
            placeholder="0"
            min="0"
            disabled={useDetectedValues && zReportConfidence?.overall === "high"}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Terminal Refund Total")} ({t("optional")})
          </label>
          <input
            type="number"
            value={terminalRefundTotal}
            onChange={(e) => setTerminalRefundTotal(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm disabled:bg-slate-100"
            placeholder={`${config?.symbol || ""}0.00`}
            min="0"
            disabled={useDetectedValues && zReportConfidence?.overall === "high"}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Terminal Cash Total")} ({t("optional")})
          </label>
          <input
            type="number"
            value={terminalCashTotal}
            onChange={(e) => setTerminalCashTotal(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm disabled:bg-slate-100"
            placeholder={`${config?.symbol || ""}0.00`}
            min="0"
            disabled={useDetectedValues && zReportConfidence?.overall === "high"}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Terminal Grand Total")} ({t("optional")})
          </label>
          <input
            type="number"
            value={terminalGrandTotal}
            onChange={(e) => setTerminalGrandTotal(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm disabled:bg-slate-100"
            placeholder={`${config?.symbol || ""}0.00`}
            min="0"
            disabled={useDetectedValues && zReportConfidence?.overall === "high"}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-bold text-slate-900">{t("Credit Card Breakdown")}</p>
          <p className="text-base font-extrabold tabular-nums text-slate-900">
            {formatCurrency(cardBreakdown?.grand_total || 0)}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm text-slate-700">
          {cardTypes.map((type) => (
            <div key={type} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="font-semibold text-slate-900 capitalize">{t(type)}</div>
              <div className="mt-0.5 tabular-nums text-base font-extrabold text-slate-900">
                {formatCurrency(cardBreakdown?.[type]?.total || 0)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {cardBreakdown?.[type]?.count || 0} {t("tx")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-sm font-semibold text-slate-700">{t("Expected Card")}</div>
              <div className="text-xl font-bold tabular-nums text-emerald-600">
                {formatCurrency(posCardTotal)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-sm font-semibold text-slate-700">{t("Card Difference")}</div>
              <div className={`text-xl font-bold tabular-nums ${cardDiffColor}`}>
                {formatCurrency(cardDifference)}
              </div>
            </div>
          </div>
          {(detectedTable || detectedDelivery) && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-semibold text-slate-700">
                  {t("Table")} {t("Card Difference")}
                </div>
                <div
                  className={`text-xl font-bold tabular-nums ${
                    splitCardDiff.table < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(splitCardDiff.table)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-semibold text-slate-700">
                  {t("Delivery")} {t("Card Difference")}
                </div>
                <div
                  className={`text-xl font-bold tabular-nums ${
                    splitCardDiff.delivery < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(splitCardDiff.delivery)}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <input
            ref={deliveryReceiptInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleTerminalReceiptUpload(files, "delivery");
              e.target.value = "";
            }}
            disabled={uploadingDelivery}
          />
          <button
            type="button"
            onClick={() => deliveryReceiptInputRef.current?.click()}
            disabled={uploadingDelivery}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-sm font-semibold">
              {uploadingDelivery ? t("Uploading...") : t("Upload delivery receipts")}
            </span>
          </button>

          <input
            ref={tableReceiptInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleTerminalReceiptUpload(files, "table");
              e.target.value = "";
            }}
            disabled={uploadingTable}
          />
          <button
            type="button"
            onClick={() => tableReceiptInputRef.current?.click()}
            disabled={uploadingTable}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-sm font-semibold">
              {uploadingTable ? t("Uploading...") : t("Upload table receipts")}
            </span>
          </button>
        </div>
      </div>
      <div className="mt-1 text-[15px] text-slate-500">
        {t("Table receipts")}: {tableReceiptCount} | {t("Delivery receipts")}: {deliveryReceiptCount}
      </div>
      {zReportPreviewUrls.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {zReportPreviewUrls.map((previewUrl, idx) => (
              <img
                key={`zreport_preview_${idx}`}
                src={previewUrl}
                alt={`Terminal slip preview ${idx + 1}`}
                className="h-24 w-auto rounded-xl border border-slate-200 object-contain"
              />
            ))}
          </div>
        </div>
      )}
      {terminalReportUrls.length > 0 ? (
        <div className="mt-2 text-xs text-slate-500">
          {t("Uploaded")} ({terminalReportUrls.length}):
          <div className="mt-1 flex flex-wrap gap-2">
            {terminalReportUrls.map((url, idx) => (
              <a
                key={`${url}_${idx}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline"
              >
                {t("View receipt")} #{idx + 1}
              </a>
            ))}
          </div>
        </div>
      ) : terminalReportUrl ? (
        <div className="mt-2 text-xs text-slate-500">
          {t("Uploaded")}: 
          <a href={terminalReportUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
            {t("View receipt")}
          </a>
        </div>
      ) : null}

      {terminalReportDetails.length > 0 && (
        <div className="mt-3 space-y-2">
          {terminalReportDetails.map((report) => (
            <div
              key={`report_detail_${report.id}`}
              className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">
                  {(report.receipt_group || "table") === "delivery" ? `${t("Delivery")} ` : `${t("Table")} `}
                  {t("Receipt")} #{report.id}
                  {report.file_name ? ` - ${report.file_name}` : ""}
                </p>
                {report.bank_name && <p className="text-[11px] text-slate-500">{report.bank_name}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteTerminalReceipt(report.id)}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                  >
                    {t("Delete")}
                  </button>
                  {report.confidence?.overall && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        report.confidence.overall === "high"
                          ? "bg-emerald-100 text-emerald-700"
                          : report.confidence.overall === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t("Confidence")}: {report.confidence.overall}
                    </span>
                  )}
                  {report.report_url && (
                    <a href={report.report_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                      {t("View receipt")}
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-500">{t("Card")}</p>
                  <p className="font-semibold tabular-nums">
                    {report.extracted?.card_total != null ? formatCurrency(report.extracted.card_total) : t("Not found")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-500">{t("Cash")}</p>
                  <p className="font-semibold tabular-nums">
                    {report.extracted?.cash_total != null ? formatCurrency(report.extracted.cash_total) : t("Not found")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-500">{t("Grand Total")}</p>
                  <p className="font-semibold tabular-nums">
                    {report.extracted?.grand_total != null ? formatCurrency(report.extracted.grand_total) : t("Not found")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-500">{t("Tx Count")}</p>
                  <p className="font-semibold tabular-nums">
                    {report.extracted?.tx_count != null ? report.extracted.tx_count : t("Not found")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-500">{t("Refund")}</p>
                  <p className="font-semibold tabular-nums">
                    {report.extracted?.refund_total != null
                      ? formatCurrency(report.extracted.refund_total)
                      : t("Not found")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {zReportDetected && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">{t("Detected Totals Sum")}</div>
            {zReportConfidence?.overall && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  zReportConfidence.overall === "high"
                    ? "bg-emerald-100 text-emerald-700"
                    : zReportConfidence.overall === "medium"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {t("Confidence")}: {zReportConfidence.overall}
              </span>
            )}
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-slate-700">{t("Sum")}:</span>
              <span className="tabular-nums">
                {t("Card")}: <strong>{zReportDetected.card_total != null ? formatCurrency(zReportDetected.card_total) : t("Not found")}</strong>
              </span>
              <span className="tabular-nums">
                {t("Cash")}: <strong>{zReportDetected.cash_total != null ? formatCurrency(zReportDetected.cash_total) : t("Not found")}</strong>
              </span>
              <span className="tabular-nums">
                {t("Grand Total")}: <strong>{zReportDetected.grand_total != null ? formatCurrency(zReportDetected.grand_total) : t("Not found")}</strong>
              </span>
              <span className="tabular-nums">
                {t("Tx Count")}: <strong>{zReportDetected.tx_count != null ? zReportDetected.tx_count : t("Not found")}</strong>
              </span>
              <span className="tabular-nums">
                {t("Refund")}: <strong>{zReportDetected.refund_total != null ? formatCurrency(zReportDetected.refund_total) : t("Not found")}</strong>
              </span>
            </div>
          </div>
          {(detectedTable || detectedDelivery) && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {detectedTable && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="font-semibold text-slate-700">{t("Table")}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>
                      {t("Card")}: <strong>{detectedTable.card_total != null ? formatCurrency(detectedTable.card_total) : t("Not found")}</strong>
                    </span>
                    <span>
                      {t("Tx Count")}: <strong>{detectedTable.tx_count != null ? detectedTable.tx_count : t("Not found")}</strong>
                    </span>
                    <span>
                      {t("Refund")}: <strong>{detectedTable.refund_total != null ? formatCurrency(detectedTable.refund_total) : t("Not found")}</strong>
                    </span>
                  </div>
                </div>
              )}
              {detectedDelivery && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="font-semibold text-slate-700">{t("Delivery")}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>
                      {t("Card")}: <strong>{detectedDelivery.card_total != null ? formatCurrency(detectedDelivery.card_total) : t("Not found")}</strong>
                    </span>
                    <span>
                      {t("Tx Count")}: <strong>{detectedDelivery.tx_count != null ? detectedDelivery.tx_count : t("Not found")}</strong>
                    </span>
                    <span>
                      {t("Refund")}: <strong>{detectedDelivery.refund_total != null ? formatCurrency(detectedDelivery.refund_total) : t("Not found")}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          {zReportConfidence?.overall === "low" && (
            <p className="mt-1 text-xs text-red-600">{t("Please verify detected values before closing.")}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              id="useDetectedValues"
              type="checkbox"
              checked={useDetectedValues}
              onChange={(e) => handleUseDetectedToggle(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="useDetectedValues" className="text-xs text-slate-600">
              {t("Use detected values")}
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
