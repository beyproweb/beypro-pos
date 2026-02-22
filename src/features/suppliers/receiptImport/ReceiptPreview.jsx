import React, { useEffect, useMemo, useRef, useState } from "react";

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const ReceiptPreview = ({
  t,
  previewUrl,
  fileMeta,
  formatBytes,
  ocrSelectableTokens = [],
  requestSelectionOcr,
  onReplace,
  onClear,
}) => {
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState("");
  const [ocrSelectionLoading, setOcrSelectionLoading] = useState(false);
  const imageRef = useRef(null);
  const overlayRef = useRef(null);

  const minZoom = 0.5;
  const maxZoom = 3;
  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);
  const isPdf =
    String(fileMeta?.type || "").toLowerCase().includes("pdf") ||
    (fileMeta?.name || "").toLowerCase().endsWith(".pdf");
  const isImage = Boolean(previewUrl) && !isPdf;
  const canCopyField = Boolean(
    selection &&
      Number(selection.width) > 0.005 &&
      Number(selection.height) > 0.005 &&
      imageRef.current?.naturalWidth &&
      imageRef.current?.naturalHeight
  );
  const hasOcrBoxes = Array.isArray(ocrSelectableTokens) && ocrSelectableTokens.length > 0;

  useEffect(() => {
    setSelection(null);
    setSelectionStart(null);
    setCopiedMessage("");
  }, [previewUrl, isPdf]);

  const applyZoom = (next) => {
    const clamped = Math.min(maxZoom, Math.max(minZoom, next));
    setZoom(Number(clamped.toFixed(2)));
  };

  const getRelativePoint = (event) => {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const beginSelection = (event) => {
    if (!isImage) return;
    const point = getRelativePoint(event);
    if (!point) return;
    setSelectionStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    setCopiedMessage("");
  };

  const updateSelection = (event) => {
    if (!selectionStart) return;
    const point = getRelativePoint(event);
    if (!point) return;
    const left = Math.min(selectionStart.x, point.x);
    const top = Math.min(selectionStart.y, point.y);
    const width = Math.abs(point.x - selectionStart.x);
    const height = Math.abs(point.y - selectionStart.y);
    setSelection({ x: left, y: top, width, height });
  };

  const endSelection = () => {
    if (!selectionStart) return;
    setSelectionStart(null);
  };

  const copyFieldCoords = async () => {
    if (!selection) return;
    const text = `x=${selection.x.toFixed(4)}, y=${selection.y.toFixed(4)}, width=${selection.width.toFixed(4)}, height=${selection.height.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(t("Field coordinates copied."));
    } catch {
      setCopiedMessage(t("Could not copy coordinates."));
    }
  };

  const copyFieldImage = async () => {
    if (!canCopyField) return;
    const blob = await getSelectionBlob();
    if (!blob) {
      setCopiedMessage(t("Could not copy selected field."));
      return;
    }
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
        setCopiedMessage(t("Selected field copied as image. Paste into an image-supported app."));
        return;
      }
      downloadBlob(blob, "invoice-field.png");
      setCopiedMessage(t("Clipboard image not supported. Downloaded selected field."));
    } catch {
      downloadBlob(blob, "invoice-field.png");
      setCopiedMessage(t("Could not copy to clipboard. Downloaded selected field instead."));
    }
  };

  const downloadBlob = (blob, filename) => {
    const fallbackUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = fallbackUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(fallbackUrl);
  };

  const getSelectionBlob = () =>
    new Promise((resolve) => {
      if (!canCopyField || !selection || !imageRef.current) {
        resolve(null);
        return;
      }
      const img = imageRef.current;
      const sx = Math.round(selection.x * img.naturalWidth);
      const sy = Math.round(selection.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(selection.width * img.naturalWidth));
      const sh = Math.max(1, Math.round(selection.height * img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob((blob) => resolve(blob || null), "image/png");
    });

  const downloadSelectedField = async () => {
    if (!canCopyField) return;
    const blob = await getSelectionBlob();
    if (!blob) {
      setCopiedMessage(t("Could not export selected field."));
      return;
    }
    downloadBlob(blob, "invoice-field.png");
    setCopiedMessage(t("Selected field downloaded."));
  };

  const normalizeTokenBox = (token) => {
    if (!token) return null;
    const x = Number(token.x);
    const y = Number(token.y);
    const width = Number(token.width);
    const height = Number(token.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    if (token.normalized) {
      return { x, y, width, height };
    }
    const iw = Number(imageRef.current?.naturalWidth || 0);
    const ih = Number(imageRef.current?.naturalHeight || 0);
    if (!(iw > 0 && ih > 0)) return null;
    return {
      x: x / iw,
      y: y / ih,
      width: width / iw,
      height: height / ih,
    };
  };

  const copyFieldText = async () => {
    if (!selection) return;
    let text = "";

    if (hasOcrBoxes) {
      const selected = [];
      ocrSelectableTokens.forEach((token) => {
        const box = normalizeTokenBox(token);
        if (!box) return;
        const left = Math.max(selection.x, box.x);
        const top = Math.max(selection.y, box.y);
        const right = Math.min(selection.x + selection.width, box.x + box.width);
        const bottom = Math.min(selection.y + selection.height, box.y + box.height);
        const iw = right - left;
        const ih = bottom - top;
        if (iw <= 0 || ih <= 0) return;
        const intersectionArea = iw * ih;
        const tokenArea = box.width * box.height;
        const overlapRatio = tokenArea > 0 ? intersectionArea / tokenArea : 0;
        if (overlapRatio < 0.2) return;
        selected.push({
          text: String(token.text || "").trim(),
          x: box.x,
          y: box.y,
        });
      });

      const cleaned = selected.filter((entry) => entry.text);
      cleaned.sort((a, b) => {
        const yDiff = Math.abs(a.y - b.y);
        if (yDiff < 0.012) return a.x - b.x;
        return a.y - b.y;
      });
      const mergedLines = [];
      cleaned.forEach((entry) => {
        const last = mergedLines[mergedLines.length - 1];
        if (!last) {
          mergedLines.push({ y: entry.y, text: entry.text });
          return;
        }
        if (Math.abs(last.y - entry.y) <= 0.012) {
          last.text = `${last.text} ${entry.text}`.trim();
        } else {
          mergedLines.push({ y: entry.y, text: entry.text });
        }
      });
      text = mergedLines.map((line) => line.text).join("\n").trim();
    } else if (requestSelectionOcr) {
      const blob = await getSelectionBlob();
      if (!blob) {
        setCopiedMessage(t("Could not OCR selected field."));
        return;
      }
      try {
        setOcrSelectionLoading(true);
        const ocrText = await requestSelectionOcr(blob);
        text = String(ocrText || "").trim();
      } catch {
        text = "";
      } finally {
        setOcrSelectionLoading(false);
      }
    }

    if (!text) {
      setCopiedMessage(
        hasOcrBoxes
          ? t("No OCR text found in selected area.")
          : t("Could not extract text from selected area.")
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(t("Selected field text copied."));
    } catch {
      setCopiedMessage(t("Could not copy selected field text."));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t("Receipt preview")}
        </h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReplace}
            className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/60 dark:bg-indigo-900/30 dark:text-indigo-100"
          >
            {t("Replace file")}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t("Clear")}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
        {fileMeta ? (
          <div className="space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-100">{fileMeta.name}</div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span>{formatBytes(fileMeta.size)}</span>
              <span>{fileMeta.type || t("Unknown type")}</span>
              {fileMeta.uploadedAt ? (
                <span>
                  {t("Uploaded at")}: {new Date(fileMeta.uploadedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{t("No file selected yet.")}</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <button
          type="button"
          onClick={() => applyZoom(zoom - 0.25)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          disabled={zoom <= minZoom}
        >
          {t("Zoom out")}
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          {t("Reset")}
        </button>
        <button
          type="button"
          onClick={() => applyZoom(zoom + 0.25)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          disabled={zoom >= maxZoom}
        >
          {t("Zoom in")}
        </button>
        <span className="ml-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{zoomLabel}</span>
      </div>

      {isImage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={copyFieldText}
            disabled={!selection || ocrSelectionLoading}
            className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700/60 dark:bg-indigo-900/30 dark:text-indigo-200"
          >
            {ocrSelectionLoading ? t("Reading text...") : t("Copy selected field text")}
          </button>
          <button
            type="button"
            onClick={copyFieldImage}
            disabled={!canCopyField}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            {t("Copy selected field image")}
          </button>
          <button
            type="button"
            onClick={copyFieldCoords}
            disabled={!selection}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {t("Copy field coordinates")}
          </button>
          <button
            type="button"
            onClick={() => setSelection(null)}
            disabled={!selection}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {t("Clear selection")}
          </button>
          <button
            type="button"
            onClick={downloadSelectedField}
            disabled={!canCopyField}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {t("Download selected field")}
          </button>
          {copiedMessage ? (
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{copiedMessage}</span>
          ) : null}
          {!hasOcrBoxes && !requestSelectionOcr ? (
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {t("No OCR box coordinates available from backend for text copy.")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 h-[320px] overflow-auto rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
        {previewUrl ? (
          isPdf ? (
            <div
              className="min-h-full min-w-full"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${100 / zoom}%` }}
            >
              <object data={previewUrl} type="application/pdf" className="h-full w-full">
                <p className="p-4 text-xs text-slate-600 dark:text-slate-200">
                  {t("PDF preview not available in this browser.")}
                </p>
              </object>
            </div>
          ) : (
            <div className="p-2">
              <div
                className="relative inline-block"
                style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
              >
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt={t("Receipt preview")}
                  className="block max-w-full select-none"
                  draggable={false}
                />
                <div
                  ref={overlayRef}
                  className="absolute inset-0 cursor-crosshair"
                  onMouseDown={beginSelection}
                  onMouseMove={updateSelection}
                  onMouseUp={endSelection}
                  onMouseLeave={endSelection}
                >
                  {selection ? (
                    <div
                      className="absolute border-2 border-indigo-500 bg-indigo-500/15"
                      style={{
                        left: `${selection.x * 100}%`,
                        top: `${selection.y * 100}%`,
                        width: `${selection.width * 100}%`,
                        height: `${selection.height * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            {t("Upload a receipt to preview")}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptPreview;
