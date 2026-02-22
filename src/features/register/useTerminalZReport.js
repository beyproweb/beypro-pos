import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export function useTerminalZReport({ secureFetch, toast, t, lastOpenAt }) {
  const [terminalCardTotal, setTerminalCardTotal] = useState("");
  const [terminalTxCount, setTerminalTxCount] = useState("");
  const [terminalRefundTotal, setTerminalRefundTotal] = useState("");
  const [terminalReportUrl, setTerminalReportUrl] = useState("");
  const [terminalReportUrls, setTerminalReportUrls] = useState([]);
  const [terminalReportDetails, setTerminalReportDetails] = useState([]);
  const [terminalReportUploading, setTerminalReportUploading] = useState({
    table: false,
    delivery: false,
  });
  const terminalReportUploadingAny =
    Boolean(terminalReportUploading?.table) || Boolean(terminalReportUploading?.delivery);
  const [terminalCashTotal, setTerminalCashTotal] = useState("");
  const [terminalGrandTotal, setTerminalGrandTotal] = useState("");
  const [zReportDetected, setZReportDetected] = useState(null);
  const [zReportConfidence, setZReportConfidence] = useState(null);
  const [zReportPreviewUrls, setZReportPreviewUrls] = useState([]);
  const zReportPreviewUrlsRef = useRef([]);
  const [useDetectedValues, setUseDetectedValues] = useState(false);

  const toFiniteOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const applyDetectedExtractedValues = (detected) => {
    if (!detected) return;
    const fmt2 = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(2) : "";
    };
    if (detected.card_total != null) setTerminalCardTotal(fmt2(detected.card_total));
    if (detected.tx_count != null) setTerminalTxCount(String(detected.tx_count));
    if (detected.refund_total != null) setTerminalRefundTotal(fmt2(detected.refund_total));
    if (detected.cash_total != null) setTerminalCashTotal(fmt2(detected.cash_total));
    if (detected.grand_total != null) setTerminalGrandTotal(fmt2(detected.grand_total));
  };

  const buildDetectedFromReceiptDetails = (details) => {
    const round2 = (n) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return 0;
      return Math.round(x * 100) / 100;
    };
    const totals = {
      card_total: 0,
      cash_total: 0,
      grand_total: 0,
      tx_count: 0,
      refund_total: 0,
    };
    const seen = {
      card_total: false,
      cash_total: false,
      grand_total: false,
      tx_count: false,
      refund_total: false,
    };
    const confidenceCard = [];
    const confidenceTx = [];
    const levels = [];

    (details || []).forEach((d) => {
      const e = d?.extracted || {};
      const c = d?.confidence || {};
      const card = toFiniteOrNull(e.card_total);
      const cash = toFiniteOrNull(e.cash_total);
      const grand = toFiniteOrNull(e.grand_total);
      const tx = toFiniteOrNull(e.tx_count);
      const refund = toFiniteOrNull(e.refund_total);
      if (card != null) {
        totals.card_total += card;
        seen.card_total = true;
      }
      if (cash != null) {
        totals.cash_total += cash;
        seen.cash_total = true;
      }
      if (grand != null) {
        totals.grand_total += grand;
        seen.grand_total = true;
      }
      if (tx != null) {
        totals.tx_count += tx;
        seen.tx_count = true;
      }
      if (refund != null) {
        totals.refund_total += refund;
        seen.refund_total = true;
      }

      const cardConf = toFiniteOrNull(c.card_total);
      const txConf = toFiniteOrNull(c.tx_count);
      if (cardConf != null) confidenceCard.push(cardConf);
      if (txConf != null) confidenceTx.push(txConf);
      if (typeof c.overall === "string" && c.overall) levels.push(c.overall);
    });

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const overall =
      levels.length === 0
        ? "low"
        : levels.every((l) => l === "high")
        ? "high"
        : levels.some((l) => l === "high" || l === "medium")
        ? "medium"
        : "low";

    return {
      extracted: {
        card_total: seen.card_total ? round2(totals.card_total) : null,
        cash_total: seen.cash_total ? round2(totals.cash_total) : null,
        grand_total: seen.grand_total ? round2(totals.grand_total) : null,
        tx_count: seen.tx_count ? Math.round(totals.tx_count) : null,
        refund_total: seen.refund_total ? round2(totals.refund_total) : null,
        currency: "TRY",
      },
      confidence: {
        overall,
        card_total: avg(confidenceCard),
        tx_count: avg(confidenceTx),
      },
    };
  };

  const tableReceiptCount = terminalReportDetails.filter(
    (r) => (r?.receipt_group || "table") === "table"
  ).length;
  const deliveryReceiptCount = terminalReportDetails.filter(
    (r) => (r?.receipt_group || "table") === "delivery"
  ).length;

  const detectedTable = useMemo(() => {
    if (!tableReceiptCount) return null;
    return buildDetectedFromReceiptDetails(
      terminalReportDetails.filter((r) => (r?.receipt_group || "table") === "table")
    ).extracted;
  }, [terminalReportDetails, tableReceiptCount]);

  const detectedDelivery = useMemo(() => {
    if (!deliveryReceiptCount) return null;
    return buildDetectedFromReceiptDetails(
      terminalReportDetails.filter((r) => (r?.receipt_group || "table") === "delivery")
    ).extracted;
  }, [terminalReportDetails, deliveryReceiptCount]);

  const computeSplitCardDiff = useCallback(
    (cardBreakdown = {}) => {
      const posTable = Number(cardBreakdown?.table?.total || 0);
      const posDelivery =
        Number(cardBreakdown?.delivery?.total || 0) +
        Number(cardBreakdown?.phone?.total || 0) +
        Number(cardBreakdown?.takeaway?.total || 0) +
        Number(cardBreakdown?.unknown?.total || 0);
      const termTable = Number(detectedTable?.card_total || 0);
      const termDelivery = Number(detectedDelivery?.card_total || 0);
      return {
        table: termTable - posTable,
        delivery: termDelivery - posDelivery,
      };
    },
    [detectedTable, detectedDelivery]
  );

  const handleDeleteTerminalReceipt = useCallback(
    (receiptId) => {
      setTerminalReportDetails((prev) => {
        const removed = prev.find((r) => r.id === receiptId);
        if (removed?.preview_url) {
          URL.revokeObjectURL(removed.preview_url);
        }
        const next = prev.filter((r) => r.id !== receiptId);
        const nextReportUrls = next.map((r) => r.report_url).filter(Boolean);
        const nextPreviewUrls = next.map((r) => r.preview_url).filter(Boolean);

        setTerminalReportUrls(nextReportUrls);
        setTerminalReportUrl(nextReportUrls[0] || "");
        setZReportPreviewUrls(nextPreviewUrls);

        if (!next.length) {
          setZReportDetected(null);
          setZReportConfidence(null);
          setUseDetectedValues(false);
          setTerminalCardTotal("");
          setTerminalTxCount("");
          setTerminalRefundTotal("");
          setTerminalCashTotal("");
          setTerminalGrandTotal("");
          return next;
        }

        const detected = buildDetectedFromReceiptDetails(next);
        setZReportDetected(detected.extracted);
        setZReportConfidence(detected.confidence);
        applyDetectedExtractedValues(detected.extracted);
        return next;
      });
    },
    [buildDetectedFromReceiptDetails]
  );

  const handleTerminalReceiptUpload = useCallback(
    async (selectedFiles, receiptGroup = "table") => {
      const files = Array.isArray(selectedFiles)
        ? selectedFiles.filter(Boolean)
        : selectedFiles
        ? [selectedFiles]
        : [];
      if (!files.length) return;
      let newPreviewUrls = [];
      const group = receiptGroup === "delivery" ? "delivery" : "table";
      try {
        setTerminalReportUploading((prev) => ({ ...(prev || {}), [group]: true }));
        const hadExisting = terminalReportDetails.length > 0;

        const previewUrls = files.map((f) =>
          f.type?.startsWith("image/") ? URL.createObjectURL(f) : ""
        );
        newPreviewUrls = previewUrls.filter(Boolean);

        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        if (lastOpenAt) {
          form.append("openTime", lastOpenAt);
        }
        if (import.meta.env.DEV || window?.__ZREPORT_DEBUG__) {
          form.append("debug", "1");
        }
        const res = await secureFetch("/terminal-zreport/parse", {
          method: "POST",
          body: form,
        });

        if (!res?.report_url && !Array.isArray(res?.report_urls) && !Array.isArray(res?.reports)) {
          throw new Error("Upload failed");
        }

        const uploadedUrls = Array.isArray(res?.report_urls) ? res.report_urls.filter(Boolean) : [];
        const nextIdBase = terminalReportDetails.reduce(
          (maxId, r) => Math.max(maxId, Number(r?.id) || 0),
          0
        );
        const reportDetails = Array.isArray(res?.reports)
          ? res.reports.map((report, index) => ({
              id: nextIdBase + index + 1,
              file_name: report?.file_name || "",
              report_url: report?.report_url || "",
              preview_url: previewUrls[index] || "",
              receipt_group: receiptGroup,
              extracted: report?.extracted || {},
              confidence: report?.confidence || {},
              bank_name: report?.raw?.bank_name || report?.extracted?.bank_name || "",
            }))
          : [];
        const mergedDetails = [...terminalReportDetails, ...reportDetails];
        const mergedUrls = [...terminalReportUrls, ...uploadedUrls];
        setTerminalReportDetails(mergedDetails);
        setTerminalReportUrls(mergedUrls);
        setTerminalReportUrl(mergedUrls[0] || terminalReportUrl || res.report_url || "");
        setZReportPreviewUrls(mergedDetails.map((r) => r.preview_url).filter(Boolean));

        const mergedDetected = buildDetectedFromReceiptDetails(mergedDetails);
        setZReportDetected(mergedDetected.extracted);
        setZReportConfidence(mergedDetected.confidence);

        const shouldUseDetected = res?.confidence?.overall === "high";
        if (!hadExisting) {
          setUseDetectedValues(shouldUseDetected);
        }
        applyDetectedExtractedValues(mergedDetected.extracted);

        toast.success(
          files.length > 1
            ? `${t("Terminal receipt uploaded.")} (${files.length})`
            : t("Terminal receipt uploaded.")
        );
      } catch (err) {
        newPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        console.error("❌ Terminal receipt upload failed:", err);
        toast.error(err?.message || t("Failed to upload receipt"));
      } finally {
        setTerminalReportUploading((prev) => ({ ...(prev || {}), [group]: false }));
      }
    },
    [
      buildDetectedFromReceiptDetails,
      lastOpenAt,
      secureFetch,
      t,
      terminalReportDetails,
      terminalReportUrl,
      terminalReportUrls,
      toast,
    ]
  );

  const handleUseDetectedToggle = useCallback(
    (checked) => {
      setUseDetectedValues(checked);
      if (!checked || !zReportDetected) return;
      applyDetectedExtractedValues(zReportDetected);
    },
    [zReportDetected]
  );

  useEffect(() => {
    zReportPreviewUrlsRef.current = zReportPreviewUrls;
  }, [zReportPreviewUrls]);

  useEffect(() => {
    return () => {
      (zReportPreviewUrlsRef.current || []).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const resetTerminalZReport = useCallback(() => {
    setTerminalCardTotal("");
    setTerminalTxCount("");
    setTerminalRefundTotal("");
    setTerminalReportUrl("");
    setTerminalReportUrls([]);
    setTerminalReportDetails([]);
    setTerminalReportUploading({ table: false, delivery: false });
    setTerminalCashTotal("");
    setTerminalGrandTotal("");
    setZReportDetected(null);
    setZReportConfidence(null);
    zReportPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    setZReportPreviewUrls([]);
    setUseDetectedValues(false);
  }, []);

  return {
    terminalCardTotal,
    setTerminalCardTotal,
    terminalTxCount,
    setTerminalTxCount,
    terminalRefundTotal,
    setTerminalRefundTotal,
    terminalReportUrl,
    setTerminalReportUrl,
    terminalReportUrls,
    setTerminalReportUrls,
    terminalReportDetails,
    setTerminalReportDetails,
    terminalReportUploading,
    setTerminalReportUploading,
    terminalReportUploadingAny,
    terminalCashTotal,
    setTerminalCashTotal,
    terminalGrandTotal,
    setTerminalGrandTotal,
    zReportDetected,
    setZReportDetected,
    zReportConfidence,
    setZReportConfidence,
    zReportPreviewUrls,
    setZReportPreviewUrls,
    useDetectedValues,
    setUseDetectedValues,
    tableReceiptCount,
    deliveryReceiptCount,
    detectedTable,
    detectedDelivery,
    computeSplitCardDiff,
    handleDeleteTerminalReceipt,
    handleTerminalReceiptUpload,
    handleUseDetectedToggle,
    resetTerminalZReport,
  };
}
