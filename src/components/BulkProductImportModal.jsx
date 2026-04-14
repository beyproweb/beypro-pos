import React, { useEffect, useMemo, useState } from "react";
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import secureFetch from "../utils/secureFetch";
import { API_ORIGIN } from "../utils/api";

const DEFAULT_COLUMN_ORDER = [
  "name",
  "category",
  "price",
  "description",
  "preparation_time",
  "tags",
  "allergens",
  "visible",
  "image",
];

const TEMPLATE_HEADERS = [
  "name",
  "category",
  "price",
  "description",
  "preparation_time",
  "tags",
  "allergens",
  "visible",
  "image",
];

const TEMPLATE_SAMPLE_ROW = [
  "Cheeseburger",
  "Burgers",
  "12.50",
  "Angus beef, cheddar, house sauce",
  "15",
  "beef,classic",
  "dairy,gluten",
  "true",
  "https://example.com/images/cheeseburger.jpg",
];

const HEADER_ALIASES = {
  name: ["name", "product", "productname", "product_name", "item", "title"],
  category: ["category", "group", "section", "type"],
  price: ["price", "sellingprice", "selling_price", "saleprice", "sale_price"],
  description: ["description", "details", "note", "notes"],
  preparation_time: [
    "preparationtime",
    "preparation_time",
    "preptime",
    "prep_time",
    "prep",
  ],
  tags: ["tags", "tag"],
  allergens: ["allergens", "allergen"],
  visible: ["visible", "active", "enabled", "published"],
  image: ["image", "imageurl", "image_url", "photo", "picture", "imagepath"],
};

const UPLOADS_BASE = API_ORIGIN || "";

const HEADER_LOOKUP = Object.entries(HEADER_ALIASES).reduce((map, [key, aliases]) => {
  aliases.forEach((alias) => {
    map.set(alias, key);
  });
  return map;
}, new Map());

const TABS = [
  { id: "upload", icon: Upload, label: "Upload CSV/XLSX" },
  { id: "paste", icon: ClipboardList, label: "Paste from Excel" },
  { id: "review", icon: FileSpreadsheet, label: "Review & Fix" },
];

const createRowId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const mapHeaderCell = (value) => HEADER_LOOKUP.get(normalizeHeader(value)) || null;

const normalizeProductName = (value) => String(value || "").trim().toLowerCase();

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  let cleaned = raw.replace(/[^\d,.\-]+/g, "").replace(/\s+/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(/,/g, ".");
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseBoolean = (value, fallback = true) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1", "visible", "active", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "hidden", "inactive", "disabled"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const isBlankRow = (row) =>
  !Array.isArray(row) || row.every((cell) => String(cell ?? "").trim() === "");

const looksLikeAbsoluteImageUrl = (value) => /^(https?:)?\/\//i.test(String(value || ""));

const resolveUploadedImageSrc = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  if (looksLikeAbsoluteImageUrl(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `${UPLOADS_BASE}/uploads/${raw}`;
};

const downloadBlob = (filename, content, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const uploadRowImage = async (file) => {
  if (!file) return "";
  const formData = new FormData();
  formData.append("file", file);
  const data = await secureFetch("/upload", {
    method: "POST",
    body: formData,
  });
  return String(data?.url || "").trim();
};

const normalizeImportedRow = (row) => ({
  id: createRowId(),
  sourceRowNumber: row.sourceRowNumber,
  name: String(row.name || "").trim(),
  category: String(row.category || "").trim(),
  price: String(row.price ?? "").trim(),
  description: String(row.description || "").trim(),
  preparation_time: String(row.preparation_time ?? "").trim(),
  tags: String(row.tags || "").trim(),
  allergens: String(row.allergens || "").trim(),
  visible:
    row.visible === "" || row.visible === null || row.visible === undefined
      ? "true"
      : String(row.visible).trim(),
  image: String(row.image || "").trim(),
  imagePreview: resolveUploadedImageSrc(row.image),
  imageFile: null,
  imageFileName: "",
  duplicateAction: "skip",
});

const rowsFromMatrix = (matrix) => {
  const compactRows = (Array.isArray(matrix) ? matrix : []).filter((row) => !isBlankRow(row));
  if (compactRows.length === 0) return [];

  const firstRow = compactRows[0] || [];
  const mappedHeaders = firstRow.map(mapHeaderCell);
  const hasHeader = mappedHeaders.filter(Boolean).length >= 2;
  const columnKeys = hasHeader
    ? firstRow.map((cell, index) => mappedHeaders[index] || `extra_${index}`)
    : DEFAULT_COLUMN_ORDER.map((key) => key);

  const dataRows = hasHeader ? compactRows.slice(1) : compactRows;
  return dataRows
    .map((cells, index) => {
      const row = {
        sourceRowNumber: hasHeader ? index + 2 : index + 1,
        name: "",
        category: "",
        price: "",
        description: "",
        preparation_time: "",
        tags: "",
        allergens: "",
        visible: "true",
        image: "",
      };

      cells.forEach((cell, cellIndex) => {
        const key = columnKeys[cellIndex] || DEFAULT_COLUMN_ORDER[cellIndex] || `extra_${cellIndex}`;
        if (key.startsWith("extra_")) return;
        row[key] = cell ?? "";
      });

      return normalizeImportedRow(row);
    })
    .filter((row) =>
      [row.name, row.category, row.price, row.description, row.tags, row.allergens].some(
        (value) => String(value || "").trim() !== ""
      )
    );
};

const validateRow = ({ row, serverError, batchDuplicateError, t }) => {
  const errors = [];
  if (!String(row?.name || "").trim()) {
    errors.push(t("Name is required."));
  }
  if (!String(row?.category || "").trim()) {
    errors.push(t("Category is required."));
  }
  const price = toNumber(row?.price);
  if (!(price > 0)) {
    errors.push(t("Price must be greater than 0."));
  }
  const prepTimeRaw = String(row?.preparation_time ?? "").trim();
  if (prepTimeRaw && toNumber(prepTimeRaw) < 0) {
    errors.push(t("Preparation time cannot be negative."));
  }
  if (batchDuplicateError) {
    errors.push(batchDuplicateError);
  }
  if (serverError) {
    errors.push(serverError);
  }
  return errors;
};

const buildPayload = (row, baseProduct = null, imageValue = null) => ({
  ...(baseProduct && typeof baseProduct === "object" ? baseProduct : {}),
  name: String(row.name || "").trim(),
  category: String(row.category || "").trim(),
  price: toNumber(row.price),
  description: String(row.description || "").trim(),
  preparation_time: String(row.preparation_time || "").trim()
    ? toNumber(row.preparation_time)
    : null,
  tags: String(row.tags || "").trim(),
  allergens: String(row.allergens || "").trim(),
  visible: parseBoolean(
    row.visible,
    baseProduct && baseProduct.visible !== undefined ? baseProduct.visible !== false : true
  ),
  ingredients: Array.isArray(baseProduct?.ingredients) ? baseProduct.ingredients : [],
  extras: Array.isArray(baseProduct?.extras) ? baseProduct.extras : [],
  discount_type: baseProduct?.discount_type || "none",
  discount_value:
    baseProduct?.discount_value !== undefined && baseProduct?.discount_value !== null
      ? Number(baseProduct.discount_value) || 0
      : 0,
  selected_extras_group: Array.isArray(baseProduct?.selected_extras_group)
    ? baseProduct.selected_extras_group
    : [],
  show_add_to_cart_modal: baseProduct?.show_add_to_cart_modal !== false,
  image:
    imageValue !== null
      ? imageValue
      : String(row.image || baseProduct?.image || "").trim(),
});

export default function BulkProductImportModal({
  isOpen,
  onClose,
  onImported,
  categories = [],
  existingProducts = [],
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("upload");
  const [rows, setRows] = useState([]);
  const [pasteText, setPasteText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [serverErrorsById, setServerErrorsById] = useState({});

  const existingProductsByName = useMemo(() => {
    const map = new Map();
    (Array.isArray(existingProducts) ? existingProducts : []).forEach((product) => {
      const key = normalizeProductName(product?.name);
      if (key && !map.has(key)) {
        map.set(key, product);
      }
    });
    return map;
  }, [existingProducts]);

  const importedNameCounts = useMemo(() => {
    const counts = new Map();
    rows.forEach((row) => {
      const key = normalizeProductName(row?.name);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [rows]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("upload");
      setRows([]);
      setPasteText("");
      setSourceLabel("");
      setErrorMessage("");
      setSummaryMessage("");
      setIsImporting(false);
      setServerErrorsById({});
    }
  }, [isOpen]);

  const rowsWithValidation = useMemo(
    () =>
      rows.map((row) => {
        const normalizedName = normalizeProductName(row?.name);
        const duplicateMatch = normalizedName ? existingProductsByName.get(normalizedName) || null : null;
        const batchDuplicateError =
          normalizedName && (importedNameCounts.get(normalizedName) || 0) > 1
            ? t("This name appears more than once in the import batch.")
            : "";
        const duplicateAction = duplicateMatch
          ? row.duplicateAction === "merge"
            ? "merge"
            : "skip"
          : "create";

        return {
          ...row,
          duplicateMatch,
          duplicateAction,
          willSkip: duplicateMatch && duplicateAction === "skip",
          errors: validateRow({
            row,
            serverError: serverErrorsById[row.id],
            batchDuplicateError,
            t,
          }),
        };
      }),
    [rows, serverErrorsById, t, existingProductsByName, importedNameCounts]
  );

  const invalidRows = rowsWithValidation.filter((row) => row.errors.length > 0);
  const skippedRows = rowsWithValidation.filter((row) => row.willSkip);
  const readyRows = rowsWithValidation.filter((row) => row.errors.length === 0 && !row.willSkip);
  const duplicateRows = rowsWithValidation.filter((row) => Boolean(row.duplicateMatch));

  const setParsedRows = (nextRows, source) => {
    if (!Array.isArray(nextRows) || nextRows.length === 0) {
      setRows([]);
      setSourceLabel("");
      setSummaryMessage("");
      setErrorMessage(t("No product rows were found in the selected data."));
      setActiveTab("review");
      return;
    }

    setRows(nextRows);
    setSourceLabel(source);
    setServerErrorsById({});
    setErrorMessage("");
    setSummaryMessage(
      t("Loaded {{count}} rows. Review them before importing.", {
        count: nextRows.length,
      })
    );
    setActiveTab("review");
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames?.[0];
      const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      const matrix = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) : [];
      setParsedRows(rowsFromMatrix(matrix), file.name);
    } catch (error) {
      console.error("❌ Failed to parse import file:", error);
      setErrorMessage(t("Failed to read the selected file."));
    } finally {
      event.target.value = "";
    }
  };

  const handlePasteParse = () => {
    const normalized = pasteText.replace(/\r\n/g, "\n").trim();
    if (!normalized) {
      setErrorMessage(t("Paste product rows from Excel first."));
      return;
    }

    const lines = normalized
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
    const matrix = lines.map((line) => line.split(delimiter));
    setParsedRows(rowsFromMatrix(matrix), t("Pasted data"));
  };

  const updateRow = (rowId, field, value) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
    setServerErrorsById((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setErrorMessage("");
    setSummaryMessage("");
  };

  const handleDuplicateActionChange = (rowId, value) => {
    updateRow(rowId, "duplicateAction", value === "merge" ? "merge" : "skip");
  };

  const handleRowImageChange = async (rowId, file) => {
    if (!file) {
      setRows((current) =>
        current.map((row) =>
          row.id === rowId
            ? { ...row, imageFile: null, imageFileName: "", imagePreview: "" }
            : row
        )
      );
      return;
    }

    try {
      const preview = await readFileAsDataUrl(file);
      setRows((current) =>
        current.map((row) =>
          row.id === rowId
            ? {
                ...row,
                imageFile: file,
                imageFileName: file.name,
                imagePreview: preview,
              }
            : row
        )
      );
      setErrorMessage("");
      setSummaryMessage("");
    } catch (error) {
      console.error("❌ Failed to load row image:", error);
      setErrorMessage(t("Failed to read the selected image."));
    }
  };

  const downloadTemplate = (format) => {
    setIsDownloadingTemplate(true);
    try {
      if (format === "xlsx") {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW]);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
        XLSX.writeFile(workbook, "product-import-template.xlsx");
      } else {
        const csv = [TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW]
          .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
          .join("\n");
        downloadBlob("product-import-template.csv", csv, "text/csv;charset=utf-8;");
      }
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const removeRow = (rowId) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
    setServerErrorsById((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };

  const removeInvalidRows = () => {
    const invalidIds = new Set(invalidRows.map((row) => row.id));
    setRows((current) => current.filter((row) => !invalidIds.has(row.id)));
    setServerErrorsById((current) => {
      const next = { ...current };
      invalidIds.forEach((id) => delete next[id]);
      return next;
    });
    setErrorMessage("");
    setSummaryMessage(
      t("Removed {{count}} invalid rows.", { count: invalidIds.size })
    );
  };

  const handleImport = async () => {
    setActiveTab("review");

    if (rowsWithValidation.length === 0) {
      setErrorMessage(t("Add product rows before importing."));
      return;
    }
    if (invalidRows.length > 0) {
      setErrorMessage(t("Resolve or remove invalid rows before importing."));
      return;
    }

    setIsImporting(true);
    setErrorMessage("");
    setSummaryMessage("");

    const nextServerErrors = {};
    const successfulIds = [];
    let createdCount = 0;
    let mergedCount = 0;

    for (const row of readyRows) {
      try {
        const imageValue = row.imageFile ? await uploadRowImage(row.imageFile) : String(row.image || "").trim();
        const isMerge = Boolean(row.duplicateMatch) && row.duplicateAction === "merge";
        const endpoint = isMerge ? `/products/${row.duplicateMatch.id}` : "/products";
        const method = isMerge ? "PUT" : "POST";
        const response = await secureFetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(row, isMerge ? row.duplicateMatch : null, imageValue)),
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        successfulIds.push(row.id);
        if (isMerge) {
          mergedCount += 1;
        } else {
          createdCount += 1;
        }
      } catch (error) {
        nextServerErrors[row.id] =
          error?.details?.body?.error ||
          error?.details?.body?.message ||
          error?.message ||
          t("Failed to import row.");
      }
    }

    setIsImporting(false);

    if (successfulIds.length > 0 || skippedRows.length > 0) {
      const resolvedIds = new Set([...successfulIds, ...skippedRows.map((row) => row.id)]);
      setRows((current) => current.filter((row) => !resolvedIds.has(row.id)));
      if (successfulIds.length > 0) {
        onImported?.(successfulIds.length);
      }
    }

    if (Object.keys(nextServerErrors).length > 0) {
      setServerErrorsById(nextServerErrors);
      setErrorMessage(t("Some rows could not be imported. Fix them and try again."));
      if (successfulIds.length > 0) {
        setSummaryMessage(
          t("Created {{created}}, merged {{merged}}, skipped {{skipped}}. Remaining rows need attention.", {
            created: createdCount,
            merged: mergedCount,
            skipped: skippedRows.length,
          })
        );
      }
      return;
    }

    if (successfulIds.length > 0 || skippedRows.length > 0) {
      setSummaryMessage(
        t("Created {{created}}, merged {{merged}}, skipped {{skipped}} successfully.", {
          created: createdCount,
          merged: mergedCount,
          skipped: skippedRows.length,
        })
      );
      onClose?.();
      return;
    }

    setErrorMessage(t("No products were imported."));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={isImporting ? undefined : onClose}
      contentLabel={t("Import Products")}
      className="bg-white w-full max-w-6xl rounded-[32px] shadow-2xl border border-slate-200 mx-auto my-8 outline-none overflow-hidden"
      overlayClassName="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      shouldCloseOnOverlayClick={!isImporting}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_rgba(255,255,255,0)_45%),linear-gradient(135deg,_#ffffff,_#f8fafc)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
            {t("Bulk Import")}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{t("Import Products")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("Upload a sheet or paste rows from Excel, validate them, then import in bulk.")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isImporting}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={t("Close")}
        >
          <X size={18} />
        </button>
      </div>

      <div className="border-b border-slate-200 px-6 py-4 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "bg-slate-900 text-white shadow-lg"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <Icon size={16} />
                {t(tab.label)}
              </button>
            );
          })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate("csv")}
              disabled={isDownloadingTemplate}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSpreadsheet size={16} />
              {t("Template CSV")}
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate("xlsx")}
              disabled={isDownloadingTemplate}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSpreadsheet size={16} />
              {t("Template XLSX")}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-h-[72vh] overflow-y-auto space-y-5 bg-slate-50/40">
        {(errorMessage || summaryMessage) && (
          <div className="space-y-3">
            {errorMessage && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {summaryMessage && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span>{summaryMessage}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
            <label className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white px-8 py-10 text-center shadow-sm transition hover:border-sky-400 hover:bg-sky-50/40">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-100 text-sky-700 shadow-sm">
                <Upload size={28} />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                {t("Drop a CSV or Excel file here")}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                {t("Supported formats: .csv, .xls, .xlsx. Use headers like name, category, price for best results.")}
              </p>
              <span className="mt-5 inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition group-hover:scale-[1.02]">
                {t("Choose File")}
              </span>
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{t("Required fields")}</h3>
              <div className="mt-4 grid gap-3">
                {[
                  { label: t("name"), hint: t("Product name") },
                  { label: t("category"), hint: t("Menu category") },
                  { label: t("price"), hint: t("Selling price") },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                {t("Optional columns like description, preparation_time, tags, allergens, and visible will be imported when present.")}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {t("Use the template downloads above if you want the exact import column order, including an optional image column.")}
              </p>
            </div>
          </div>
        )}

        {activeTab === "paste" && (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t("Paste rows from Excel")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("Copy a range from Excel or Google Sheets and paste it below.")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePasteParse}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
                >
                  <ClipboardList size={16} />
                  {t("Parse Rows")}
                </button>
              </div>

              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={t("name\tcategory\tprice\nCheeseburger\tBurgers\t12.50")}
                className="mt-5 min-h-[280px] w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{t("How it works")}</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
                <p>{t("1. Include a header row when possible.")}</p>
                <p>{t("2. If no headers exist, the first columns are read as name, category, price, description.")}</p>
                <p>{t("3. Invalid rows stay editable in the review tab before anything is imported.")}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "review" && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">{t("Rows loaded")}</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{rowsWithValidation.length}</div>
                {sourceLabel && (
                  <div className="mt-2 text-xs text-slate-400">{sourceLabel}</div>
                )}
              </div>
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <div className="text-sm text-emerald-700">{t("Valid rows")}</div>
                <div className="mt-2 text-3xl font-bold text-emerald-800">{readyRows.length}</div>
              </div>
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5 shadow-sm">
                <div className="text-sm text-rose-700">{t("Rows needing fixes")}</div>
                <div className="mt-2 text-3xl font-bold text-rose-800">{invalidRows.length}</div>
              </div>
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="text-sm text-amber-700">{t("Duplicates found")}</div>
                <div className="mt-2 text-3xl font-bold text-amber-800">{duplicateRows.length}</div>
              </div>
            </div>

            {rowsWithValidation.length > 0 && invalidRows.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={removeInvalidRows}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                  {t("Remove Invalid Rows")}
                </button>
              </div>
            )}

            {rowsWithValidation.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
                <FileSpreadsheet size={30} className="mx-auto text-slate-300" />
                <p className="mt-4 text-base font-medium text-slate-700">
                  {t("No rows loaded yet")}
                </p>
                <p className="mt-2 text-sm">
                  {t("Upload a file or paste Excel data to start the import review.")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <datalist id="bulk-import-category-options">
                  {(Array.isArray(categories) ? categories : []).filter(Boolean).map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>

                {rowsWithValidation.map((row, index) => {
                  const hasErrors = row.errors.length > 0;
                  return (
                    <div
                      key={row.id}
                      className={`rounded-[28px] border p-5 shadow-sm transition ${
                        hasErrors
                          ? "border-rose-200 bg-rose-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {t("Row {{count}}", { count: row.sourceRowNumber || index + 1 })}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                              {row.name || t("Untitled product")}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                hasErrors
                                  ? "bg-rose-100 text-rose-700"
                                  : row.willSkip
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {hasErrors
                                ? t("Needs review")
                                : row.willSkip
                                  ? t("Skipped")
                                  : t("Ready")}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-700"
                        >
                          <Trash2 size={15} />
                          {t("Remove")}
                        </button>
                      </div>

                      {row.duplicateMatch && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-amber-900">
                                {t("Duplicate product name found")}
                              </div>
                              <div className="mt-1 text-sm text-amber-700">
                                {t("Matches existing product: {{name}}", {
                                  name: row.duplicateMatch.name,
                                })}
                              </div>
                              <div className="mt-1 text-xs text-amber-700/80">
                                {t("Current product")}: {row.duplicateMatch.category || "-"} • {row.duplicateMatch.price || 0}
                              </div>
                            </div>
                            <label className="block min-w-[220px]">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                                {t("Duplicate handling")}
                              </span>
                              <select
                                value={row.duplicateAction}
                                onChange={(event) =>
                                  handleDuplicateActionChange(row.id, event.target.value)
                                }
                                className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                              >
                                <option value="skip">{t("Skip this row")}</option>
                                <option value="merge">{t("Merge into existing product")}</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Name")}
                          </span>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(event) => updateRow(row.id, "name", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Category")}
                          </span>
                          <input
                            type="text"
                            list="bulk-import-category-options"
                            value={row.category}
                            onChange={(event) => updateRow(row.id, "category", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Price")}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.price}
                            onChange={(event) => updateRow(row.id, "price", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block md:col-span-2">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Description")}
                          </span>
                          <input
                            type="text"
                            value={row.description}
                            onChange={(event) =>
                              updateRow(row.id, "description", event.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Preparation Time")}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.preparation_time}
                            onChange={(event) =>
                              updateRow(row.id, "preparation_time", event.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Tags")}
                          </span>
                          <input
                            type="text"
                            value={row.tags}
                            onChange={(event) => updateRow(row.id, "tags", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Allergens")}
                          </span>
                          <input
                            type="text"
                            value={row.allergens}
                            onChange={(event) => updateRow(row.id, "allergens", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Visible")}
                          </span>
                          <select
                            value={row.visible}
                            onChange={(event) => updateRow(row.id, "visible", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          >
                            <option value="true">{t("Yes")}</option>
                            <option value="false">{t("No")}</option>
                          </select>
                        </label>

                        <div className="block md:col-span-3">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {t("Picture")}
                          </span>
                          <div className="grid gap-4 md:grid-cols-[120px_1fr]">
                            <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-inner">
                              {row.imagePreview ? (
                                <img
                                  src={row.imagePreview}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="px-3 text-center text-xs font-medium text-slate-400">
                                  {t("No image")}
                                </div>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                  <Upload size={16} />
                                  {t("Upload Picture")}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) =>
                                      handleRowImageChange(row.id, event.target.files?.[0] || null)
                                    }
                                  />
                                </label>
                                {(row.imageFile || row.imagePreview) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRowImageChange(row.id, null)}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                                  >
                                    <Trash2 size={16} />
                                    {t("Remove Picture")}
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                value={row.image}
                                onChange={(event) => updateRow(row.id, "image", event.target.value)}
                                placeholder={t("Image URL or uploaded image path")}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              />
                              {(row.imageFileName || row.image) && (
                                <div className="text-xs text-slate-500">
                                  {row.imageFileName
                                    ? t("Selected file: {{name}}", { name: row.imageFileName })
                                    : row.image}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {hasErrors && (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">
                          <div className="font-semibold">{t("Row errors")}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.errors.map((error) => (
                              <span
                                key={`${row.id}-${error}`}
                                className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold"
                              >
                                {error}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">
          {rowsWithValidation.length > 0
            ? t("{{valid}} ready, {{invalid}} needing fixes, {{skipped}} skipped", {
                valid: readyRows.length,
                invalid: invalidRows.length,
                skipped: skippedRows.length,
              })
            : t("No rows ready yet")}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || rowsWithValidation.length === 0 || invalidRows.length > 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <Upload size={16} />
            {isImporting ? t("Importing...") : t("Confirm Import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}