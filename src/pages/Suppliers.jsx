import React, { useState, useEffect, useRef, useMemo } from "react";
import { useStock } from "../context/StockContext";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toast } from "react-toastify"; // make sure you imported toast
import 'react-toastify/dist/ReactToastify.css';
import io from "socket.io-client";
import SupplierCartModal from "../modals/SupplierCartModal";
import SupplierScheduledCart from "../components/SupplierScheduledCart";
import { useTranslation } from "react-i18next";
import {
  SUPPLIERS_API,
  SUPPLIER_CARTS_API,
  SUPPLIER_CART_ITEMS_API,
  TRANSACTIONS_API,
} from "../utils/api";
import socket from "../utils/socket";
import secureFetch from "../utils/secureFetch";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import { useHeader } from "../context/HeaderContext";
import SupplierOverview from "../components/SupplierOverview";
import { useCurrency } from "../context/CurrencyContext";
const API_URL = import.meta.env.VITE_API_URL || "";
export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [supplierIngredients, setSupplierIngredients] = useState([]);
const [newTransaction, setNewTransaction] = useState({
  rows: [
    {
      ingredient_select: "__add_new__",
      ingredient: "",
      quantity: "",
      unit: "kg",
      total_cost: "",
      expiry_date: "",
    }, // ✅ default one row
  ],
  paymentStatus: "Due",
  paymentMethod: "Due",
});

  const BACKEND_URL = "http://localhost:5000";
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSupplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("suppliers");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    tax_number: "",
    id_number: "",
    email: "",
    address: "",
    notes: "",
  });
  const [cartHistory, setCartHistory] = useState([]);
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const [cartItems, setCartItems] = useState([]); // cart items
  const [showCartModal, setShowCartModal] = useState(false); // cart modal visibility
  const [cartId, setCartId] = useState(null);
  const [sending, setSending] = useState(false); // 🔥 control button loading state
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoOrder, setAutoOrder] = useState(false);
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatType, setRepeatType] = useState("none");
  const [transactionView, setTransactionView] = useState("all");
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [feedbackForm, setFeedbackForm] = useState({
    quality: 4,
    packaging: 4,
    punctuality: 4,
    accuracy: 4,
    deliveryTimeDays: "",
    onTime: true,
    complaint: false,
    notes: "",
  });
  const [openDays, setOpenDays] = useState({});
  const socketRef = useRef();
  const { fetchStock } = useStock();
  const [receiptFile, setReceiptFile] = useState(null);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const containerRef = useRef(null);
  const { formatCurrency, config } = useCurrency();

  useEffect(() => {
    setHeader(prev => ({
      ...prev,
      title: t("Suppliers"),
      subtitle: undefined,
      tableNav: null,
    }));
  }, [setHeader, t]);

  useEffect(() => () => setHeader({}), [setHeader]);


useEffect(() => {
  console.log("✅ fetchStock from context is loaded in Supplier.js");
  fetchStock(); // ← actually call it here
}, [fetchStock]); // ✅ include it in dependency array

// --- Simple section nav + scroll-to-top ---
const sectionTabs = [
  { key: "supplier-overview", label: t("Overview") },
  { key: "primary-supplier", label: t("Add Product") }, // ✅ NEW TAB
  { key: "transaction-history", label: t("Transactions") },
  { key: "price-tracking", label: t("Price") },
  { key: "feedback-log", label: t("Feedback") },
  { key: "profile-balance", label: t("Profile") },
  { key: "supplier-carts", label: t("Carts") },
];

const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el || !containerRef.current) return;
  const y = el.offsetTop - 60; // adjust offset
  containerRef.current.scrollTo({ top: y, behavior: "smooth" });
};


const [showUp, setShowUp] = useState(false);
useEffect(() => {
  const node = containerRef.current;
  if (!node) return;
  const onScroll = () => setShowUp(node.scrollTop > 400);
  node.addEventListener("scroll", onScroll);
  return () => node.removeEventListener("scroll", onScroll);
}, []);


  useEffect(() => {
  socketRef.current = socket;

    const handleStockRealtime = () => {
      console.log("📦 Supplier.js: Stock update received");
      fetchStock();
      if (cartId) fetchCartItems(cartId); // ⬅️ NEW: refresh cart if modal is open
    };

    socketRef.current.on("connect", () => {
      console.log("🔌 Socket connected");
    });

    socketRef.current.on("disconnect", (reason) => {
      console.warn("⚠️ Socket disconnected:", reason);
    });

    socketRef.current.on("reconnect_attempt", (attempt) => {
      console.log(`🔁 Reconnect attempt #${attempt}`);
    });

    socketRef.current.on("reconnect_failed", () => {
      console.error("❌ Reconnect failed after max attempts");
      toast.error("Socket connection failed. Please refresh.");
    });

    socketRef.current.on("stock-updated", handleStockRealtime);

    return () => {
      socketRef.current.off("stock-updated", handleStockRealtime);

    };
  }, [fetchStock, cartId]);


// ✅ Open supplier cart
const openSupplierCart = async (cartIdArg, supplierId) => {
  try {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setSelectedSupplier(supplier);

    let data;

    if (cartIdArg) {
      // Explicit open by id (useful for history)
      data = await secureFetch(`/supplier-carts/items?cart_id=${cartIdArg}`);
    } else {
      // 🔑 Always prefer scheduled cart for modal
      const scheduled = await secureFetch(`/supplier-carts/scheduled?supplier_id=${supplierId}`);

      if (scheduled) {
        // Also fetch items explicitly for this cart
        const itemsRes = await secureFetch(`/supplier-carts/items?cart_id=${scheduled.cart_id}`);
        data = { ...scheduled, items: itemsRes.items || [] };
      }
    }

    if (!data) return;

    // ✅ Sync state
    setScheduledAt(data.scheduled_at || null);
    setRepeatType(data.repeat_type || "none");
    setRepeatDays(Array.isArray(data.repeat_days) ? data.repeat_days : []);
    setAutoOrder(!!data.auto_confirm);
    setCartItems(data.items || []);

    setCartId(data.cart_id || null);
    setShowCartModal(true);
  } catch (err) {
    console.error("❌ Error opening supplier cart:", err);
  }
};


// ✅ Fetch cart items
const fetchCartItems = async (cartId) => {
  try {
    const data = await secureFetch(`/supplier-carts/items?cart_id=${cartId}`);
    setCartItems(Array.isArray(data?.items) ? data.items : []);

console.log("🔗 fetch from:", API_URL, "repeat_days:", data.repeat_days);

    // ✅ Only update repeatDays if backend actually has them
    if (Array.isArray(data.repeat_days) && data.repeat_days.length > 0) {
      setRepeatDays(data.repeat_days);
    } else {
      console.log("⚠️ Skipping repeatDays update, keeping local:", repeatDays);
    }

    if (data.repeat_type) {
      setRepeatType(data.repeat_type);
    }
    if (typeof data.auto_confirm === "boolean") {
      setAutoOrder(data.auto_confirm);
    }
    if (data.scheduled_at) {
      setScheduledAt(data.scheduled_at);
    }
  } catch (error) {
    console.error("❌ Error fetching cart items:", error);
    setCartItems([]);
  }
};



// ✅ Confirm supplier cart
const confirmSupplierCart = async (cartId) => {
  if (!cartId || !selectedSupplier?.id) return;

  try {
    const res = await secureFetch(`/supplier-carts/${cartId}/confirm`, {
      method: "PUT",
      body: JSON.stringify({
        scheduled_at: scheduledAt,
        repeat_type: repeatType,
        repeat_days: repeatDays,
        auto_confirm: autoOrder,
      }),
    });

    if (!res.cart) return;
    const confirmedCart = res.cart;

    // Reload using the confirmed cart id
const latest = await secureFetch(
     `/supplier-carts/scheduled?supplier_id=${selectedSupplier?.
id}`
   );

    if (latest.scheduled_at) setScheduledAt(latest.scheduled_at);
    if (latest.repeat_type) setRepeatType(latest.repeat_type);
    if (Array.isArray(latest.repeat_days)) setRepeatDays(latest.repeat_days);
    if (typeof latest.auto_confirm === "boolean") setAutoOrder(latest.auto_confirm);
    setCartItems(latest.items || []);
  } catch (err) {
    console.error("❌ Error confirming cart:", err);
  }
};



// ✅ Send supplier cart
const sendSupplierCart = async (cartId) => {
  if (!scheduledAt) {
    toast.error("❌ Please select a schedule date and time first!");
    return;
  }

  try {
    setSending(true);

    // Auto-confirm if enabled
    if (autoOrder) {
      const payload = { scheduled_at: scheduledAt };
      if (repeatType && repeatType !== "none") payload.repeat_type = repeatType;
      if (repeatDays?.length > 0) payload.repeat_days = repeatDays;
      if (typeof autoOrder === "boolean") payload.auto_confirm = autoOrder;

      const confirmRes = await secureFetch(`/supplier-carts/${cartId}/confirm`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (!confirmRes?.cart) {
        toast.error(confirmRes?.error || "❌ Failed to confirm cart before sending.");
        return;
      }
    }

    // ✅ Send the cart
    const sendRes = await secureFetch(`/supplier-carts/${cartId}/send`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });

    if (sendRes?.success) {
      toast.success("✅ Order sent successfully!");
      setShowCartModal(false);
      await fetchStock(); // 🔄 Refresh stock
    } else {
      toast.error(sendRes?.error || "❌ Failed to send order.");
    }
  } catch (error) {
    console.error("❌ Error sending cart:", error);
    toast.error("❌ Network error sending cart.");
  } finally {
    setSending(false);
  }
};






  const handleCartQuantityChange = (index, newQty) => {
    setCartItems(prev => {
      const updated = [...prev];
      updated[index].quantity = parseFloat(newQty).toFixed(2) || 0;
      return updated;
    });
  };

  useEffect(() => {
    secureFetch("/suppliers")
      .then((data) => {
        if (Array.isArray(data)) setSuppliers(data);
      })
      .catch((err) => console.error("❌ Error fetching suppliers:", err));
  }, []);

  // Calculate unit price for the new transaction
  const computedUnitPrice = () => {
    const quantity = parseFloat(newTransaction.quantity);
    const totalCost = parseFloat(newTransaction.total_cost);
    if (!isNaN(quantity) && !isNaN(totalCost) && quantity > 0) {
      if (newTransaction.unit === "g" || newTransaction.unit === "ml") {
        return ((totalCost / quantity) * 1000).toFixed(2);
      }
      return (totalCost / quantity).toFixed(2);
    }
    return "0.00";
  };

const fetchSuppliers = async () => {
    try {
      const data = await secureFetch("/suppliers");
      if (Array.isArray(data)) setSuppliers(data);
      else setSuppliers([]);
    } catch (error) {
      console.error("❌ Error fetching suppliers:", error);
      setSuppliers([]);
    }
  };

  const fetchTransactions = async (supplierId) => {
    try {
      const data = await secureFetch(`/suppliers/${supplierId}/transactions`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("❌ Error fetching transactions:", error);
      setTransactions([]);
    }
  };

  useEffect(() => {
    const supplierId = selectedSupplier?.id;
    if (!supplierId) {
      setSupplierIngredients([]);
      return;
    }

    const loadSupplierIngredients = async () => {
      try {
        const data = await secureFetch(`/suppliers/${supplierId}/ingredients`);
        setSupplierIngredients(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("❌ Error fetching supplier ingredients:", error);
        setSupplierIngredients([]);
      }
    };

    loadSupplierIngredients();
  }, [selectedSupplier?.id]);

  const fetchSupplierDetails = async (supplierId) => {
    try {
      if (!supplierId) return;
      const data = await secureFetch(`/suppliers/${supplierId}`);
      if (!data?.id) throw new Error("Supplier not found");
      setSelectedSupplier(data);
    } catch (error) {
      console.error("❌ Error fetching supplier details:", error);
      setSelectedSupplier(null);
    }
  };

  useEffect(() => {
    const history = Array.isArray(selectedSupplier?.feedback_history)
      ? selectedSupplier?.
feedback_history.map((entry) => ({
          quality:
            entry.quality ??
            entry.quality_rating ??
            entry.rating ??
            entry.score ??
            null,
          packaging:
            entry.packaging ??
            entry.packaging_score ??
            entry.packaging_rating ??
            null,
          punctuality:
            entry.punctuality ??
            entry.delivery_punctuality ??
            entry.on_time_score ??
            null,
          accuracy:
            entry.accuracy ??
            entry.order_accuracy ??
            entry.accuracy_score ??
            null,
          deliveryTimeDays:
            entry.deliveryTimeDays ??
            entry.delivery_time_days ??
            entry.lead_time_days ??
            null,
          onTime:
            entry.onTime ??
            entry.on_time ??
            (typeof entry.was_on_time === "boolean"
              ? entry.was_on_time
              : null),
          complaint:
            entry.complaint ??
            entry.has_complaint ??
            (entry.notes
              ? entry.notes.toLowerCase().includes("complaint")
              : false) ??
            false,
          notes: entry.notes ?? "",
          createdAt:
            entry.createdAt ??
            entry.created_at ??
            entry.date ??
            entry.timestamp ??
            null,
        }))
      : [];
    setFeedbackEntries(history);
    setFeedbackForm({
      quality: 4,
      packaging: 4,
      punctuality: 4,
      accuracy: 4,
      deliveryTimeDays: "",
      onTime: true,
      complaint: false,
      notes: "",
    });
  }, [selectedSupplier?.id]);

  const handleSelectSupplier = (supplierId) => {
    const supplier = suppliers.find((sup) => sup.id === parseInt(supplierId));
    if (!supplier) return;
    setSelectedSupplier(supplier);
    fetchTransactions(supplier.id);
  };

  const totalAllDues = useMemo(() => {
    return suppliers.reduce(
      (sum, supplier) => sum + (Number(supplier.total_due) || 0),
      0
    );
  }, [suppliers]);

  const supplierTransactions = useMemo(() => {
    return transactions.filter(
      (txn) =>
        txn &&
        txn.ingredient &&
        txn.ingredient !== "Payment" &&
        Number(txn.price_per_unit) > 0
    );
  }, [transactions]);

  const supplierIngredientOptions = useMemo(() => {
    const normalize = (value) =>
      typeof value === "string" ? value.trim() : "";
    const keyFor = (name, unit) => `${name.toLowerCase()}|||${unit}`;
    const seen = new Map();

    if (Array.isArray(supplierIngredients) && supplierIngredients.length > 0) {
      supplierIngredients.forEach((row) => {
        const name = normalize(row?.name ?? row?.ingredient);
        const unit = normalize(row?.unit);
        if (!name || !unit) return;
        const key = keyFor(name, unit);
        if (!seen.has(key)) seen.set(key, { name, unit });
      });
    }

    if (seen.size === 0) {
      transactions.forEach((txn) => {
        if (!txn) return;

        if (Array.isArray(txn.items) && txn.items.length > 0) {
          txn.items.forEach((item) => {
            const name = normalize(item?.ingredient);
            const unit = normalize(item?.unit);
            if (!name || !unit) return;
            const key = keyFor(name, unit);
            if (!seen.has(key)) seen.set(key, { name, unit });
          });
        }

        const directName = normalize(txn.ingredient);
        const directUnit = normalize(txn.unit);
        if (
          directName &&
          directUnit &&
          directName !== "Payment" &&
          directName !== "Compiled Receipt"
        ) {
          const key = keyFor(directName, directUnit);
          if (!seen.has(key)) seen.set(key, { name: directName, unit: directUnit });
        }
      });
    }

    return Array.from(seen.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.unit.localeCompare(b.unit, undefined, { sensitivity: "base" });
    });
  }, [supplierIngredients, transactions]);

  const resolveTxnDate = (txn) =>
    txn?.delivery_date ||
    txn?.created_at ||
    txn?.updated_at ||
    txn?.date ||
    null;

  const sortedTransactions = useMemo(() => {
    const toTime = (txn) => {
      const raw = resolveTxnDate(txn);
      if (!raw) return 0;
      const parsed = new Date(raw);
      const time = parsed.getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return [...transactions].sort((a, b) => toTime(b) - toTime(a));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return sortedTransactions.filter((txn) => {
      if (transactionView === "purchases") {
        return txn?.ingredient !== "Payment";
      }
      if (transactionView === "payments") {
        return txn?.ingredient === "Payment";
      }
      return true;
    });
  }, [sortedTransactions, transactionView]);

  const supplierFinancials = useMemo(() => {
    let totalPurchases = 0;
    let totalPaid = 0;
    let monthPurchases = 0;
    let monthPayments = 0;
    let openInvoices = 0;
    let lastInvoiceDate = null;
    let lastPaymentDate = null;

    const now = new Date();

    sortedTransactions.forEach((txn) => {
      if (!txn) return;
      const totalCost = Number(txn.total_cost) || 0;
      const amountPaid = Number(txn.amount_paid) || 0;
      const rawDate = resolveTxnDate(txn);
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
      const isCurrentMonth =
        isValidDate &&
        parsedDate.getMonth() === now.getMonth() &&
        parsedDate.getFullYear() === now.getFullYear();

      if (txn.ingredient === "Payment") {
        const paymentValue = amountPaid || totalCost;
        totalPaid += paymentValue;
        if (isCurrentMonth) {
          monthPayments += paymentValue;
        }
        if (isValidDate) {
          if (!lastPaymentDate || parsedDate > lastPaymentDate) {
            lastPaymentDate = parsedDate;
          }
        }
        return;
      }

      totalPurchases += totalCost;
      totalPaid += amountPaid;

      if (isCurrentMonth) {
        monthPurchases += totalCost;
      }

      if (totalCost - amountPaid > 0.01) {
        openInvoices += 1;
      }

      if (isValidDate) {
        if (!lastInvoiceDate || parsedDate > lastInvoiceDate) {
          lastInvoiceDate = parsedDate;
        }
      }
    });

    const outstanding = Number(selectedSupplier?.total_due ?? 0);
    const coverage = totalPurchases > 0 ? (totalPaid / totalPurchases) * 100 : null;

    return {
      totalPurchases,
      totalPaid,
      outstanding,
      coverage,
      lastInvoiceDate,
      lastPaymentDate,
      monthPurchases,
      monthPayments,
      openInvoices,
    };
  }, [sortedTransactions, selectedSupplier?.total_due]);

const projectedBalance = useMemo(() => {
  const currentOutstanding = Number(supplierFinancials.outstanding ?? 0);

  // Sum all ingredient rows’ total_cost
  const orderTotal = (newTransaction.rows || []).reduce(
    (sum, r) => sum + (parseFloat(r.total_cost) || 0),
    0
  );

  const immediateMethods = ["Cash", "Credit Card", "IBAN"];
  const isImmediate = immediateMethods.includes(newTransaction.paymentMethod);
  const immediatePayment = isImmediate ? orderTotal : 0;

  return currentOutstanding + orderTotal - immediatePayment;
}, [supplierFinancials.outstanding, newTransaction.rows, newTransaction.paymentMethod]);


  const recentReceipts = useMemo(() => {
    return sortedTransactions.filter((txn) => txn?.receipt_url).slice(0, 3);
  }, [sortedTransactions]);

	// Combined due = existing supplier due + current new order total
	const combinedDue = useMemo(() => {
	  const existingDue = Number(selectedSupplier?.total_due || 0);
	  const newOrderTotal = (newTransaction.rows || []).reduce(
	    (sum, r) => sum + (parseFloat(r.total_cost) || 0),
	    0
	  );
	  return existingDue + newOrderTotal;
	}, [selectedSupplier?.total_due, newTransaction.rows]);


  const coveragePercent =
    supplierFinancials.coverage !== null
      ? Math.min(100, Math.max(0, supplierFinancials.coverage))
      : null;

  const outstandingDelta =
    projectedBalance - (supplierFinancials.outstanding ?? 0);

  const isImmediateSettle = ["Cash", "Credit Card", "IBAN"].includes(
    newTransaction.paymentMethod
  );

  const paymentChipLabel = (method) => {
    switch (method) {
      case "Cash":
        return `💵 ${t("Cash")}`;
      case "Credit Card":
        return `💳 ${t("Credit Card")}`;
      case "IBAN":
        return `🏦 ${t("IBAN")}`;
      case "Due":
        return `🕓 ${t("Due")}`;
      default:
        return method || t("Unknown");
    }
  };

  const getLocalizedDate = (value) => {
    if (!value) return t("Not available");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("Not available");
    return parsed.toLocaleString();
  };

  const getReceiptExpirySummary = (txn) => {
    const expiryDates = (txn?.items || [])
      .map((item) => {
        if (!item?.expiry_date) return null;
        const parsed = new Date(item.expiry_date);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })
      .filter(Boolean);

    if (!expiryDates.length) return null;

    const earliest = expiryDates.reduce((prev, curr) =>
      curr < prev ? curr : prev
    );
    const formattedDate = earliest.toLocaleDateString();
    const now = Date.now();
    const diffMs = earliest.getTime() - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return `${t("Expired on")} ${formattedDate}`;
    }

    if (daysLeft <= 3) {
      const dayWord = daysLeft === 1 ? t("day") : t("days");
      return `${t("Expires in")} ${daysLeft} ${dayWord}`;
    }

    return `${t("Expires on")} ${formattedDate}`;
  };

  const priceAlerts = useMemo(() => {
    if (!supplierTransactions.length) return [];

    const grouped = new Map();

    supplierTransactions.forEach((txn) => {
      const ingredient = txn.ingredient || t("Unknown");
      const unit = txn.unit || "";
      const key = `${ingredient}_${unit}`.toLowerCase();
      const price = Number(txn.price_per_unit);
      const dateString =
        txn.delivery_date || txn.created_at || txn.updated_at || txn.date;
      const date = dateString ? new Date(dateString) : null;

      if (!price || !date || Number.isNaN(date.getTime())) {
        return;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push({
        ingredient,
        unit,
        price,
        date,
      });
    });

    const alerts = [];

    grouped.forEach((entries) => {
      if (!entries.length) return;
      entries.sort((a, b) => b.date - a.date);
      const [latest, ...rest] = entries;
      if (!latest) return;
      const baselineCandidate =
        rest.find((entry) => {
          const diffDays = (latest.date - entry.date) / (1000 * 60 * 60 * 24);
          return diffDays >= 30;
        }) || rest[0];
      if (!baselineCandidate || !baselineCandidate.price) return;

      const changePercent =
        ((latest.price - baselineCandidate.price) / baselineCandidate.price) *
        100;

      alerts.push({
        ingredient: latest.ingredient,
        unit: latest.unit,
        latestPrice: latest.price,
        comparisonPrice: baselineCandidate.price,
        changePercent,
        since: baselineCandidate.date,
      });
    });

    alerts.sort(
      (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
    );

    return alerts.slice(0, 4);
  }, [supplierTransactions, t]);

  const performanceMetrics = useMemo(() => {
    const deliveryTimes = feedbackEntries
      .map((entry) => Number(entry.deliveryTimeDays))
      .filter((value) => Number.isFinite(value) && value >= 0);

    const avgDeliveryTime = deliveryTimes.length
      ? deliveryTimes.reduce((acc, value) => acc + value, 0) /
        deliveryTimes.length
      : null;

    const onTimeRecords = feedbackEntries.filter(
      (entry) => entry.onTime === true || entry.onTime === false
    );

    const onTimePercentage = onTimeRecords.length
      ? (onTimeRecords.filter((entry) => entry.onTime).length /
          onTimeRecords.length) *
        100
      : null;

    const accuracyScores = feedbackEntries
      .map((entry) => Number(entry.accuracy))
      .filter((score) => Number.isFinite(score) && score > 0);

    const accuracyAverage = accuracyScores.length
      ? accuracyScores.reduce((acc, score) => acc + score, 0) /
        accuracyScores.length
      : null;

    const qualityScores = feedbackEntries
      .map((entry) => Number(entry.quality))
      .filter((score) => Number.isFinite(score) && score > 0);

    const qualityAverage = qualityScores.length
      ? qualityScores.reduce((acc, score) => acc + score, 0) /
        qualityScores.length
      : null;

    const complaintsCount = feedbackEntries.filter((entry) => {
      if (entry.complaint) return true;
      if (typeof entry.notes === "string") {
        const lower = entry.notes.toLowerCase();
        return lower.includes("complaint") || lower.includes("issue");
      }
      return false;
    }).length;

    const priceChange = priceAlerts.length ? priceAlerts[0].changePercent : null;

    return {
      avgDeliveryTime,
      onTimePercentage,
      priceChange,
      accuracyAverage,
      qualityAverage,
      complaintsCount,
    };
  }, [feedbackEntries, priceAlerts]);

  const feedbackTimeline = useMemo(() => {
    return [...feedbackEntries].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt) : null;
      const bDate = b.createdAt ? new Date(b.createdAt) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate - aDate;
    });
  }, [feedbackEntries]);

  // Handle input change for supplier transaction form
  const handleInputChange = (e) => {
    setNewTransaction({ ...newTransaction, [e.target.name]: e.target.value });
  };

const handleAddTransaction = async (e) => {
  e?.preventDefault?.();

  if (!selectedSupplier) {
    toast.error(t("Please select a supplier first."));
    return;
  }

  const validRows = (newTransaction.rows || [])
    .filter((r) => r.ingredient && r.quantity && r.total_cost)
    .map((r) => ({
      ingredient: String(r.ingredient || "").trim(),
      quantity: r.quantity,
      unit: r.unit,
      total_cost: r.total_cost,
      expiry_date: r.expiry_date || null,
    }));

  if (validRows.length === 0) {
    toast.error(t("Please enter at least one valid ingredient row."));
    return;
  }
  const purchaseTotal = validRows.reduce(
    (sum, row) => sum + (parseFloat(row.total_cost) || 0),
    0
  );

  const formData = new FormData();
  formData.append("supplier_id", selectedSupplier.id);
  formData.append("payment_method", newTransaction.paymentMethod || "Due");
  formData.append("rows", JSON.stringify(validRows)); // ✅ send all rows at once

  if (receiptFile) formData.append("receipt", receiptFile);

  try {
    const result = await secureFetch("/suppliers/transactions", {
      method: "POST",
      body: formData,
    });

    if (result?.success) {
      toast.success("✅ Compiled receipt saved successfully!");
      await fetchTransactions(selectedSupplier.id);
      await fetchSupplierDetails(selectedSupplier.id);
      await fetchSuppliers();

      if (isCashLabel(newTransaction.paymentMethod) && purchaseTotal > 0) {
        await logCashRegisterEvent({
          type: "supplier",
          amount: purchaseTotal,
          note: `${selectedSupplier?.name || "Supplier"} purchase`,
        });
        await openCashDrawer();
      }
    } else {
      toast.error(result?.error || "❌ Failed to save receipt");
    }
  } catch (err) {
    console.error("❌ Error saving compiled receipt:", err);
    toast.error("❌ Error saving compiled receipt");
  }

  setNewTransaction({
    rows: [
      {
        ingredient_select: "__add_new__",
        ingredient: "",
        quantity: "",
        unit: "kg",
        total_cost: "",
        expiry_date: "",
      },
    ],
    paymentMethod: "Due",
  });
  setReceiptFile(null);
};




const handleManageReceipt = (txn) => {
  if (txn?.receipt_url) {
    setPreviewImage(txn.receipt_url);
  } else {
    setShowUploadOptions(true);
  }
};

const handlePayment = async () => {
  if (!selectedSupplier?.id || !paymentAmount) return;
  try {
    const totalDueToUpdate = combinedDue; // 🧮 includes new order

    const res = await secureFetch(`/suppliers/${selectedSupplier.id}/pay`, {
      method: "PUT",
      body: JSON.stringify({
        payment: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        total_due: totalDueToUpdate, // ✅ include updated total
      }),
    });

    if (res?.message) {
      toast.success("💳 Payment successful!");

      // add the ingredient automatically after payment
      if (newTransaction.ingredient && newTransaction.total_cost && newTransaction.quantity) {
        await handleAddTransaction({ preventDefault: () => {}, auto: true });
      }

      await fetchTransactions(selectedSupplier.id);
      await fetchSupplierDetails(selectedSupplier.id);
      await fetchSuppliers();
      setPaymentModalOpen(false);

      if (isCashLabel(paymentMethod)) {
        const numericPayment = parseFloat(paymentAmount);
        if (numericPayment > 0) {
          await logCashRegisterEvent({
            type: "supplier",
            amount: numericPayment,
            note: `${selectedSupplier?.name || "Supplier"} payment`,
          });
          await openCashDrawer();
        }
      }
    } else {
      toast.error(res?.error || "❌ Payment failed");
    }
  } catch (err) {
    console.error("❌ Error processing payment:", err);
    toast.error("❌ Payment failed");
  }
};



  const handleAddSupplier = async () => {
    try {
      const created = await secureFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify(newSupplier),
      });
      if (!created?.id) throw new Error("Supplier create failed");

      await fetchSupplierDetails(created.id);
      await fetchSuppliers();
      setTransactions([]);
      setNewSupplier({
        name: "",
        phone: "",
        email: "",
        address: "",
        tax_number: "",
        id_number: "",
        notes: "",
      });
      setSupplierModalOpen(false);
    } catch (error) {
      console.error("❌ Error adding supplier:", error);
      alert("Something went wrong. Please refresh and try again.");
    }
  };

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier?.id) return;
    try {
      await secureFetch(`/suppliers/${selectedSupplier?.
id}`, {
        method: "PUT",
        body: JSON.stringify(selectedSupplier),
      });
      toast.success("✅ Supplier updated successfully!");
      await fetchSuppliers();
      setEditModalOpen(false);
    } catch (error) {
      console.error("❌ Error updating supplier:", error);
      toast.error("❌ Failed to update supplier.");
    }
  };

  const handleEditSupplier = (supplier) => {
    if (!supplier || !supplier.id) return;
    setSelectedSupplier({ ...supplier });
    setEditModalOpen(true);
    setSupplierModalOpen(false);
  };

  const handleDownloadHistory = () => {
    if (!transactions.length) {
      alert("No transactions to export.");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(transactions);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaction History");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `transactions_supplier_${selectedSupplier?.
id}.xlsx`);
  };

  const handleClearTransactions = async () => {
    if (!selectedSupplier?.id) return;
    if (!window.confirm("Are you sure you want to clear all transactions?")) return;
    try {
      await secureFetch(`/suppliers/${selectedSupplier?.
id}/transactions`, {
        method: "DELETE",
      });
      toast.success("🧹 All transactions cleared.");
      await fetchTransactions(selectedSupplier?.
id);
      await fetchSupplierDetails(selectedSupplier?.
id);
    } catch (err) {
      console.error("❌ Error clearing transactions:", err);
      toast.error("❌ Failed to clear transactions.");
    }
  };
  const handleDeleteSupplier = async () => {
    if (!selectedSupplier?.id) return;
    try {
      const res = await secureFetch(`/suppliers/${selectedSupplier?.
id}`, {
        method: "DELETE",
      });
      if (res?.message) {
        toast.success("🚮 Supplier deleted successfully!");
        setEditModalOpen(false);
        fetchSuppliers();
      } else {
        toast.error("❌ Failed to delete supplier.");
      }
    } catch (err) {
      console.error("❌ Error deleting supplier:", err);
      toast.error("❌ Server error while deleting supplier.");
    }
  };

  const handleFeedbackInputChange = (field, value) => {
    setFeedbackForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmitFeedback = (event) => {
    event.preventDefault();
    const newEntry = {
      ...feedbackForm,
      quality: Number(feedbackForm.quality) || null,
      packaging: Number(feedbackForm.packaging) || null,
      punctuality: Number(feedbackForm.punctuality) || null,
      accuracy: Number(feedbackForm.accuracy) || null,
      deliveryTimeDays: feedbackForm.deliveryTimeDays
        ? Number(feedbackForm.deliveryTimeDays)
        : "",
      createdAt: new Date().toISOString(),
    };
    setFeedbackEntries((prev) => [newEntry, ...prev]);
    toast.success(t("Feedback saved for this supplier."));
    setFeedbackForm({
      quality: 4,
      packaging: 4,
      punctuality: 4,
      accuracy: 4,
      deliveryTimeDays: "",
      onTime: true,
      complaint: false,
      notes: "",
    });
  };

  const formattedTotalDues = formatCurrency(totalAllDues);

  const selectedSupplierDue = Number(selectedSupplier?.total_due ?? 0);
  const formattedSelectedSupplierDue = selectedSupplierDue.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  const performanceCardData = [
    {
      title: t("Avg delivery time"),
      value:
        performanceMetrics.avgDeliveryTime !== null
          ? `${performanceMetrics.avgDeliveryTime.toFixed(1)} ${t("days")}`
          : "—",
      description: t("Lead time based on recent feedback"),
      accent: "from-blue-500 to-indigo-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ),
    },
    {
      title: t("On-time delivery"),
      value:
        performanceMetrics.onTimePercentage !== null
          ? `${Math.round(performanceMetrics.onTimePercentage)}%`
          : "—",
      description: t("Deliveries marked punctual"),
      accent: "from-emerald-500 to-teal-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    {
      title: t("Order accuracy score"),
      value:
        performanceMetrics.accuracyAverage !== null
          ? performanceMetrics.accuracyAverage.toFixed(1) + "/5"
          : "—",
      description: t("Staff reported order accuracy"),
      accent: "from-violet-500 to-purple-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.747 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      title: t("Complaints this month"),
      value: performanceMetrics.complaintsCount
        ? performanceMetrics.complaintsCount.toString()
        : "0",
      description: t("Flagged entries in feedback log"),
      accent: "from-rose-500 to-orange-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.62 1.73-3L13.73 4c-.77-1.38-2.69-1.38-3.46 0L3.2 16c-.77 1.38.19 3 1.73 3z"
          />
        </svg>
      ),
    },
  ];


  return (
<div
  ref={containerRef}
  className="h-screen overflow-y-scroll bg-slate-50 px-4 py-8 transition-colors duration-300 dark:bg-slate-950 sm:px-6 lg:px-10 scrollbar-hide"
>


      
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur"
          onClick={() => setPreviewImage(null)}
          style={{ cursor: "zoom-out" }}
        >
          <img
            src={
              previewImage.startsWith("http")
                ? previewImage
                : BACKEND_URL + previewImage
            }
            alt={t("Receipt preview")}
            className="max-h-[90vh] max-w-[95vw] rounded-3xl border-8 border-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-10">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl">
          <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
                {t("Supplier Operations")}
              </p>
              <div>
                <h1 className="text-3xl font-bold sm:text-4xl">
                  {t("Supplier Performance Hub")}
                </h1>
                <p className="mt-3 max-w-2xl text-base text-white/80 sm:text-lg">
                  {t(
                    "Monitor supplier reliability, track pricing trends, and manage purchasing decisions in one workspace."
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl bg-white/10 p-5 text-white shadow-lg backdrop-blur">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                  {t("Total outstanding dues")}
                </p>
                <p className="mt-2 text-3xl font-semibold sm:text-4xl">
                  {formattedTotalDues}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-300" />
                  {t("Active suppliers")}: {suppliers.length}
                </span>
                {selectedSupplier && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/60" />
                    {selectedSupplier?.name}: {formattedSelectedSupplierDue}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setActiveTab("suppliers")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                activeTab === "suppliers"
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              📦 {t("Suppliers")}
            </button>
            <button
              onClick={() => setActiveTab("cart")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                activeTab === "cart"
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              🛒 {t("Supplier Cart")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
             {/* ✅ NEW: section tabs next to the title */}
      <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {sectionTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => scrollToId(tab.key)}
            className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            title={tab.label}
          >
            {tab.label}
          </button>
        ))}
      </div>
           
          </div>
        </div>
        {/* --- SUPPLIERS TAB --- */}
        {activeTab === "suppliers" && (
          <div className="space-y-10">
         
<section
  id="primary-supplier"  // ✅ ADD THIS
  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
                  <div className="space-y-6">
                     <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {t("Primary supplier")}
                    </p>
 
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t("Choose which supplier you want to review or update.")}
                    </p>
              
                  </div>
                  
               <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 w-full">
  {/* === Supplier Select (Left on desktop) === */}
  <div className="relative w-full sm:w-72 order-1 sm:order-none">
    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4h18M3 10h18M3 16h18"
        />
      </svg>
    </div>
    <select
      className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      value={selectedSupplier?.id || ""}
      onChange={(e) => handleSelectSupplier(e.target.value)}
    >
      <option value="">{t("Select Supplier")}</option>
      {suppliers.map((supplier) => (
        <option key={supplier.id} value={supplier.id}>
          {supplier.name}
        </option>
      ))}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* === Due Card (Right on desktop) === */}
  {selectedSupplier ? (
    <div className="w-full sm:w-72 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 order-2 sm:order-none">
      <div className="flex items-center justify-between">
        <p>{t("Due")}</p>
        <p className="text-lg font-bold text-rose-500 dark:text-rose-300">
          {formattedSelectedSupplierDue}
        </p>
      </div>
    </div>
  ) : (
    <div className="hidden w-full sm:block sm:w-72" />
  )}


                   
                  </div>
       <div className="flex flex-wrap justify-start sm:justify-start items-center gap-2 w-full">
  {/* Add Supplier */}
  <button
    type="button"
    className="flex-1 sm:flex-none min-w-[130px] inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
    onClick={() => setSupplierModalOpen(true)}
  >
    ➕ {t("Add Supplier")}
  </button>

  {/* Call Supplier */}
  {selectedSupplier?.phone && (
    <a href={`tel:${selectedSupplier.phone}`} className="flex-1 sm:flex-none min-w-[130px]">
      <button
        type="button"
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
      >
        📞 {t("Call Supplier")}
      </button>
    </a>
  )}

  {/* Record Payment */}
  {selectedSupplier && (
    <button
      type="button"
      className={`flex-1 sm:flex-none min-w-[130px] inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow transition ${
        selectedSupplierDue > 0
          ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:shadow-lg"
          : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
      }`}
      onClick={() => {
        if (selectedSupplierDue <= 0) {
          toast.info(t("No payment due for this supplier."));
          return;
        }
        setPaymentModalOpen(true);
      }}
    >
      💳 {t("Record payment")}
    </button>
  )}

  {/* Edit Supplier */}
  {selectedSupplier && (
    <button
      type="button"
      className="flex-1 sm:flex-none min-w-[130px] inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
      onClick={() => handleEditSupplier(selectedSupplier)}
    >
      ✏️ {t("Edit Supplier")}
    </button>
  )}

  {/* Delete Supplier */}
  {selectedSupplier && (
    <button
      type="button"
      className="flex-1 sm:flex-none min-w-[130px] inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:shadow-md"
      onClick={() => {
        if (window.confirm(t("Are you sure you want to delete this supplier?"))) {
          handleDeleteSupplier();
        }
      }}
    >
      🗑️ {t("Delete Supplier")}
    </button>
  )}
</div>

                    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg	font-semibold text-slate-900 dark:text-white">
                            {t("Purchasing & Receipts")}
                          </h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t(
                              "Capture deliveries, attach receipts, and keep balances current."
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-right shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                          <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                            {t("Projected balance")}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(projectedBalance)}
                          </p>
                        </div>
                      </div>
                      <form
                        onSubmit={handleAddTransaction}
                        className="mt-6 space-y-4"
                      >
                        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                          {t("New delivery entry")}
                        </p>
                        {/* --- Multi-ingredient input rows --- */}
{/* --- Multi-ingredient input rows --- */}

{newTransaction.rows?.map((row, idx) => {
  const qty = parseFloat(row.quantity);
  const total = parseFloat(row.total_cost);
  const unitPrice =
    !isNaN(qty) && qty > 0 && !isNaN(total) ? (total / qty).toFixed(2) : "0.00";
  const ingredientSelectValue = row.ingredient_select || "__add_new__";

  return (
    <div key={idx} className="relative mb-6">
      {/* --- Separator line between rows --- */}
      {idx > 0 && (
        <div className="my-4 border-t border-dashed border-slate-300 dark:border-slate-700"></div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7 items-end">
        {/* Ingredient */}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t("Ingredient")}
          <select
            value={ingredientSelectValue}
            onChange={(e) => {
              const value = e.target.value;
              const updated = [...newTransaction.rows];

              if (value === "__add_new__") {
                updated[idx] = {
                  ...updated[idx],
                  ingredient_select: "__add_new__",
                  ingredient: "",
                };
              } else {
                try {
                  const parsed = JSON.parse(value);
                  const name = String(parsed?.name || "").trim();
                  const unit = String(parsed?.unit || "").trim();
                  updated[idx] = {
                    ...updated[idx],
                    ingredient_select: value,
                    ingredient: name,
                    unit: unit || updated[idx].unit,
                  };
                } catch {
                  updated[idx] = {
                    ...updated[idx],
                    ingredient_select: "__add_new__",
                    ingredient: "",
                  };
                }
              }

              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="__add_new__">{t("Add new")}</option>
            {supplierIngredientOptions.map((opt) => (
              <option
                key={`${opt.name}|||${opt.unit}`}
                value={JSON.stringify({ name: opt.name, unit: opt.unit })}
              >
                {opt.name} ({opt.unit})
              </option>
            ))}
          </select>

          {ingredientSelectValue === "__add_new__" && (
            <input
              type="text"
              value={row.ingredient}
              onChange={(e) => {
                const updated = [...newTransaction.rows];
                updated[idx].ingredient = e.target.value;
                setNewTransaction({ ...newTransaction, rows: updated });
              }}
              placeholder={t("New ingredient")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          )}
        </label>

        {/* Quantity */}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t("Quantity")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.quantity}
            onChange={(e) => {
              const updated = [...newTransaction.rows];
              updated[idx].quantity = e.target.value;
              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </label>

        {/* Unit */}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t("Unit")}
          <select
            value={row.unit}
            onChange={(e) => {
              const updated = [...newTransaction.rows];
              updated[idx].unit = e.target.value;
              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="kg">{t("kg")}</option>
            <option value="g">{t("g")}</option>
            <option value="lt">{t("lt")}</option>
            <option value="ml">{t("ml")}</option>
            <option value="piece">{t("piece")}</option>
          </select>
        </label>

        {/* Expiry date */}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t("Expiry date")}
          <input
            type="date"
            value={row.expiry_date || ""}
            onChange={(e) => {
              const updated = [...newTransaction.rows];
              updated[idx].expiry_date = e.target.value;
              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        {/* Total cost */}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t("Total cost (₺)")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.total_cost}
            onChange={(e) => {
              const updated = [...newTransaction.rows];
              updated[idx].total_cost = e.target.value;
              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </label>

        {/* Computed Unit Price */}
        <div className="flex flex-col justify-end h-full text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("Unit price")}
          </p>
          <p className="text-lg mt-1">
            {formatCurrency(parseFloat(unitPrice || 0))}
          </p>
        </div>

        {/* 🗑️ Remove Row Button */}
        <div className="flex justify-center items-end">
          <button
            type="button"
            onClick={() => {
              const updated = [...newTransaction.rows];
              updated.splice(idx, 1);
              if (updated.length === 0)
                updated.push({
                  ingredient_select: "__add_new__",
                  ingredient: "",
                  quantity: "",
                  unit: "kg",
                  total_cost: "",
                  expiry_date: "",
                });
              setNewTransaction({ ...newTransaction, rows: updated });
            }}
            className="inline-flex items-center gap-2 rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-600/40 dark:text-rose-300 dark:hover:bg-rose-900/30 transition"
          >
            🗑️ {t("Remove")}
          </button>
        </div>
      </div>
    </div>
  );
})}



{/* ➕ Add Row button */}
<button
  type="button"
  onClick={() =>
    setNewTransaction({
      ...newTransaction,
      rows: [
        ...(newTransaction.rows || []),
        {
          ingredient_select: "__add_new__",
          ingredient: "",
          quantity: "",
          unit: "kg",
          total_cost: "",
          expiry_date: "",
        },
      ],
    })
  }
  className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
>
  ➕ {t("Add Row")}
</button>



                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 shadow-inner dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {t(" Total price")}
                            </span>
                         {(() => {
  const totalOrder = newTransaction.rows?.reduce(
    (sum, r) => sum + (parseFloat(r.total_cost) || 0),
    0
  );
  const totalEffect =
    (selectedSupplier?.total_due || 0) + totalOrder - (selectedSupplier?.total_due || 0);

  return (
    <>
      <p
        className={`mt-2 text-lg font-semibold ${
          totalOrder >= 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        +{formatCurrency(totalOrder)}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("Total added to outstanding balance (all items)")}
      </p>
    </>
  );
})()}

                   
                          </div>
                        </div>
                       <div className="flex flex-wrap items-center gap-3">
  {/* ✅ Confirm Order (adds ingredients before payment) */}
  <button
    type="button"
    onClick={handleAddTransaction}
    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
  >
    ✅ {t("Confirm Order")}
  </button>

  {/* 💳 Pay Now */}
  <button
    type="button"
    onClick={() => setPaymentModalOpen(true)}
    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
  >
    💳 {t("Pay Now")}
  </button>

  {/* 📸 Upload Receipt */}
  <button
    type="button"
    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
    onClick={() => setShowUploadOptions(true)}
  >
    📸 {t("Upload Receipt")}
  </button>
</div>

                     </form>
</div>

{/* === SUPPLIER OVERVIEW SECTION === */}
<section id="supplier-overview" className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
          {t("Supplier Overview")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("Monitor supplier dues, payments, and spending at a glance.")}
        </p>
      </div>
    </div>

    {/* === Overview Box === */}
    <div className="mt-6">
      <SupplierOverview suppliers={suppliers} t={t} />
    </div>
  </div>
</section>
   <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="space-y-6">
                <div className="space-y-4">
                                  {/* === Latest Added Entry Preview === */}
{latestTransaction && (
  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
      🆕 {t("Latest Added Order")}
    </h3>
    <div className="flex flex-wrap justify-between text-sm text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-semibold">{t("Ingredient")}:</span>{" "}
        {latestTransaction.ingredient}
      </p>
      <p>
        <span className="font-semibold">{t("Quantity")}:</span>{" "}
        {latestTransaction.quantity} {latestTransaction.unit}
      </p>
      <p>
        <span className="font-semibold">{t("Total Cost")}:</span>{" "}
        {formatCurrency(Number(latestTransaction.total_cost || 0))}
      </p>
      <p>
        <span className="font-semibold">{t("Payment Method")}:</span>{" "}
        {latestTransaction.payment_method}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("Added at")}: {new Date(latestTransaction.created_at).toLocaleString()}
      </p>
    </div>
  </div>
)}
<section id="transaction-history" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
  <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {t("Transaction History")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("Review every purchase and payment with clear statuses.")}
        </p>
      </div>
      <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {[
          { value: "all", label: t("All") },
          { value: "purchases", label: t("Purchases") },
          { value: "payments", label: t("Payments") },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTransactionView(option.value)}
            className={`rounded-full px-4 py-1.5 font-semibold transition ${
              transactionView === option.value
                ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Outstanding")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(supplierFinancials.outstanding)}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Total purchases")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(supplierFinancials.totalPurchases)}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Payments made")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(supplierFinancials.totalPaid)}
        </p>
      </div>
    </div>
{filteredTransactions.length > 0 ? (
  <div className="space-y-4">
    {(() => {
      // ✅ Group transactions by date
      const grouped = filteredTransactions.reduce((acc, txn) => {
        const dateKey = txn.delivery_date
          ? new Date(txn.delivery_date).toISOString().split("T")[0]
          : "Unknown";
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(txn);
        return acc;
      }, {});

      // ✅ Sort dates (newest → oldest)
      const sortedDates = Object.keys(grouped).sort(
        (a, b) => new Date(b) - new Date(a)
      );

      let runningBalance = 0;

      return sortedDates.map((day) => {
        const txns = grouped[day].sort(
          (a, b) => new Date(b.delivery_date) - new Date(a.delivery_date)
        );

        return (
          <div
            key={day}
            className="border border-slate-200 rounded-2xl shadow-sm dark:border-slate-800"
          >
            {/* === Day header === */}
            <button
              onClick={() =>
                setOpenDays((prev) => ({ ...prev, [day]: !prev[day] }))
              }
              className="w-full flex justify-between items-center px-5 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-t-2xl transition"
            >
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                📅 {getLocalizedDate(day)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {openDays[day] ? "▲ " + t("Hide") : "▼ " + t("Show")}
              </span>
            </button>

            {/* === Transactions under that day === */}
            {openDays[day] && (
              <div className="p-5 space-y-4 bg-white dark:bg-slate-900 rounded-b-2xl">
                {txns.map((txn, idx) => {
                  const isPayment = txn.ingredient === "Payment";
                  const totalCost = Number(txn.total_cost) || 0;
                  const amountPaid = Number(txn.amount_paid) || 0;
                  const change = isPayment ? -amountPaid : totalCost;
                  runningBalance += change;

                  const paymentLabel =
                    txn.payment_method && paymentChipLabel(txn.payment_method);

                  return (
                    <div
                      key={txn.id || `txn-${day}-${idx}`}
                      className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      {/* === Header === */}
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p
                            className={`font-semibold ${
                              isPayment
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-900 dark:text-white"
                            }`}
                          >
                            {isPayment
                              ? `${t("Payment recorded")} – ${formatCurrency(
                                  amountPaid
                                )}`
                              : `${
                                  txn.ingredient || t("Compiled Receipt")
                                } – ${formatCurrency(totalCost)}`}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {txn.payment_method ? txn.payment_method : ""}
                          </p>
                        </div>
                        {paymentLabel && (
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {paymentLabel}
                          </span>
                        )}
                      </div>

                      {/* === Ingredient list (for compiled receipts) === */}
                      {!isPayment &&
                        Array.isArray(txn.items) &&
                        txn.items.length > 0 && (
                          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                              {t("Included ingredients")}
                            </p>
                            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                              {txn.items.map((item, i) => (
                                <li
                                  key={i}
                                  className="py-1.5 flex justify-between text-xs sm:text-sm"
                                >
                                  <span className="font-medium text-slate-700 dark:text-slate-200">
                                    {item.ingredient}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {item.quantity} {item.unit} ×{" "}
                                    {formatCurrency(
                                      Number(item.price_per_unit || 0)
                                    )}{" "}
                                    ={" "}
                                    <strong className="text-slate-900 dark:text-white">
                                      {formatCurrency(
                                        Number(item.total_cost || 0)
                                      )}
                                    </strong>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* === Running balance === */}
                      <div className="mt-4 flex justify-between text-sm font-semibold">
                        <span
                          className={
                            change < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }
                        >
                          {change < 0 ? "−" : "+"}
                          {formatCurrency(Math.abs(change))}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200">
                          {t("Balance after this")}:{" "}
                          {formatCurrency(runningBalance)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      });
    })()}
  </div>
) : (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
    {t("No transactions recorded yet for this supplier.")}
  </div>
)}



  </div>
</section>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Suppliers connected")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {suppliers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Tracked transactions")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {transactions.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Active price alerts")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {priceAlerts.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Feedback entries logged")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {feedbackEntries.length}
                    </p>
                  </div>
                </div>
             
              </div>
            </section>
                    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        {t("Month to date overview")}
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center justify-between">
                          <span>{t("Spend this month")}</span>
                          <strong className="text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.monthPurchases)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("Payments made")}</span>
                          <strong className="text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.monthPayments)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("Projected balance after order")}</span>
                          <strong
                            className={`${
                              projectedBalance > supplierFinancials.outstanding
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {formatCurrency(projectedBalance)}
                          </strong>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        <p className="text-xs uppercase text-slate-400 dark:text-slate-500">
                          {t("Recent receipts")}
                        </p>
                        {recentReceipts.length > 0 ? (
                          recentReceipts.map((receiptTxn) => (
                            <div
                              key={receiptTxn.id || receiptTxn.receipt_url}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                            >
                              <div className="flex flex-col">
                                <span>{receiptTxn.ingredient || t("Purchase")}</span>
                                <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                                  {getLocalizedDate(resolveTxnDate(receiptTxn))}
                                </span>
                                {(() => {
                                  const expiryLabel = getReceiptExpirySummary(receiptTxn);
                                  return (
                                    expiryLabel && (
                                      <span className="text-[11px] font-normal text-amber-600 dark:text-amber-300">
                                        {expiryLabel}
                                      </span>
                                    )
                                  );
                                })()}
                              </div>
                              <button
                                type="button"
                                className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                                onClick={() => setPreviewImage(receiptTxn.receipt_url)}
                              >
                                {t("View")}
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {t("No receipts uploaded yet. Attach one with your next delivery.")}
                          </p>
                        )}
                      </div>
                    </div>

                 
                  </div>
                </section>
<section id="price-tracking" className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {t("Smart Price Tracking & Alerts")}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {t(
                            "Automatically highlight unusual ingredient price swings so you can react quickly."
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      {priceAlerts.length > 0 ? (
                        priceAlerts.map((alert, idx) => {
                          const isIncrease = alert.changePercent >= 0;
                          const changeText = `${isIncrease ? "+" : ""}${alert.changePercent.toFixed(
                            1
                          )}%`;
                          const sinceLabel = alert.since
                            ? new Date(alert.since).toLocaleDateString()
                            : t("recently");
                          return (
                            <div
                              key={`${alert.ingredient}-${idx}`}
                              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-base font-semibold text-slate-900 dark:text-white">
                                  {alert.ingredient}
                                </p>
                                <span
                                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                    isIncrease
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                  }`}
                                >
                                  {isIncrease ? "▲" : "▼"} {changeText}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                <span>
                                  {t("Latest price")}:{" "}
                                  <strong className="text-slate-700 dark:text-slate-200">
                                    {formatCurrency(alert.latestPrice)}
                                  </strong>
                                </span>
                                <span>
                                  {t("Baseline")}:{" "}
                                  <strong className="text-slate-700 dark:text-slate-200">
                                    {formatCurrency(alert.comparisonPrice)}
                                  </strong>
                                </span>
                                <span>
                                  {t("Compared to")}: {sinceLabel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {isIncrease
                                  ? t("Consider negotiating or sourcing alternates.")
                                  : t("Opportunity: cost improvements worth leveraging.")}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                          {t("No significant price changes detected yet.")}
                        </div>
                      )}
                    </div>
                  </div>

<div id="feedback-log"  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-200 pb-4 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {t("Supplier Rating & Feedback Log")}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t(
                          "Capture quick post-delivery insights to grow a dependable supplier scorecard."
                        )}
                      </p>
                    </div>
                    <form className="mt-4 space-y-4" onSubmit={handleSubmitFeedback}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {["quality", "packaging", "punctuality", "accuracy"].map((field) => (
                          <label
                            key={field}
                            className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300"
                          >
                            {t(field.charAt(0).toUpperCase() + field.slice(1))}
                            <select
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              value={feedbackForm[field]}
                              onChange={(e) =>
                                handleFeedbackInputChange(field, Number(e.target.value))
                              }
                            >
                              {[1, 2, 3, 4, 5].map((score) => (
                                <option key={score} value={score}>
                                  {score} / 5
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                          {t("Delivery time (days)")}
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={feedbackForm.deliveryTimeDays}
                            onChange={(e) =>
                              handleFeedbackInputChange("deliveryTimeDays", e.target.value)
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            placeholder="2.5"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                          {t("Delivered on time?")}
                          <select
                            value={feedbackForm.onTime ? "true" : "false"}
                            onChange={(e) =>
                              handleFeedbackInputChange("onTime", e.target.value === "true")
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="true">{t("Yes")}</option>
                            <option value="false">{t("No")}</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={feedbackForm.complaint}
                          onChange={(e) =>
                            handleFeedbackInputChange("complaint", e.target.checked)
                          }
                          className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-500"
                        />
                        {t("Flag as complaint / quality issue")}
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                        {t("Notes")}
                        <textarea
                          rows={3}
                          value={feedbackForm.notes}
                          onChange={(e) => handleFeedbackInputChange("notes", e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder={t("Example: Tomatoes were soft, refund requested.")}
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {t("Log feedback")}
                      </button>
                    </form>
 

                    <div className="mt-6 space-y-4">
                      {feedbackTimeline.length > 0 ? (
                        feedbackTimeline.map((entry, idx) => {
                          const created =
                            entry.createdAt && !Number.isNaN(new Date(entry.createdAt))
                              ? new Date(entry.createdAt).toLocaleString()
                              : t("Recently");
                          const formatScore = (value) => {
                            if (value === null || value === undefined || value === "") {
                              return "—";
                            }
                            const num = Number(value);
                            return Number.isFinite(num) ? num.toFixed(1) : "—";
                          };
                          return (
                            <div
                              key={`${entry.createdAt || "entry"}-${idx}`}
                              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  {created}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-200/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  ⭐ {t("Quality")}: {formatScore(entry.quality)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                <span>
                                  {t("Packaging")}: {formatScore(entry.packaging)}
                                </span>
                                <span>
                                  {t("Punctuality")}: {formatScore(entry.punctuality)}
                                </span>
                                <span>
                                  {t("Accuracy")}: {formatScore(entry.accuracy)}
                                </span>
                                <span>
                                  {t("Delivery time")}:{" "}
                                  {entry.deliveryTimeDays
                                    ? `${Number(entry.deliveryTimeDays).toFixed(1)} ${t("days")}`
                                    : "—"}
                                </span>
                                <span>
                                  {t("On time")}: {entry.onTime === false ? t("No") : t("Yes")}
                                </span>
                                {entry.complaint && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                                    ⚠️ {t("Complaint")}
                                  </span>
                                )}
                              </div>
                              {entry.notes && (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                  {entry.notes}
                                </p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                          {t(
                            "No feedback logged yet. Capture insights after each delivery to build trust scores."
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section><section id="profile-balance" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {t("Supplier Profile & Balance")}
                          </h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t("Keep contacts, debt exposure, and account history aligned for your team.")}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700/70 dark:text-slate-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          {t("Open invoices")}: {supplierFinancials.openInvoices}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                         <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                           {t("Outstanding")}
                         </p>
                         <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.outstanding)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                         <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                           {t("Total purchases")}
                         </p>
                         <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.totalPurchases)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                         <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                           {t("Payments made")}
                         </p>
                         <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.totalPaid)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                         <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                           {t("Month spend")}
                         </p>
                         <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(supplierFinancials.monthPurchases)}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                            {t("Primary contact")}
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Name")}:
                              </strong>{" "}
                              {selectedSupplier?.
name}
                            </p>
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Phone")}:
                              </strong>{" "}
                              {selectedSupplier?.
phone || t("Not available")}
                            </p>
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Email")}:
                              </strong>{" "}
                              {selectedSupplier?.
email || t("Not available")}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                            {t("Business details")}
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Tax number")}:
                              </strong>{" "}
                              {selectedSupplier?.
tax_number || t("Not available")}
                            </p>
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("ID number")}:
                              </strong>{" "}
                              {selectedSupplier?.
id_number || t("Not available")}
                            </p>
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Address")}:
                              </strong>{" "}
                              {selectedSupplier?.
address || t("Not available")}
                            </p>
                            <p>
                              <strong className="font-semibold text-slate-700 dark:text-white">
                                {t("Notes")}:
                              </strong>{" "}
                              {selectedSupplier?.
notes || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                
                    </div>
                    <div className="space-y-4">
                      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-emerald-500/20" />
                        <div className="relative z-10 space-y-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                                {t("Outstanding balance")}
                              </p>
                              <p className="mt-2 text-3xl font-semibold">
                                {formatCurrency(supplierFinancials.outstanding)}
                              </p>
                            </div>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                              {t("Coverage")}:{" "}
                              {coveragePercent !== null ? `${coveragePercent.toFixed(0)}%` : "—"}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
                              <span>{t("Paid coverage")}</span>
                              <span>
                                {coveragePercent !== null ? `${coveragePercent.toFixed(0)}%` : "—"}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-emerald-300"
                                style={{ width: `${coveragePercent !== null ? coveragePercent : 0}%` }}
                              />
                            </div>
                          </div>
                          <ul className="space-y-1 text-sm text-white/70">
                            <li>
                              <span className="font-semibold text-white">{t("Last invoice")}:</span>{" "}
                              {supplierFinancials.lastInvoiceDate
                                ? supplierFinancials.lastInvoiceDate.toLocaleDateString()
                                : t("Not available")}
                            </li>
                            <li>
                              <span className="font-semibold text-white">{t("Last payment")}:</span>{" "}
                              {supplierFinancials.lastPaymentDate
                                ? supplierFinancials.lastPaymentDate.toLocaleDateString()
                                : t("Not available")}
                            </li>
                          </ul>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:shadow-lg"
                              onClick={() => setPaymentModalOpen(true)}
                            >
                              ✅ {t("Settle now")}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                              onClick={handleDownloadHistory}
                            >
                              📥 {t("Export statement")}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                          {t("Month to date overview")}
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between">
                            <span>{t("Spend this month")}</span>
                            <strong className="text-slate-900 dark:text-white">
                              {formatCurrency(supplierFinancials.monthPurchases)}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{t("Payments received")}</span>
                            <strong className="text-slate-900 dark:text-white">
                              {formatCurrency(supplierFinancials.monthPayments)}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{t("Projected balance after order")}</span>
                            <strong
                              className={`${
                                projectedBalance > supplierFinancials.outstanding
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {formatCurrency(projectedBalance)}
                            </strong>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          <p className="text-xs uppercase text-slate-400 dark:text-slate-500">
                            {t("Recent receipts")}
                          </p>
                          {recentReceipts.length > 0 ? (
                            recentReceipts.map((receiptTxn) => (
                              <div
                                key={receiptTxn.id || receiptTxn.receipt_url}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                              >
                                <div className="flex flex-col">
                                  <span>{receiptTxn.ingredient || t("Purchase")}</span>
                                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                                    {getLocalizedDate(resolveTxnDate(receiptTxn))}
                                  </span>
                                  {(() => {
                                    const expiryLabel = getReceiptExpirySummary(receiptTxn);
                                    return (
                                      expiryLabel && (
                                        <span className="text-[11px] font-normal text-amber-600 dark:text-amber-300">
                                          {expiryLabel}
                                        </span>
                                      )
                                    );
                                  })()}
                                </div>
                                <button
                                  type="button"
                                  className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                                  onClick={() => setPreviewImage(receiptTxn.receipt_url)}
                                >
                                  {t("View")}
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {t("No receipts uploaded yet. Attach one with your next delivery.")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      setReceiptFile(e.target.files[0]);
                      setShowUploadOptions(false);
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      setReceiptFile(e.target.files[0]);
                      setShowUploadOptions(false);
                    }}
                  />
            {selectedSupplier ? (
              <>
                <section className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                        {t("Supplier Performance Dashboard")}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t(
                          "Surface delivery health, accuracy, and service quality at a glance."
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                        ⭐ {t("Quality avg")}:{" "}
                        {performanceMetrics.qualityAverage !== null
                          ? Number(performanceMetrics.qualityAverage).toFixed(1)
                          : "—"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                        🧾 {t("Feedback entries")}: {feedbackEntries.length}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {performanceCardData.map((card, idx) => (
                      <div
                        key={`${card.title}-${idx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white ${card.accent}`}
                        >
                          {card.icon}
                        </div>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {card.title}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                          {card.value}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {card.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                   <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        {t("Supplier management")}
                      </p>
                      <ul className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
                        <li className="flex items-start gap-3">
                          <span className="mt-1 text-lg">🧾</span>
                          <div className="space-y-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {t("Download transaction log")}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {t("Share Excel reports with accounting whenever requested.")}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              onClick={handleDownloadHistory}
                            >
                              📥 {t("Export Excel")}
                            </button>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="mt-1 text-lg">🧹</span>
                          <div className="space-y-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {t("Reset transaction history")}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {t("Start fresh after completing annual reconciliation.")}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-slate-800"
                              onClick={handleClearTransactions}
                            >
                              🧹 {t("Clear history")}
                            </button>
                          </div>
                        </li>
                      </ul>
                    </div>




              </>
            ) : (
             <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                  {t("Select a supplier to view performance insights")}
                </h3>
                <p className="mt-2 text-sm">
                  {t(
                    "Pick a supplier from the dropdown above to unlock performance analytics, price tracking, and payment tools."
                  )}
                </p>
              </div> 
            )}
          </div>
        )}

        {isSupplierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="absolute -top-16 -right-12 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />
              <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300">
                ➕ {t("Add New Supplier")}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("Enter supplier details below.")}
              </p>
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  name="name"
                  placeholder={t("Supplier Name")}
                  value={newSupplier.name}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <input
                  type="text"
                  name="phone"
                  placeholder={t("Phone Number")}
                  value={newSupplier.phone}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, phone: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <input
                  type="text"
                  name="tax_number"
                  placeholder={t("Tax Number")}
                  value={newSupplier.tax_number}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, tax_number: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  name="id_number"
                  placeholder={t("ID Number")}
                  value={newSupplier.id_number}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, id_number: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="email"
                  name="email"
                  placeholder={t("Email")}
                  value={newSupplier.email}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  name="address"
                  placeholder={t("Address")}
                  value={newSupplier.address}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, address: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <textarea
                  name="notes"
                  placeholder={t("Notes")}
                  value={newSupplier.notes}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, notes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setSupplierModalOpen(false)}
                >
                  ❌ {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-md"
                  onClick={handleAddSupplier}
                >
                  ✅ {t("Add Supplier")}
                </button>
              </div>
            </div>
          </div>
        )}

        {editModalOpen && selectedSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="absolute -top-16 -left-12 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />
              <h2 className="text-2xl font-semibold text-rose-600 dark:text-rose-300">
                ✏️ {t("Edit Supplier")}
              </h2>
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  placeholder={t("Name")}
                  value={selectedSupplier?.
name}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Phone")}
                  value={selectedSupplier?.
phone || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, phone: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="email"
                  placeholder={t("Email")}
                  value={selectedSupplier?.
email || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Address")}
                  value={selectedSupplier?.
address || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, address: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Tax Number")}
                  value={selectedSupplier?.
tax_number || ""}
                  onChange={(e) =>
                    setSelectedSupplier({
                      ...selectedSupplier,
                      tax_number: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("ID Number")}
                  value={selectedSupplier?.
id_number || ""}
                  onChange={(e) =>
                    setSelectedSupplier({
                      ...selectedSupplier,
                      id_number: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <textarea
                  placeholder={t("Notes")}
                  value={selectedSupplier?.
notes || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, notes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setEditModalOpen(false)}
                >
                  ❌ {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-md"
                  onClick={handleUpdateSupplier}
                >
                  ✅ {t("Save Changes")}
                </button>
              </div>
            </div>
          </div>
        )}

{paymentModalOpen && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-indigo-200 dark:border-indigo-700 relative">
      {/* Decorative Blobs */}
      <div className="absolute -top-16 -right-20 w-48 h-48 bg-gradient-to-br from-blue-400 to-purple-400 opacity-25 rounded-full blur-3xl pointer-events-none animate-blob z-0" />
      <div className="absolute -bottom-10 -left-16 w-40 h-40 bg-gradient-to-br from-green-400 to-indigo-300 opacity-15 rounded-full blur-3xl pointer-events-none animate-blob z-0" />

      {/* Header */}
      <h2 className="text-2xl font-extrabold text-blue-700 mb-2 tracking-tight z-10 relative text-center">
        💳 {t("Make Payment")}
      </h2>
      <p className="mb-6 text-gray-500 text-sm z-10 relative text-center">{t("Pay your supplier and keep records up-to-date.")}</p>

      {/* Total Due Card */}
      <div className="bg-gradient-to-r from-blue-100 via-white to-indigo-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl shadow-inner mb-6 text-center border border-indigo-100 dark:border-indigo-900 z-10 relative">
        <div className="text-gray-600 dark:text-gray-300 text-sm font-semibold">{t("Total Due")}</div>
        <div
  className={`text-3xl font-extrabold mt-1 ${
    combinedDue > 0 ? "text-red-600" : "text-green-500"
  }`}
>
  {formatCurrency(combinedDue)}
</div>

      </div>

      {/* Payment Amount Label + Input */}
      <label
        htmlFor="payment-amount"
        className="block text-lg font-bold text-gray-700 dark:text-gray-200 mb-1 z-10 relative"
      >
        {t("Payment Amount")}
      </label>
      <input
        id="payment-amount"
        type="number"
        placeholder={t("Enter Payment Amount")}
        value={paymentAmount}
        min="0"
        onChange={e => setPaymentAmount(e.target.value)}
        className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xl mb-2 focus:ring-2 focus:ring-blue-300"
        required
        autoFocus
      />

      {/* Show error if tried to submit empty */}
      {paymentAmount === "" && (
        <div className="mb-2 text-red-600 text-sm font-semibold z-10 relative">
          {t("Please enter a payment amount.")}
        </div>
      )}

      {/* Remaining Calculation */}
{combinedDue - parseFloat(paymentAmount || 0) > 0 ? (
  <>
    <span className="text-gray-600 dark:text-gray-300 text-sm font-semibold">
      {t("Remaining After Payment")}:
    </span>
    <div className="text-lg font-bold text-red-500">
      {formatCurrency(
        Math.max(0, combinedDue - parseFloat(paymentAmount || 0))
      )}
    </div>
  </>
) : (
  <div className="text-green-600 font-extrabold text-lg">
    ✅ {t("Fully Paid!")}
  </div>
)}


      {/* Payment Method Selector */}
      <label
        htmlFor="payment-method"
        className="block text-md font-medium text-gray-600 dark:text-gray-300 mb-1 z-10 relative"
      >
        {t("Payment Method")}
      </label>
      <select
        id="payment-method"
        value={paymentMethod}
        onChange={e => setPaymentMethod(e.target.value)}
        className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg mb-7 bg-white dark:bg-gray-900"
      >

        <option value="Cash">💵 {t("Cash")}</option>
        <option value="Due">🕓 {t("Due")}</option>
        <option value="Credit Card">💳 {t("Credit Card")}</option>
        <option value="IBAN">🏦 {t("IBAN")}</option>
      </select>

      {/* Actions */}
      <div className="flex justify-between gap-3 mt-8 z-10 relative">
        <button
          className="px-5 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 dark:text-white hover:brightness-110 transition shadow"
          onClick={() => setPaymentModalOpen(false)}
        >
          ❌ {t("Cancel")}
        </button>
        <button
          className={`px-6 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:scale-105 transition shadow-lg
            ${(!paymentAmount || parseFloat(paymentAmount) <= 0) ? "opacity-60 cursor-not-allowed" : ""}
          `}
          onClick={handlePayment}
          disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
        >
          ✅ {t("Confirm Payment")}
        </button>
      </div>
    </div>
  </div>
)}



{showUploadOptions && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-[90%] max-w-sm text-center space-y-4">
      <h2 className="text-lg font-bold text-indigo-700">{t("Choose Upload Option")}</h2>
      <button
        onClick={() => cameraInputRef.current.click()}
        className="w-full px-4 py-3 bg-indigo-500 text-white rounded-xl font-bold shadow hover:scale-105 transition"
      >
        📷 {t("Take Photo")}
      </button>
      <button
        onClick={() => fileInputRef.current.click()}
        className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl font-bold shadow hover:scale-105 transition"
      >
        🖼️ {t("Choose from Files")}
      </button>
      <button
        onClick={() => setShowUploadOptions(false)}
        className="text-sm text-gray-500 hover:text-red-500 transition"
      >
        ❌ {t("Cancel")}
      </button>
    </div>
    
  </div>
)}

        {/* --- CART TAB --- */}
        {activeTab === "cart" && (
            <div id="supplier-carts"  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  🛒 {t("Supplier Carts")}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("Review scheduled orders and trigger supplier confirmations.")}
                </p>
              </div>
     
            </div>
            {suppliers.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {suppliers.map((supplier) => (
                  <SupplierScheduledCart
                    key={supplier.id}
                    supplier={supplier}
                    openSupplierCart={openSupplierCart}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                {t("No Suppliers")}
              </div>
            )}
          </div>
        )}

        {/* ⬆️ Scroll-to-top arrow */}
{showUp && (
  <button
    onClick={() =>
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }
    className="fixed bottom-6 right-6 z-50 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-lg transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
  >
    ↑
  </button>
)}



    {/* --- Supplier Cart Modal --- */}
    {showCartModal && (
      <SupplierCartModal
        supplierId={selectedSupplier?.id}
        cartId={cartId}
        show={showCartModal}
        cartItems={cartItems}
        onClose={() => setShowCartModal(false)}
        onChangeQty={handleCartQuantityChange}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        sending={sending}
        onConfirm={() => confirmSupplierCart(cartId)}
        onSend={() => sendSupplierCart(cartId)}
        autoOrder={autoOrder}
        setAutoOrder={setAutoOrder}
        repeatDays={repeatDays}
        setRepeatDays={setRepeatDays}
        repeatType={repeatType}
        setRepeatType={setRepeatType}
        lastSkippedInfo={cartHistory.find((h) => h.skipped) || null}
      />
    )}
    </div>
  </div>
);

}
