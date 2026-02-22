import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, UploadCloud, Undo2 } from "lucide-react";
import secureFetch from "../utils/secureFetch";
import { useStock } from "../context/StockContext";
import { useCurrency } from "../context/CurrencyContext";

const reasonColors = {
  expired: "bg-orange-100 text-orange-700",
  damaged: "bg-amber-100 text-amber-700",
  "kitchen error": "bg-yellow-100 text-yellow-700",
  spoiled: "bg-rose-100 text-rose-700",
  theft: "bg-red-100 text-red-700",
  other: "bg-slate-100 text-slate-700",
};

const WasteAdjustmentsTab = () => {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const { groupedData, fetchStock } = useStock();

  const [search, setSearch] = useState("");
  const [selectedStockId, setSelectedStockId] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [batches, setBatches] = useState([]);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({
    totalWaste: 0,
    wastePctOfSales: 0,
    topProducts: [],
    byReason: [],
  });
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    reason: "",
  });
  const [form, setForm] = useState({
    quantity: "",
    reason: "expired",
    otherReason: "",
    notes: "",
    expiryDate: "",
    supplierBatchRef: "",
    batchId: "",
    managerPin: "",
    entryType: "waste",
    imageFile: null,
    imagePreview: "",
  });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stockOptions = useMemo(() => {
    return (groupedData || []).map((item) => ({
      value: item.stock_id || item.id,
      label: item.name,
      unit: item.unit,
      expiry_date: item.expiry_date,
    }));
  }, [groupedData]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return stockOptions;
    const term = search.toLowerCase();
    return stockOptions.filter((opt) => opt.label.toLowerCase().includes(term));
  }, [stockOptions, search]);

  const selectedOption = useMemo(
    () => stockOptions.find((opt) => String(opt.value) === String(selectedStockId)),
    [stockOptions, selectedStockId]
  );

  const loadBatches = useCallback(
    async (stockId) => {
      if (!stockId) {
        setBatches([]);
        return;
      }
      try {
        const res = await secureFetch(`/stock/batches/${stockId}`);
        const list = Array.isArray(res?.batches) ? res.batches : [];
        setBatches(list);
        const first = list.find((b) => (b.remaining_quantity || 0) > 0);
        if (first) {
          setForm((prev) => ({
            ...prev,
            expiryDate: first.expiry_date || prev.expiryDate,
            batchId: first.id,
            supplierBatchRef: first.batch_ref || "",
          }));
        }
      } catch (err) {
        console.warn("Failed to load batches", err);
        setBatches([]);
      }
    },
    [setForm]
  );

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.reason) params.set("reason", filters.reason);
      const qs = params.toString();
      const res = await secureFetch(qs ? `/stock/waste/logs?${qs}` : "/stock/waste/logs");
      setLogs(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      console.error("Failed to load waste logs:", err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [filters.from, filters.to, filters.reason]);

  const loadMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const qs = params.toString();
      const res = await secureFetch(qs ? `/stock/waste/metrics?${qs}` : "/stock/waste/metrics");
      setMetrics({
        totalWaste: res?.totalWaste || 0,
        wastePctOfSales: res?.wastePctOfSales || 0,
        topProducts: res?.topProducts || [],
        byReason: res?.byReason || [],
      });
    } catch (err) {
      console.error("Failed to load waste metrics:", err);
      setMetrics({ totalWaste: 0, wastePctOfSales: 0, topProducts: [], byReason: [] });
    } finally {
      setLoadingMetrics(false);
    }
  }, [filters.from, filters.to]);

  useEffect(() => {
    loadLogs();
    loadMetrics();
  }, [loadLogs, loadMetrics]);

  useEffect(() => {
    if (!selectedOption) return;
    setSelectedUnit(selectedOption.unit || "");
    setForm((prev) => ({
      ...prev,
      expiryDate: selectedOption.expiry_date || prev.expiryDate,
    }));
    loadBatches(selectedOption.value);
  }, [selectedOption, loadBatches]);

  const handleFileChange = (file) => {
    if (!file) {
      setForm((prev) => ({ ...prev, imageFile: null, imagePreview: "" }));
      return;
    }
    const preview = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, imageFile: file, imagePreview: preview }));
  };

  const uploadImage = async () => {
    if (!form.imageFile) return null;
    const fd = new FormData();
    fd.append("file", form.imageFile);

    const tryUpload = async (url) => {
      // use secureFetch to include auth headers; it handles FormData
      const res = await secureFetch(url, {
        method: "POST",
        body: fd,
      });
      return res?.url || null;
    };

    try {
      return await tryUpload("/api/upload");
    } catch (errPrimary) {
      console.warn("Primary upload failed, retrying /upload:", errPrimary?.message);
      try {
        return await tryUpload("/upload");
      } catch (errFallback) {
        console.error("Image upload failed:", errFallback?.message || errFallback);
        toast.warn(t("Optional image upload failed; saving without image."));
        return null; // keep optional
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedStockId) {
      toast.error(t("Select a product"));
      return;
    }
    if (!form.managerPin) {
      toast.error(t("Manager PIN is required"));
      return;
    }
    if (String(form.reason).toLowerCase() === "other" && !form.otherReason.trim()) {
      toast.error(t("Add a note for Other reason"));
      return;
    }

    setSubmitting(true);
    try {
      const imageUrl = await uploadImage();
      const payload = {
        stock_id: selectedStockId,
        quantity: parseFloat(form.quantity),
        reason: form.reason,
        notes: form.notes,
        other_reason_note: form.otherReason,
        batch_id: form.batchId || undefined,
        expiry_date: form.expiryDate || undefined,
        supplier_batch_ref: form.supplierBatchRef || undefined,
        image_url: imageUrl || undefined,
        manager_pin: form.managerPin,
        type: form.entryType,
      };

      await secureFetch("/stock/waste", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success(t("Waste entry recorded"));
      setForm((prev) => ({
        ...prev,
        quantity: "",
        notes: "",
        otherReason: "",
        imageFile: null,
        imagePreview: "",
        managerPin: "",
      }));
      fetchStock();
      loadLogs();
      loadMetrics();
    } catch (err) {
      console.error("Waste submit failed:", err);
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("manager pin")) {
        toast.error(
          t("Manager PIN required – use a manager/admin PIN (not password).")
        );
      } else {
        toast.error(err?.message || t("Failed to save waste entry"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reasonBadge = (reasonValue) => {
    const key = String(reasonValue || "").toLowerCase();
    const cls = reasonColors[key] || reasonColors.other;
    return (
      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${cls}`}>
        {reasonValue || t("Unspecified")}
      </span>
    );
  };

  const deriveLoss = (row) => {
    const fields = [
      row?.total_value,
      row?.total_loss_value,
      row?.meta?.total_loss_value,
    ];
    for (const f of fields) {
      const n = Number(f);
      if (Number.isFinite(n) && n !== 0) return n;
    }
    const qty = Number(row?.qty) || 0;
    const cost = Number(row?.cost_price) || 0;
    if (qty && cost) return qty * cost;
    return 0;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Total Waste")}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {loadingMetrics ? "…" : formatCurrency(metrics.totalWaste || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 px-3 py-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-200">
              {t("Loss")}
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {t("Waste booked against restaurant COGS")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Waste % of Sales")}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {loadingMetrics ? "…" : `${(metrics.wastePctOfSales || 0).toFixed(2)}%`}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              KPI
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {t("Tracks waste leakage versus revenue")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Top Wasted Product")}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {loadingMetrics
                  ? "…"
                  : metrics.topProducts?.[0]?.product_name || t("No waste yet")}
              </p>
            </div>
            <Undo2 className="h-6 w-6 text-slate-400" />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {metrics.topProducts?.[0]
              ? `${formatCurrency(metrics.topProducts[0].total_loss || 0)} ${t("lost")}`
              : t("Logged waste entries will appear here")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("Waste Entry")}
              </h3>
              <p className="text-sm text-slate-500">
                {t("Deduct from oldest batch automatically")}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              {t("Manager PIN required")}
            </span>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("Product")}
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search stocked items")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/50">
                  {filteredOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setSelectedStockId(opt.value)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        String(selectedStockId) === String(opt.value)
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-100"
                          : "hover:bg-white dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-xs text-slate-500">
                        {t("Unit")}: {opt.unit || "—"}
                      </div>
                    </button>
                  ))}
                  {filteredOptions.length === 0 && (
                    <div className="px-2 py-3 text-xs text-slate-500">{t("No matches")}</div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Quantity")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.quantity}
                    onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Unit")}
                  </span>
                  <input
                    disabled
                    value={selectedUnit || "—"}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Waste Reason")}
                  </span>
                  <select
                    value={form.reason}
                    onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="expired">{t("Expired")}</option>
                    <option value="damaged">{t("Damaged")}</option>
                    <option value="kitchen error">{t("Kitchen error")}</option>
                    <option value="spoiled">{t("Spoiled")}</option>
                    <option value="theft">{t("Theft")}</option>
                    <option value="other">{t("Other")}</option>
                  </select>
                </label>

                {String(form.reason).toLowerCase() === "other" && (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t("Reason note (required)")}
                    </span>
                    <input
                      type="text"
                      value={form.otherReason}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, otherReason: e.target.value }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Expiry date")}
                  </span>
                  <input
                    type="date"
                    value={form.expiryDate || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Supplier batch ref")}
                  </span>
                  <input
                    type="text"
                    value={form.supplierBatchRef}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, supplierBatchRef: e.target.value }))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder={t("If provided on invoice")}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Batch")}
                  </span>
                  <select
                    value={form.batchId}
                    onChange={(e) => setForm((prev) => ({ ...prev, batchId: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">{t("Auto (oldest)")}</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_ref || t("Batch")} — {b.remaining_quantity} |{" "}
                        {b.expiry_date || t("No expiry")}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Notes")}
                  </span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="radio"
                        name="entryType"
                        value="waste"
                        checked={form.entryType === "waste"}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, entryType: e.target.value }))
                        }
                      />
                      {t("Waste")}
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="radio"
                        name="entryType"
                        value="adjustment_correction"
                        checked={form.entryType === "adjustment_correction"}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, entryType: e.target.value }))
                        }
                      />
                      {t("Adjustment Correction")}
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow focus-within:ring-2 focus-within:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <UploadCloud className="h-4 w-4" />
                      {t("Upload proof")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                      />
                    </label>
                    {form.imagePreview ? (
                      <img
                        src={form.imagePreview}
                        alt="preview"
                        className="h-10 w-10 rounded-lg object-cover ring-2 ring-indigo-200"
                      />
                    ) : null}
                  </div>
                </div>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t("Manager PIN")}
                  </span>
                  <input
                    type="password"
                    value={form.managerPin}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, managerPin: e.target.value }))
                    }
                    required
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder={t("Manager approval required")}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.entryType === "waste" ? t("Save Waste") : t("Save Correction")}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("Waste by Reason")}
              </h3>
              <p className="text-sm text-slate-500">{t("Color coded risk reasons")}</p>
            </div>
          </div>
          <div className="space-y-2">
            {(metrics.byReason || []).map((row) => (
              <div
                key={row.reason}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex items-center gap-2">
                  {reasonBadge(row.reason)}
                  <span className="text-slate-600 dark:text-slate-300">
                    {formatCurrency(row.total_loss || 0)}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {parseFloat(row.total_qty || 0).toLocaleString()} {t("units")}
                </span>
              </div>
            ))}
            {metrics.byReason.length === 0 && (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                {t("No waste recorded in this range")}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("Waste Log")}
            </h3>
            <p className="text-sm text-slate-500">
              {t("FIFO applied automatically. Entries are immutable.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <select
              value={filters.reason}
              onChange={(e) => setFilters((prev) => ({ ...prev, reason: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">{t("All reasons")}</option>
              <option value="expired">{t("Expired")}</option>
              <option value="damaged">{t("Damaged")}</option>
              <option value="kitchen error">{t("Kitchen error")}</option>
              <option value="spoiled">{t("Spoiled")}</option>
              <option value="theft">{t("Theft")}</option>
              <option value="other">{t("Other")}</option>
            </select>
            <button
              type="button"
              onClick={loadLogs}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {loadingLogs && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("Refresh")}
            </button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-300">
              <tr>
                <th className="px-4 py-2 text-left">{t("Date")}</th>
                <th className="px-4 py-2 text-left">{t("Product")}</th>
                <th className="px-4 py-2 text-left">{t("Qty")}</th>
                <th className="px-4 py-2 text-left">{t("Reason")}</th>
                <th className="px-4 py-2 text-left">{t("Loss")}</th>
                <th className="px-4 py-2 text-left">{t("Batch")}</th>
                <th className="px-4 py-2 text-left">{t("Notes")}</th>
                <th className="px-4 py-2 text-left">{t("Proof")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {logs.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                    {row.product_name || row.stock_id}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.qty} {row.unit}
                  </td>
                  <td className="px-4 py-3">{reasonBadge(row.reason)}</td>
                  <td className="px-4 py-3 text-rose-600 dark:text-rose-300">
                    {row.movement_type === "adjustment_correction"
                      ? formatCurrency(deriveLoss(row) * -1)
                      : formatCurrency(deriveLoss(row))}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.batch_ref || row.batch_id || t("Auto")}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-300">{row.notes}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                    {row.image_url ? (
                      <button
                        type="button"
                        onClick={() => window.open(row.image_url, "_blank", "noopener,noreferrer")}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                      >
                        <img
                          src={row.image_url}
                          alt="proof"
                          className="h-8 w-8 rounded object-cover"
                        />
                        {t("Open")}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{t("No proof")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-rose-600 dark:text-rose-300">
                    {row.movement_type === "adjustment_correction"
                      ? formatCurrency(deriveLoss(row) * -1)
                      : formatCurrency(deriveLoss(row))}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300"
                  >
                    {t("No waste entries found for this range")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WasteAdjustmentsTab;
