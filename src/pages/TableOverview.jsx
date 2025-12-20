import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PhoneOrderModal from "../modals/PhoneOrderModal";
import Orders from "../pages/Orders"; // adjust path as needed!
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import OrderHistory from "../components/OrderHistory";
import { useHeader } from "../context/HeaderContext";

import secureFetch from "../utils/secureFetch";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { openCashDrawer, logCashRegisterEvent } from "../utils/cashDrawer";
import { useCurrency } from "../context/CurrencyContext";
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://api.beypro.com/api");
const isDelayed = (order) => {
  if (!order || order.status !== "confirmed" || !order.created_at) return false;
  // Only treat as delayed if there is at least one item
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  const created = new Date(order.created_at);
  const now = new Date();
  const diffMins = (now - created) / 1000 / 60;
  return diffMins > 1;
};

// ✅ Improved color logic for moved/paid tables
// ✅ FIXED: show red if any suborder has unpaid items
// ✅ NEW: show orange if table is reserved
const getTableColor = (order) => {
  if (!order) return "bg-gray-300 text-black";

  // 🟠 CHECK FOR RESERVATION - if reserved
  if (order.status === "reserved" || order.order_type === "reservation" || order.reservation_date) {
    // 🟢 If reserved AND paid, show green
    if (order.status === "paid" || order.payment_status === "paid" || order.is_paid === true) {
      return "bg-green-500 text-white";
    }
    // 🟠 If reserved but not paid, show orange
    return "bg-orange-500 text-white";
  }

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];

  // 🧹 No items at all → treat as Free (neutral), not yellow
  if (items.length === 0) {
    return "bg-gray-300 text-black";
  }

  // 🔍 Check unpaid in suborders
  const hasUnpaidSubOrder = suborders.some((sub) =>
    Array.isArray(sub.items)
      ? sub.items.some((i) => !i.paid_at && !i.paid)
      : false
  );

  // 🔍 Check unpaid items in main order
  const hasUnpaidMainItem = items.some((i) => !i.paid_at && !i.paid);

  // 🟥 if any unpaid anywhere (main or sub)
  if (hasUnpaidSubOrder || hasUnpaidMainItem) {
    return "bg-red-500 text-white";
  }

  // 🟢 if all paid
  if (
    order.status === "paid" ||
    order.payment_status === "paid" ||
    order.is_paid === true
  ) {
    return "bg-green-500 text-white";
  }

  // 🟡 confirmed but unpaid (fallback)
  if (order.status === "confirmed") {
    return "bg-yellow-400 text-black";
  }

  return "bg-gray-300 text-black";
};

// ✅ Helper: true if any suborder or item unpaid
const hasUnpaidAnywhere = (order) => {
  if (!order) return false;

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];

  const unpaidSub = suborders.some((sub) =>
    Array.isArray(sub.items)
      ? sub.items.some((i) => !i.paid_at && !i.paid)
      : false
  );

  const unpaidMain = items.some((i) => !i.paid_at && !i.paid);

  return unpaidSub || unpaidMain;
};


const normalizeOrderStatus = (status) => {
  if (!status) return "";
  const normalized = String(status).toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

const isOrderCancelledOrCanceled = (status) => {
  const normalized = normalizeOrderStatus(status);
  return normalized === "cancelled" || normalized === "canceled";
};


const getDisplayTotal = (order) => {
  if (!order) return 0;

  if (order.receiptMethods?.length > 0) {
    return order.receiptMethods.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  }

  if (order.items?.some(i => !i.paid_at && !i.paid)) {
    return order.items
      .filter(i => !i.paid_at && !i.paid)
      .reduce((sum, i) => {
        const base = i.price * i.quantity;
        const extrasTotal = Array.isArray(i.extras)
          ? i.extras.reduce((extraSum, ex) => {
              const exQty = parseInt(ex.quantity || 1);
              const exPrice = parseFloat(ex.price || 0);
              return extraSum + exQty * exPrice;
            }, 0) * i.quantity // extras apply per product quantity
          : 0;
        return sum + base + extrasTotal;
      }, 0);
  }

  return parseFloat(order.total || 0);
};





export default function TableOverview() {
  useRegisterGuard();
  const { formatCurrency, config } = useCurrency();
  const [orders, setOrders] = useState([]);
  const [tableConfigs, setTableConfigs] = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [groupedClosedOrders, setGroupedClosedOrders] = useState({});
  const [activeTab, setActiveTab] = useState("tables");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const alertIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const [now, setNow] = useState(new Date());
  const [kitchenOrders, setKitchenOrders] = useState([]); // used for kitchen
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [phoneOrders, setPhoneOrders] = useState([]); // For active phone orders if you want to display/manage them
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [expectedCash, setExpectedCash] = useState(0);
  const [registerState, setRegisterState] = useState("loading");
  const [openingCash, setOpeningCash] = useState("");
  const [dailyCashExpense, setDailyCashExpense] = useState(undefined);
  const [yesterdayCloseCash, setYesterdayCloseCash] = useState(null);
  const [cashDataLoaded, setCashDataLoaded] = useState(false);
  const [lastOpenAt, setLastOpenAt] = useState(null);
  const canViewRegisterSummary = useHasPermission("settings-register-summary");
  const [packetOrders, setPacketOrders] = useState([]);
  const [showEntryForm, setShowEntryForm] = useState(false);
const [entryAmount, setEntryAmount] = useState("");
const [entryReason, setEntryReason] = useState("");
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const hasPermission = useHasPermission;
  // compute permissions once at top level (avoid calling hooks inside loops)
  const canSeeTablesTab = useHasPermission("tables");
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
  const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");
const [activeArea, setActiveArea] = useState("ALL");

const [registerEntries, setRegisterEntries] = useState(0);
  const [showRegisterLog, setShowRegisterLog] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeAmount, setChangeAmount] = useState("");
 
  const [todayRegisterEvents, setTodayRegisterEvents] = useState([]);
const [todayExpenses, setTodayExpenses] = useState([]);

const handleCloseTable = async (orderId) => {
  try {
    const items = await secureFetch(`/orders/${orderId}/items`);
    if (!Array.isArray(items)) {
      toast.error("Failed to verify kitchen items");
      return;
    }

    // ✅ Fetch current kitchen exclusion settings (same as TransactionScreen)
    const { excludedItems = [], excludedCategories = [] } =
      (await secureFetch("kitchen/compile-settings")) || {};

    // ✅ Allow closing if all items are delivered OR excluded
    const allDeliveredOrExcluded = items.every(
      (i) =>
        i.kitchen_status === "delivered" ||
        !i.kitchen_status ||
        excludedItems.includes(i.product_id) ||
        excludedCategories.includes(i.category)
    );

    if (!allDeliveredOrExcluded) {
      toast.warning("⚠️ Cannot close: some kitchen items not yet delivered!");
      return;
    }

    // ✅ Proceed to close
    await secureFetch(`/orders/${orderId}/close`, { method: "POST" });
    toast.success("✅ Table closed successfully!");

    // optional: return to overview
    setTimeout(() => {
      fetchOrders();
    }, 800);
  } catch (err) {
    console.error("❌ Failed to close table:", err);
    toast.error("Failed to close table");
  }
};






  const [supplierCashPayments, setSupplierCashPayments] = useState([]);
  const [staffCashPayments, setStaffCashPayments] = useState([]);

  const fetchRegisterStatus = useCallback(
    () => secureFetch("/reports/cash-register-status"),
    []
  );

  const fetchRegisterEntriesForToday = useCallback(async (today) => {
    try {
      const data = await secureFetch(`/reports/cash-register-history?from=${today}&to=${today}`);
      const todayRow = Array.isArray(data)
        ? data.find((row) => row.date === today)
        : null;
      setRegisterEntries(todayRow?.register_entries ? Number(todayRow.register_entries) : 0);
    } catch (err) {
      console.error("❌ Failed to fetch register entries:", err);
      setRegisterEntries(0);
    }
  }, []);

  const fetchRegisterLogsForToday = useCallback(async (today) => {
    const [eventsRes, expensesRes] = await Promise.allSettled([
      secureFetch(`/reports/cash-register-events?from=${today}&to=${today}`),
      secureFetch(`/reports/expenses?from=${today}&to=${today}`),
    ]);

    if (eventsRes.status === "fulfilled") {
      setTodayRegisterEvents(eventsRes.value);
    } else {
      setTodayRegisterEvents([]);
    }

    if (expensesRes.status === "fulfilled") {
      setTodayExpenses(expensesRes.value);
    } else {
      setTodayExpenses([]);
    }
  }, []);

  const fetchRegisterPaymentsForToday = useCallback(async (today) => {
    const [supplierRes, staffRes] = await Promise.allSettled([
      secureFetch(`/reports/supplier-cash-payments?from=${today}&to=${today}`),
      secureFetch(`/reports/staff-cash-payments?from=${today}&to=${today}`),
    ]);

    if (supplierRes.status === "fulfilled") {
      setSupplierCashPayments(Array.isArray(supplierRes.value) ? supplierRes.value : []);
    } else {
      setSupplierCashPayments([]);
    }

    if (staffRes.status === "fulfilled") {
      setStaffCashPayments(Array.isArray(staffRes.value) ? staffRes.value : []);
    } else {
      setStaffCashPayments([]);
    }
  }, []);

  const initializeRegisterSummary = useCallback(async () => {
    try {
      let openTime = null;
      const data = await fetchRegisterStatus();

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      setActualCash("");

      if (data.status === "open" || data.status === "closed") {
        openTime = data.last_open_at;
        const opening =
          data.opening_cash !== undefined && data.opening_cash !== null
            ? data.opening_cash.toString()
            : "";
        setOpeningCash(opening);
      }

      if (!openTime) {
        setCashDataLoaded(true);
        return;
      }

      const cashTotalRes = await secureFetch(
        `/reports/daily-cash-total?openTime=${encodeURIComponent(openTime)}`
      );

      let cashSales = parseFloat(cashTotalRes?.cash_total || 0);

      if (!Number.isFinite(cashSales) || cashSales <= 0) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const hist = await secureFetch(
            `/reports/cash-register-history?from=${today}&to=${today}`
          );
          const row = Array.isArray(hist)
            ? hist.find((r) => r.date === today)
            : null;
          if (row && row.cash_sales != null) {
            cashSales = parseFloat(row.cash_sales || 0);
          }
        } catch {
          // ignore fallback errors
        }
      }

      setExpectedCash(Number.isFinite(cashSales) ? cashSales : 0);

      const cashExpArr = await secureFetch(
        `/reports/daily-cash-expenses?openTime=${encodeURIComponent(openTime)}`
      ).catch(() => []);
      const logExpense = parseFloat(cashExpArr?.[0]?.total_expense || 0);

      const today = new Date().toISOString().slice(0, 10);
      const extraExpenses = await secureFetch(
        `/expenses?from=${today}&to=${today}`
      )
        .then((rows) =>
          Array.isArray(rows)
            ? rows.reduce(
                (sum, e) => sum + (parseFloat(e.amount || 0) || 0),
                0
              )
            : 0
        )
        .catch(() => 0);

      const totalExpense = (isNaN(logExpense) ? 0 : logExpense) + extraExpenses;

      console.log(
        "📉 New Daily Cash Expense (log + expenses):",
        totalExpense
      );
      setDailyCashExpense(totalExpense);
      setCashDataLoaded(true);
      console.log("✅ All cash data loaded");
    } catch (err) {
      console.error("❌ Error in modal init:", err);
      toast.error("Failed to load register data");
    }
  }, [fetchRegisterStatus]);

  const loadRegisterData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);

    setCashDataLoaded(false);
    setExpectedCash(0);
    setDailyCashExpense(0);
    setActualCash("");
    setRegisterState("loading");

    await Promise.all([
      fetchRegisterLogsForToday(today),
      fetchRegisterPaymentsForToday(today),
      fetchRegisterEntriesForToday(today),
      initializeRegisterSummary(),
    ]);
  }, [
    fetchRegisterEntriesForToday,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    initializeRegisterSummary,
  ]);

  useEffect(() => {
    if (!showRegisterModal) return;
    loadRegisterData();
  }, [showRegisterModal, loadRegisterData]);


const groupByDate = (orders) => {
  return orders.reduce((acc, order) => {
    const dateKey = order.created_at?.slice(0, 10) || "Unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(order);
    return acc;
  }, {});
};

const TAB_LIST = [
  { id: "takeaway", label: "Pre Order", icon: "⚡" }, 
  { id: "tables", label: "Tables", icon: "🍽️" },
  { id: "kitchen", label: "All Orders", icon: "👨‍🍳" },
  { id: "history", label: "History", icon: "📘" },
  { id: "packet", label: "Packet", icon: "🛵" },
  { id: "phone", label: "Phone", icon: "📞" },
  { id: "register", label: "Register", icon: "💵" },
];

const visibleTabs = TAB_LIST.filter((tab) => {
  if (tab.id === "takeaway") return canSeeTakeawayTab;
  if (tab.id === "tables") return canSeeTablesTab;
  if (tab.id === "kitchen") return canSeeKitchenTab;
  if (tab.id === "history") return canSeeHistoryTab;
  if (tab.id === "packet") return canSeePacketTab; // special case kept
  if (tab.id === "phone") return canSeePhoneTab;
  if (tab.id === "register") return canSeeRegisterTab;
  return true;
});

  const handleTabSelect = useCallback(
    (tabId) => {
      if (!tabId) return;
      setActiveTab(tabId);

      // Keep URL in sync so Router sees a navigation
      const basePath = location.pathname.includes("tableoverview")
        ? "/tableoverview"
        : "/tables";
      const params = new URLSearchParams(location.search);
      params.set("tab", tabId);
      navigate(`${basePath}?${params.toString()}`, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  useEffect(() => {
    if (
      !location.pathname.includes("tableoverview") &&
      !location.pathname.includes("/tables")
    )
      return;
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      handleTabSelect(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab, handleTabSelect, location.pathname]);

  // If URL has a tab param on load, sync once
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location.pathname, location.search, activeTab]);



  useEffect(() => {
    setShowPhoneOrderModal(activeTab === "phone");
    setShowRegisterModal(activeTab === "register");
  }, [activeTab]);

  useEffect(() => {
    const titlesByTab = {
      takeaway: t("Pre Order"),
      tables: t("Tables"),
      kitchen: t("All Orders"),
      history: t("History"),
      packet: t("Packet"),
      phone: t("Phone"),
      register: t("Register"),
    };
	    const headerTitle = titlesByTab[activeTab] || t("Orders");
	    const tableNav = (
	      <HeaderTableNav position="center">
	        <TableOverviewHeaderTabs
	          t={t}
	          tabs={visibleTabs}
	          activeTab={activeTab}
	          onChangeTab={handleTabSelect}
	        />
	      </HeaderTableNav>
	    );
    setHeader((prev) => ({
      ...prev,
      title: headerTitle,
      subtitle: undefined,
      tableNav,
    }));
  }, [
    activeTab,
	    visibleTabs,
	    t,
	    setHeader,
	    handleTabSelect,
	  ]);

useEffect(() => () => setHeader({}), [setHeader]);

useEffect(() => () => {
  isMountedRef.current = false;
}, []);


// Combine logs for the Register modal without duplicating cash expenses
// Cash expenses are already inserted into cash_register_logs when saved from Expenses page
const combinedEvents = [
  ...(todayRegisterEvents || []),
  ...((todayExpenses || [])
    .filter((e) => String(e.payment_method || "").toLowerCase() !== "cash")
    .map((e) => ({
      type: "expense",
      amount: e.amount,
      note: e.note || e.type || null,
      created_at: e.created_at,
    }))),
  ...(supplierCashPayments || []),
  ...(staffCashPayments || []),
].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const handleChangeCashSubmit = async (e) => {
  e.preventDefault();
  if (!changeAmount || isNaN(changeAmount) || Number(changeAmount) <= 0) {
    toast.error("Enter a valid change amount");
    return;
  }

  try {
    const res = await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({
        type: "change", // this will be mapped to 'expense' in backend
        amount: Number(changeAmount),
        note: "Change given to customer",
      }),
    });

    toast.success("Change recorded successfully!");
    setChangeAmount("");
    setShowChangeForm(false);

    // refresh the modal
    setShowRegisterModal(false);
    setTimeout(() => setShowRegisterModal(true), 350);
  } catch (err) {
    console.error("❌ Failed to record change:", err);
    toast.error(err.message || "Failed to record change");
  }
};


const refreshRegisterState = useCallback(() => {
  fetchRegisterStatus()
    .then((data) => {
      console.log("📥 /cash-register-status response:", data);

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      if (data.status === "open") {
        const opening = data.opening_cash?.toString() ?? "";
        setOpeningCash(opening);
        console.log("🔓 Register is OPEN, Opening Cash:", opening);
      } else {
        setOpeningCash("");
        console.log("🔐 Register is NOT open");
      }

      setActualCash("");
    })
    .catch((err) => {
      console.error("❌ Failed to refresh register state:", err);
      toast.error("Could not load register status");
    });
}, [fetchRegisterStatus]);


const fetchPacketOrders = useCallback(async () => {
  try {
    const [packet, phone] = await Promise.all([
      secureFetch(`/orders?type=packet`),
      secureFetch(`/orders?type=phone`),
    ]);

    const packetArray = Array.isArray(packet) ? packet : [];
    const phoneArray = Array.isArray(phone) ? phone : [];

    const data = [...packetArray, ...phoneArray];

    const ordersWithItems = await Promise.all(
      data
        .filter((o) => o.status !== "closed")
        .map(async (order) => {
          const items = (await secureFetch(`/orders/${order.id}/items`)).map((item) => ({
            ...item,
            discount_type: item.discount_type || item.discountType || null,
            discount_value:
              item.discount_value != null
                ? parseFloat(item.discount_value)
                : item.discountValue != null
                ? parseFloat(item.discountValue)
                : 0,
          }));

          let receiptMethods = [];
          if (order.receipt_id) {
            try {
              receiptMethods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`);
            } catch (e) {
              console.warn("⚠️ Failed to fetch receipt methods for order", order.id, e);
            }
          }

          return { ...order, items, receiptMethods };
        })
    );

    setPacketOrders(ordersWithItems);
  } catch (err) {
    console.error("❌ Fetch packet orders failed:", err);
    toast.error("Could not load packet orders");
  }
}, []);;

const [takeawayOrders, setTakeawayOrders] = useState([]);

const fetchTakeawayOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/orders?type=takeaway");
    const filtered = Array.isArray(data) ? data.filter(o => o.status !== "closed") : [];

    // Fetch items and receipt methods for accurate total display (like tables/packet)
    const ordersWithItems = await Promise.all(
      filtered.map(async (order) => {
        try {
          let items = (await secureFetch(`/orders/${order.id}/items`)).map((item) => ({
            ...item,
            discount_type: item.discount_type || item.discountType || null,
            discount_value:
              item.discount_value != null
                ? parseFloat(item.discount_value)
                : item.discountValue != null
                ? parseFloat(item.discountValue)
                : 0,
          }));

          // ✅ Fallback for online-paid orders missing item paid flags
          const isOrderPaid =
            order.status === "paid" || order.payment_status === "paid" || order.is_paid === true;
          if (isOrderPaid) {
            items = items.map((i) => ({ ...i, paid: i.paid || true }));
          }

          let receiptMethods = [];
          if (order.receipt_id) {
            try {
              receiptMethods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`);
            } catch (e) {
              console.warn("⚠️ Failed to fetch receipt methods for takeaway order", order.id, e);
            }
          }

          return { ...order, items, receiptMethods };
        } catch (e) {
          console.warn("⚠️ Failed to enrich takeaway order", order.id, e);
          return { ...order, items: [], receiptMethods: [] };
        }
      })
    );

    setTakeawayOrders(ordersWithItems);
  } catch (err) {
    console.error("❌ Fetch takeaway orders failed:", err);
    toast.error("Could not load takeaway orders");
  }
}, []);

/* moved below loadDataForTab to avoid TDZ */




useEffect(() => {
  refreshRegisterState();
}, [refreshRegisterState]);












// (location + handleTabSelect declared above)





useEffect(() => {
  const today = new Date().toISOString().split("T")[0];
  setFromDate(today);
  setToDate(today);
}, []);

const fetchOrders = useCallback(async () => {
  console.log("🔍 Current user before fetch:", currentUser);
  console.log("🔍 Token in localStorage:", localStorage.getItem("token"));
  try {
    // Always use secureFetch → tenant_id + auth included
    const data = await secureFetch("/orders");

    if (!Array.isArray(data)) {
      console.error("❌ Unexpected orders response:", data);
      toast.error("Failed to load orders");
      return;
    }

    const openOrders = data
      .filter((o) => o.status !== "closed" && o.status !== "cancelled")
      .map((order) => {
        const status = normalizeOrderStatus(order.status);
        return {
          ...order,
          status,
          total: status === "paid" ? 0 : parseFloat(order.total || 0),
        };
      });

    const ordersWithItems = await Promise.all(
      openOrders.map(async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`);

        let items = itemsRaw.map((item) => ({
          ...item,
          discount_type: item.discount_type || item.discountType || null,
          discount_value:
            item.discount_value != null
              ? parseFloat(item.discount_value)
              : item.discountValue != null
              ? parseFloat(item.discountValue)
              : 0,
        }));

        // ✅ Fallback: if order is marked paid but items lack paid flags, coerce for UI consistency
        const isOrderPaid =
          order.status === "paid" || order.payment_status === "paid" || order.is_paid === true;
        if (isOrderPaid) {
          items = items.map((i) => ({ ...i, paid: i.paid || true }));
        }

        // 🎫 Fetch reservation data if it's a reserved order or has reservation fields
        let reservation = null;
        try {
          if (order.status === "reserved" || order.reservation_date) {
            const resData = await secureFetch(`/orders/reservations/${order.id}`);
            if (resData?.success && resData?.reservation) {
              reservation = resData.reservation;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch reservation for order ${order.id}:`, err);
        }

        return { ...order, items, reservation };
      })
    );

    // ✅ Merge by table_number (combine all open orders of same table)
    const mergedByTable = Object.values(
      ordersWithItems.reduce((acc, order) => {
        const key = order.table_number || `no_table_${order.id}`;
        if (!acc[key]) {
          acc[key] = {
            ...order,
            merged_ids: [order.id],
            merged_items: [...(order.items || [])],
          };
        } else {
          acc[key].merged_ids.push(order.id);
          acc[key].items = [...(acc[key].items || []), ...(order.items || [])];
          acc[key].merged_items = acc[key].items;
          acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
          // if one is unpaid, mark merged as confirmed; if all paid, mark paid
          acc[key].status =
            acc[key].status === "paid" && order.status === "paid"
              ? "paid"
              : "confirmed";
        }
        // ✅ Derive merged paid flag from items (no unpaid items => paid)
        const anyUnpaid = (acc[key].items || []).some((i) => !i.paid_at && !i.paid);
        acc[key].is_paid = !anyUnpaid;
        return acc;
      }, {})
    );

    setOrders(mergedByTable);
  } catch (err) {
    console.error("❌ Fetch open orders failed:", err);
    toast.error("Could not load open orders");
  }
}, [currentUser]);





function hasReadyOrder(order) {
  // If any item in the order is ready and not delivered
  return (
    Array.isArray(order?.items)
      ? order.items.some(item => item.kitchen_status === "ready")
      : false
  );
}


const fetchClosedOrders = useCallback(async () => {
  const query = new URLSearchParams();
  if (fromDate) query.append("from", fromDate);
  if (toDate) query.append("to", toDate);

  try {
    const data = await secureFetch(`/reports/history?${query.toString()}`);

    const enriched = await Promise.all(
      data.map(async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`);

     const items = itemsRaw.map(item => ({
  ...item,
  discount_type: item.discount_type || null,
  discount_value: item.discount_value ? parseFloat(item.discount_value) : 0,
  name: item.product_name || item.order_item_name || item.external_product_name || "Unnamed"
}));

        const suborders = await secureFetch(`/orders/${order.id}/suborders`);

        const receiptIds = [
          ...new Set([
            order.receipt_id,
            ...items.map(i => i.receipt_id).filter(Boolean),
            ...suborders.map(s => s.receipt_id).filter(Boolean)
          ].filter(Boolean))
        ];

        let receiptMethods = [];
        for (const receiptId of receiptIds) {
          const methods = await secureFetch(`/reports/receipt-methods/${receiptId}`);
          receiptMethods.push(...methods);
        }

        return { ...order, items, suborders, receiptMethods };
      })
    );

    const nonEmptyOrders = enriched.filter(order => Array.isArray(order.items));

    const grouped = nonEmptyOrders.reduce((acc, order) => {
      const date = new Date(order.created_at).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(order);
      return acc;
    }, {});

    setClosedOrders(nonEmptyOrders);
    setGroupedClosedOrders(grouped);
    console.log("✅ Closed orders loaded:", nonEmptyOrders);
  } catch (err) {
    console.error("❌ Fetch closed orders failed:", err);
    toast.error("Failed to load order history");
  }
}, [fromDate, toDate]);


// === FIXED fetchKitchenOrders (merges same-customer orders) ===
const fetchKitchenOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/kitchen-orders");

    const active = data.filter(
      (item) =>
        item.kitchen_status !== "delivered" &&
        item.kitchen_status !== null &&
        item.kitchen_status !== ""
    );

    const buildGroupKey = (item) => {
      const type = String(item.order_type || "").trim().toLowerCase();
      const tableNo = item.table_number ? String(item.table_number) : "";
      const phone = (item.customer_phone || "").replace(/\s+/g, "");
      if (type === "table" && tableNo) {
        return `table-${tableNo}`;
      }
      if ((type === "phone" || type === "packet" || type === "takeaway") && phone) {
        return `phone-${phone}`;
      }
      if (item.order_id) {
        return `order-${item.order_id}`;
      }
      const nameKey = (item.customer_name || "").trim().toLowerCase();
      if (nameKey) return `name-${nameKey}`;
      return `item-${item.item_id}`;
    };

    const merged = Object.values(
      active.reduce((acc, item) => {
        const key = buildGroupKey(item);
        if (!acc[key]) {
          acc[key] = {
            ...item,
            merged_item_ids: [item.item_id],
            merged_products: [item.product_name],
            total_quantity: Number(item.quantity || 0),
            tables: item.table_number ? [item.table_number] : [],
            order_refs: item.order_id ? [item.order_id] : [],
            phones: item.customer_phone ? [item.customer_phone] : [],
          };
          return acc;
        }

        const entry = acc[key];
        entry.merged_item_ids.push(item.item_id);
        entry.merged_products.push(item.product_name);
        entry.total_quantity += Number(item.quantity || 0);
        if (item.table_number && !entry.tables.includes(item.table_number)) {
          entry.tables.push(item.table_number);
        }
        if (item.order_id && !entry.order_refs.includes(item.order_id)) {
          entry.order_refs.push(item.order_id);
        }
        if (item.customer_phone && !entry.phones.includes(item.customer_phone)) {
          entry.phones.push(item.customer_phone);
        }

        if (
          (item.kitchen_status === "ready" || item.kitchen_status === "preparing") &&
          entry.kitchen_status !== "ready"
        ) {
          entry.kitchen_status = item.kitchen_status;
        }
        return acc;
      }, {})
    );

    setKitchenOrders(merged);
  } catch (err) {
    console.error("❌ Fetch kitchen orders failed:", err);
  }
}, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

const fetchPhoneOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/orders?type=phone");

    // Filter for open phone orders (not closed)
    setPhoneOrders(data.filter((o) => o.order_type === "phone" && o.status !== "closed"));
  } catch (err) {
    console.error("Fetch phone orders failed:", err);
  }
}, []);

// Fetch table configurations when viewing tables (inside component)
const fetchTableConfigs = useCallback(async () => {
  try {
    const rows = await secureFetch("/tables");
    const arr = Array.isArray(rows) ? rows : [];
    setTableConfigs(arr.filter((t) => t.active !== false));
  } catch {
    setTableConfigs([]);
  }
}, []);


  const loadDataForTab = useCallback(
    (tab) => {
      if (tab === "tables") {
        fetchOrders();
        fetchTableConfigs();
        return;
      }
      if (tab === "kitchen" || tab === "open") {
        fetchKitchenOrders();
        return;
      }
      if (tab === "history") {
        fetchClosedOrders();
        return;
      }
      if (tab === "packet") {
        fetchPacketOrders();
        return;
      }
      if (tab === "phone") {
        fetchPhoneOrders();
        return;
      }
      if (tab === "takeaway") {
        fetchTakeawayOrders();
      }
    },
    [
      fetchClosedOrders,
      fetchKitchenOrders,
      fetchOrders,
      fetchPacketOrders,
      fetchPhoneOrders,
      fetchTableConfigs,
      fetchTakeawayOrders,
    ]
  );

// now safe to reference loadDataForTab
useEffect(() => {
  if (!window.socket) return;
  const refetch = () => {
    setTimeout(() => loadDataForTab(activeTab), 300);
  };
  window.socket.on("orders_updated", refetch);
  return () => window.socket && window.socket.off("orders_updated", refetch);
}, [activeTab, loadDataForTab]);

  useEffect(() => {
    loadDataForTab(activeTab);
  }, [activeTab, fromDate, toDate, loadDataForTab]);

  // Ensure table configs load when Tables tab is active
  useEffect(() => {
    if (activeTab === "tables" && (Array.isArray(tableConfigs) ? tableConfigs.length === 0 : true)) {
      fetchTableConfigs();
    }
  }, [activeTab, tableConfigs.length, fetchTableConfigs]);


const tables = tableConfigs
  .map((cfg) => {
    const order = orders.find(
      (o) =>
        o.table_number === cfg.number &&
        !isOrderCancelledOrCanceled(o.status)
    );

    return {
      tableNumber: cfg.number,
      seats: cfg.seats || cfg.chairs || null,
      area: cfg.area || "Main Hall",
      label: cfg.label || "",
      color: cfg.color || null,
      order,
    };
  })
  .sort((a, b) => a.tableNumber - b.tableNumber);



const handlePrintOrder = async (orderId) => {
  if (!orderId) {
    toast.warn(t("No order selected to print"));
    return;
  }
  try {
    const printable = await fetchOrderWithItems(orderId);
    const ok = await printViaBridge("", printable);
    toast[ok ? "success" : "warn"](
      ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
    );
  } catch (err) {
    console.error("❌ Print failed:", err);
    toast.error(t("Failed to print receipt"));
  }
};


const handleTableClick = async (table) => {
  const data = await fetchRegisterStatus();

  if (data.status === "closed" || data.status === "unopened") {
    toast.error("Register must be open to access tables!", {
      position: "top-center",
      autoClose: 2500,
    });
    handleTabSelect("register");
    setShowRegisterModal(true);
    return;
  }

  // 🔥 FIXED: treat cancelled or empty orders as FREE
  const isCancelledOrder = isOrderCancelledOrCanceled(table.order?.status);

  if (
    !table.order ||
    isCancelledOrder ||
    !Array.isArray(table.order.items) ||
    table.order.items.length === 0
  ) {
    try {
      const newOrder = await secureFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          table_number: table.tableNumber,
          order_type: "table",
          total: 0,
          items: [],
        }),
      });

      navigate(`/transaction/${table.tableNumber}`, { state: { order: newOrder } });
    } catch (err) {
      console.error("Create order failed:", err);
      toast.error("Failed to create order");
    }
  } else {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
  }
};



const getTimeElapsed = (order) => {
  if (!order?.created_at || order.status !== "confirmed") return null;
  const toMs = (val) => {
    if (!val) return NaN;
    const a = new Date(val).getTime();
    const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
    const b = new Date(bStr).getTime();
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
    }
    return Number.isFinite(a) ? a : b;
  };
  const createdMs = toMs(order.created_at);
  const diffMs = now - createdMs;
  const mins = Math.floor(Math.max(0, diffMs) / 60000);
  const secs = Math.floor((Math.max(0, diffMs) % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};
 const markMultipleAsDelivered = async (itemIds) => {
  try {
    new Audio("/sound-ready.mp3").play(); // 🔊 Play instantly
await secureFetch("/orders/order-items/kitchen-status", {
  method: "PUT",
  body: JSON.stringify({
    ids: itemIds,
    status: "delivered",
  }),
});

    fetchKitchenOrders();
  } catch (err) {
    console.error("❌ Failed to mark as delivered:", err);
  }
};

useEffect(() => {
  fetchRegisterStatus()
    .then((data) => {
      setRegisterState(data.status);
      setOpeningCash("");
      if (
        (location.pathname.startsWith("/tableoverview") ||
         location.pathname.startsWith("/transaction")) &&
        (data.status === "closed" || data.status === "unopened")
      ) {
        toast.error("Register must be open to access this page!", {
          position: "top-center",
          autoClose: 2500,
          hideProgressBar: false,
        });
        navigate("/Dashboard"); // or any safe page
      }
    })
    .catch((err) => {
      console.error("❌ Failed to refresh register state:", err);
    });
}, [fetchRegisterStatus, location.pathname, navigate]);




  const groupedByTable = orders.reduce((acc, item) => {
  const table = item.table_number;
  if (!acc[table]) acc[table] = [];
  acc[table].push(item);
  return acc;
}, {});

  function safeParse(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data || [];
  } catch {
    return [];
  }
}

// Group tables by area
const groupedTables = tables.reduce((acc, tbl) => {
  const area = tbl.area || "Main Hall";
  if (!acc[area]) acc[area] = [];
  acc[area].push(tbl);
  return acc;
}, {});


  // --- RETURN (NEW UI) ---
  return (
    <div className="min-h-screen bg-transparent px-0 pt-4 relative">
{activeTab === "tables" && (
  <div className="w-full flex flex-col items-center">

    {/* ================= AREA TABS ================= */}
    <div className="flex justify-center gap-3 flex-wrap mt-4 mb-10">

      {/* ALL AREAS */}
      <button
        onClick={() => setActiveArea("ALL")}
        className={`
          px-6 py-2.5 rounded-full font-semibold shadow 
          transition-all duration-150 text-sm
          ${activeArea === "ALL"
            ? "bg-indigo-600 text-white scale-105 shadow-lg"
            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"}
        `}
      >
        🌍 ALL AREAS
      </button>

      {Object.keys(groupedTables).map((area) => (
        <button
          key={area}
          onClick={() => setActiveArea(area)}
          className={`
            px-6 py-2.5 rounded-full font-semibold shadow 
            transition-all duration-150 text-sm
            ${activeArea === area
              ? "bg-blue-600 text-white scale-105 shadow-lg"
              : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50"}
          `}
        >
          {area === "Hall" ? "🏠" :
           area === "Terrace" ? "🌤️" :
           area === "Garden" ? "🌿" :
           area === "VIP" ? "⭐" : "📍"}{" "}
          {area}
        </button>
      ))}
    </div>

    {/* ================= TABLE GRID (BIGGER, CENTERED) ================= */}
    <div className="w-full flex justify-center px-8">
      <div className="
        grid
        grid-cols-1
        sm:grid-cols-2
        lg:grid-cols-2
        xl:grid-cols-4
        2xl:grid-cols-4
        gap-8
        place-items-center
        w-full
        max-w-[1600px]
      ">

        {(activeArea === "ALL" ? tables : groupedTables[activeArea]).map((table) => (
          
          <div
            key={table.tableNumber}
            onClick={() => handleTableClick(table)}
            className={`
              group relative cursor-pointer p-6 rounded-[2.5rem]
              ${getTableColor(table.order)}
              shadow-2xl hover:shadow-accent/50 hover:scale-[1.035]
              transition-all duration-200 border-4 border-white/30
              flex flex-col justify-between
              w-[320px]
              min-h-[280px]
            `}
            style={{
              borderColor: table.color || "#e2e2e2",
            }}
          >

            {/* ------- TOP ROW ------- */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-800 text-lg font-bold">{t("Table")}</span>
                <span className="text-lg font-bold text-blue-500 bg-white/60 rounded-xl px-2">
                  {String(table.tableNumber).padStart(2, "0")}
                </span>
              </div>

              {table.order?.status === "confirmed" &&
                table.order?.items?.length > 0 && (
                <span className="bg-blue-600 text-white rounded-xl px-3 py-1 font-mono text-sm shadow-md animate-pulse">
                  ⏱ {getTimeElapsed(table.order)}
                </span>
              )}
            </div>

            {/* LABEL */}
            {table.label && (
              <div className="text-xs font-semibold bg-white/60 text-slate-700 rounded-full px-2 py-0.5 mb-1">
                {table.label}
              </div>
            )}

            {/* AREA */}
            <div className="text-[11px] bg-white/60 rounded-full px-2 py-0.5 inline-block mb-1 text-gray-600">
              📍 {table.area}
            </div>

            {/* SEATS */}
            {table.seats && (
              <div className="text-[11px] bg-indigo-100 rounded-full px-2 py-0.5 inline-block mb-2 text-indigo-700">
                🪑 {table.seats} {t("Seats")}
              </div>
            )}

            {/* STATUS */}
            <div className="flex flex-col gap-2 flex-grow">
              {(!table.order || table.order.items?.length === 0) ? (
                <span className="inline-block px-4 py-1 rounded-full bg-green-200 text-green-900 font-extrabold text-base shadow">
                  {t("Free")}
                </span>
              ) : (
                <>
                  <span className="uppercase font-extrabold text-white tracking-wide">
                    {t(table.order.status === "draft" ? "Free" : table.order.status)}
                  </span>

                  {/* RESERVATION BADGE */}
                  {table.order.reservation && table.order.reservation.reservation_date && (
                    <div className="mt-2 p-2 bg-white/20 rounded-lg text-xs">
                      <div className="font-semibold text-white mb-1">🎫 RESERVED</div>
                      <div className="flex gap-2 text-[10px] text-white/90">
                        <div className="flex flex-col">
                          <span className="font-semibold">🕐 {table.order.reservation.reservation_time || "—"}</span>
                          <span className="font-semibold">👥 {table.order.reservation.reservation_clients || 0} {t("guests")}</span>
                        </div>
                        <div className="flex-1">
                          <span className="font-semibold">📅 {table.order.reservation.reservation_date || "—"}</span>
                          {table.order.reservation.reservation_notes && (
                            <p className="text-[9px] line-clamp-1 text-white/80">📝 {table.order.reservation.reservation_notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KITCHEN BADGES */}
                  {table.order.items && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["new", "preparing", "ready", "delivered"].map((status) => {
                        const count = table.order.items.filter(
                          (i) => i.kitchen_status === status
                        ).length;
                        if (!count) return null;

                        return (
                          <span
                            key={status}
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold
                              ${status === "preparing"
                                ? "bg-yellow-400 text-white"
                                : status === "ready"
                                ? "bg-blue-500 text-white"
                                : status === "delivered"
                                ? "bg-green-500 text-white"
                                : "bg-gray-400 text-white"}
                            `}
                          >
                            {count} {t(status)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* TOTAL + ACTIONS */}
            <div className="flex items-end justify-between mt-4">
              {isDelayed(table.order) && (
                <span className="text-yellow-500 font-bold animate-pulse">⚠️</span>
              )}

              <div className="flex items-center gap-3 ml-auto">
                <span className="text-lg font-bold text-indigo-700">
                  {formatCurrency(getDisplayTotal(table.order))}
                </span>

                {table.order?.items?.length > 0 && (
                  <>
                    {/* PRINT */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintOrder(table.order.id);
                      }}
                      className="px-2.5 py-1.5 bg-slate-200 text-slate-800 font-bold rounded-full shadow border border-slate-300"
                    >
                      🖨️
                    </button>

                    {/* UNPAID / PAID */}
                    {hasUnpaidAnywhere(table.order) ? (
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold rounded-full shadow-sm">
                        {t("Unpaid")}
                      </span>
                    ) : (
                      <>
                        <span className="px-3 py-1 bg-green-100 text-green-800 font-bold rounded-full shadow-sm">
                          ✅ {t("Paid")}
                        </span>

                        {/* CLOSE TABLE */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTable(table.order.id);
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-green-400 to-indigo-400 text-white font-bold rounded-full shadow"
                        >
                          🔒 {t("Close")}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        ))}

      </div>
    </div>

  </div>
)}



{activeTab === "takeaway" && (
  <div className="px-6 py-4">
    <h2 className="text-2xl font-bold text-orange-600 mb-5">🥡 {t("Pre Orders")}</h2>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* ➕ New Takeaway Card */}
      <button
        onClick={async () => {
          try {
            const newOrder = await secureFetch("/orders", {
              method: "POST",
              body: JSON.stringify({
                order_type: "takeaway",
                total: 0,
                items: [],
              }),
            });
            navigate(`/transaction/phone/${newOrder.id}`, { state: { order: newOrder } });
          } catch (err) {
            console.error("❌ Failed to create takeaway order:", err);
            toast.error("Could not create new takeaway order");
          }
        }}
        className="border-2 border-dashed border-orange-400 rounded-3xl p-8 flex flex-col items-center justify-center text-orange-500 hover:bg-orange-50 transition"
      >
        <span className="text-5xl mb-2">➕</span>
        <span className="font-semibold text-lg">{t("New Pre-Orders")}</span>
      </button>

      {/* Existing Takeaway Orders */}
      {takeawayOrders.map(order => (
        <div
          key={order.id}
          onClick={() => navigate(`/transaction/phone/${order.id}`, { state: { order } })}
          className="cursor-pointer rounded-3xl bg-white/80 p-5 shadow-lg hover:shadow-xl transition hover:scale-[1.03]"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold text-orange-700">#{order.id}</span>
            <span className="text-sm text-gray-500">
              {new Date(order.created_at).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="font-bold text-gray-800">
            {formatCurrency(getDisplayTotal(order))}
          </div>
          <div className="text-sm text-gray-500">
            {order.customer_name || t("Guest")}
          </div>

          {/* Pre-order scheduling info */}
          {order.pickup_time && (
            <div className="mt-1 text-xs text-orange-700">
              🕒 {t("Pickup")}: {order.pickup_time}
            </div>
          )}
          {order.customer_address && (
            <div className="mt-0.5 text-xs text-emerald-700">
              🚚 {t("Delivery")}: {order.customer_address}
            </div>
          )}

          {/* Status + Kitchen badges (like tables) */}
          <div className="mt-2">
            {/* Order status label */}
            {order?.status && (
              <div className="flex items-center gap-2">
                <span className="uppercase font-extrabold tracking-wide text-orange-700">
                  {t(order.status)}
                </span>
                {/* Paid / Unpaid chip */}
                {Array.isArray(order.items) && order.items.length > 0 && (
                  hasUnpaidAnywhere(order) ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-xs shadow-sm">
                      {t("Unpaid")}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 font-bold rounded-full text-xs shadow-sm">
                      ✅ {t("Paid")}
                    </span>
                  )
                )}
              </div>
            )}

            {/* Kitchen status badges */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {["new", "preparing", "ready", "delivered"].map((status) => {
                  const count = order.items.filter((item) => item.kitchen_status === status).length;
                  if (!count) return null;
                  return (
                    <span
                      key={status}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        status === "preparing"
                          ? "bg-yellow-400 text-white"
                          : status === "ready"
                          ? "bg-blue-500 text-white"
                          : status === "delivered"
                          ? "bg-green-500 text-white"
                          : status === "new"
                          ? "bg-gray-400 text-white"
                          : "bg-gray-300 text-black"
                      }`}
                    >
                      {count} {t(status)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}




    {/* --- Modal --- */}
    {showPhoneOrderModal && (
      <PhoneOrderModal
        open={showPhoneOrderModal}
        onClose={() => {
          setShowPhoneOrderModal(false);
          handleTabSelect("tables");
        }}
	onCreateOrder={() => {
	  setShowPhoneOrderModal(false);
	  handleTabSelect("takeaway");
	  setTimeout(() => {
	    fetchTakeawayOrders();
	  }, 300);
	}}





      />
    )}

    {activeTab === "phone" && <Orders />}
{activeTab === "packet" && (
  canSeePacketTab ? (
    <Orders hideModal={true} orders={packetOrders} />
  ) : (
    <div className="text-center mt-10 text-rose-500 font-bold">
      🚫 {t("Access Denied: Packet Orders")}
    </div>
  )
)}

{activeTab === "history" && (
      <OrderHistory
        fromDate={fromDate}
        toDate={toDate}
        paymentFilter={paymentFilter}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setPaymentFilter={setPaymentFilter}
      />
    )}

{activeTab === "kitchen" && (
  <div className="px-3 md:px-8 py-6">
 
    {kitchenOrders.length === 0 ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-6xl mb-3">🥲</span>
        <span className="text-xl text-gray-400 font-semibold">{t("No kitchen orders in progress.")}</span>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
    {kitchenOrders.map(item => {
  const orderType = String(item.order_type || "").trim().toLowerCase();
  const takeawayNotes = item.takeaway_notes || item.notes;
  const displayName = Array.isArray(item.merged_products)
    ? item.merged_products.join(", ")
    : item.product_name;
  const mergedKey = item.merged_item_ids ? item.merged_item_ids.join("-") : item.item_id;
  return (
    <div
      key={mergedKey}

            className="rounded-3xl bg-gradient-to-br from-white/80 via-blue-50 to-indigo-50 border border-white/40 shadow-xl p-5 flex flex-col gap-3 hover:scale-[1.03] hover:shadow-2xl transition"
          >
            <div className="flex justify-between items-center">
<div className="font-bold text-lg text-blue-800 flex flex-col">
  {orderType === "phone" ? (
    <>
      <span>📞 {item.customer_name || item.customer_phone}</span>
      {item.customer_address && (
        <span className="text-xs text-green-700">{item.customer_address}</span>
      )}
      <span className="ml-1 px-2 py-0.5 rounded bg-blue-200 text-blue-800 text-xs font-bold">Phone</span>
    </>
  ) : orderType === "packet" ? (
    <>
      <span>🛵 {item.customer_name || "Online Order"}</span>
      {item.customer_address && (
        <span className="text-xs text-green-700">{item.customer_address}</span>
      )}
      {/* Platform badge */}
      <span className="ml-1 px-2 py-0.5 rounded bg-orange-200 text-orange-800 text-xs font-bold">
        {item.external_id ? "Yemeksepeti" : "Packet"}
      </span>
    </>
  ) : orderType === "takeaway" ? (
    <>
      <span>🥡 {t("Pre Order")}</span>
      {item.customer_name && (
        <span className="text-sm text-slate-700">👤 {item.customer_name}</span>
      )}
      {item.customer_phone && (
        <span className="text-xs text-slate-500">📞 {item.customer_phone}</span>
      )}
      {item.pickup_time && (
        <span className="text-xs text-orange-700">
          🕒 {t("Pickup")}: {item.pickup_time}
        </span>
      )}
      {takeawayNotes && (
        <span className="text-xs text-rose-600">📝 {takeawayNotes}</span>
      )}
      <span className="ml-1 px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-xs font-bold">
        {t("Pre Order")}
      </span>
    </>
  ) : (
    <>
      <span>🍽 {t("Table")} {item.table_number}</span>
      <span className="ml-1 px-2 py-0.5 rounded bg-indigo-200 text-indigo-800 text-xs font-bold">Table</span>
    </>
  )}
</div>

              <div className={`px-2 py-1 rounded-full text-xs font-bold
                ${item.kitchen_status === "preparing" ? "bg-yellow-400 text-white" :
                  item.kitchen_status === "ready" ? "bg-blue-500 text-white" :
                  item.kitchen_status === "delivered" ? "bg-green-500 text-white" :
                  "bg-gray-300 text-black"}`}>
                {t(item.kitchen_status || "new")}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-gray-800 text-base">
              <span className="font-semibold">{displayName}</span>
              <span>{t("Qty")}: {item.quantity}</span>
              {item.note && (
                <span className="text-xs bg-yellow-100 text-yellow-900 rounded px-2 py-1 mt-1">📝 {item.note}</span>
              )}
{item.extras && Array.isArray(item.extras) && item.extras.length > 0 && (
  <ul className="text-xs mt-2 ml-3 text-blue-700">
    {item.extras.map((ex, idx) => {
      const itemQty = parseInt(item.quantity || item.qty || 1);
      const extraQty = parseInt(ex.quantity || ex.qty || 1);
      const lineQty = itemQty * extraQty;
      const unitPrice = parseFloat(ex.price || 0);
      const total = (lineQty * unitPrice).toFixed(2);
      return (
        <li key={idx} className="flex items-center gap-2">
          <span>
            ➕
            {extraQty > 1 ? ` ${extraQty}x ` : " "}
            {ex.name}
          </span>
          <span className="text-gray-500">
            @ {formatCurrency(unitPrice)}
          </span>
          <span className="ml-2 text-blue-900 font-semibold">
            {formatCurrency(total)}
          </span>
        </li>
      );
    })}
  </ul>
)}


            </div>
          </div>
        )})}
      </div>
    )}
  </div>
)}


{showRegisterModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all">
    <div
      className={`
        relative bg-gradient-to-br from-white/90 via-indigo-50 to-blue-100
        dark:from-gray-900 dark:via-slate-900 dark:to-gray-800
        rounded-3xl shadow-2xl mx-3 w-full max-w-[520px] max-h-[90vh] overflow-y-auto
        p-8 animate-fade-in
        border-4 border-white/50 dark:border-black/20
      `}
      style={{
        boxShadow: "0 12px 60px 0 rgba(30,34,90,0.18)",
      }}
    >
      {/* Close Button */}
      <button
        onClick={() => {
          setShowRegisterModal(false);
          handleTabSelect("tables");
        }}
        className="absolute top-5 right-5 text-2xl text-gray-400 hover:text-indigo-700 transition-all hover:-translate-y-1"
        title={t("Close")}
        aria-label="Close"
        tabIndex={0}
      >
        <span className="block bg-white/80 dark:bg-gray-800/70 rounded-full p-2 shadow hover:shadow-xl">✕</span>
      </button>

      {/* Title */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl bg-gradient-to-r from-blue-500 via-fuchsia-400 to-indigo-400 text-white rounded-full p-3 shadow-md">💵</span>
        <h2 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-600 to-indigo-600 text-transparent bg-clip-text tracking-tight">
          {registerState === "unopened" || registerState === "closed"
            ? t('Open Register')
            : t('Register Summary')}
        </h2>
      </div>
      <div className="h-[2px] w-full bg-gradient-to-r from-blue-200 via-indigo-300 to-fuchsia-200 rounded-full mb-5 opacity-60" />


      {/* Modal Content */}
      {!cashDataLoaded ? (
        <p className="text-center text-gray-500 font-semibold">{t('Loading register data...')}</p>
      ) : registerState === "closed" || registerState === "unopened" ? (
        <>
          {/* Opening Cash Entry */}
          <div className="mb-8">
            <label className="block text-base font-semibold text-gray-700 mb-2">
              💼 {t('Opening Cash')}
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              className="w-full p-5 rounded-2xl border-2 border-blue-300 text-lg shadow-lg focus:border-blue-500 outline-none transition"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            {yesterdayCloseCash !== null && (
              <div className="text-blue-700 text-sm mt-2">
                🔒 Last Closing:{" "}
                {formatCurrency(parseFloat(yesterdayCloseCash || 0))}
              </div>
            )}
          </div>
          {/* Comparison Card */}
          {openingCash !== "" && yesterdayCloseCash !== null && (
            <div className="bg-gradient-to-r from-white via-blue-50 to-indigo-50 border border-gray-200 rounded-3xl p-5 mt-2 shadow-md space-y-2">
              <div className="flex justify-between items-center font-semibold">
                <span>💼 {t("Opening")}</span>
                <span className="text-green-700 tabular-nums">
                  {formatCurrency(parseFloat(openingCash || 0))}
                </span>
              </div>
              <div className="flex justify-between items-center font-semibold">
                <span>🔒 {t("Last Closing")}</span>
                <span className="text-blue-700 tabular-nums">
                  {formatCurrency(parseFloat(yesterdayCloseCash || 0))}
                </span>
              </div>
              <div className={`flex justify-between items-center font-semibold ${
                parseFloat(openingCash) !== parseFloat(yesterdayCloseCash)
                  ? "text-red-600"
                  : "text-green-600"
              }`}>
                <span>🔁 {t("Difference")}</span>
                <span>
                  {formatCurrency(
                    parseFloat(openingCash || 0) -
                      parseFloat(yesterdayCloseCash || 0)
                  )}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (() => {
        // Summary content (register is open)
        const expected = Number(expectedCash || 0);
const expense = Number(dailyCashExpense || 0);
const opening = Number(openingCash || 0);

// ✅ calculate entries directly from combinedEvents
const entryTotal = combinedEvents
  .filter(ev => ev.type === "entry")
  .reduce((sum, ev) => sum + parseFloat(ev.amount || 0), 0);

const netCash = opening + expected + entryTotal - expense;


        return (
          <>
            {/* Summary Card */}
            <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-xl mb-7">
              <div className="space-y-4 text-base font-semibold">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-green-700"><span className="bg-green-400 text-white rounded-full px-2 py-1">💼</span> {t('Opening')}</span>
                  <span className="tabular-nums text-green-800">
                    {formatCurrency(opening)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-yellow-700"><span className="bg-yellow-400 text-white rounded-full px-2 py-1">💰</span> {t('Cash Sales')}</span>
                  <span className="tabular-nums text-yellow-800">
                    {formatCurrency(expected)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-orange-700"><span className="bg-orange-400 text-white rounded-full px-2 py-1">📉</span> {t('Cash Expenses')}</span>
                  <span className="tabular-nums text-orange-800">
                    {formatCurrency(expense)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
  <span className="flex items-center gap-2 text-lime-700">
    <span className="bg-lime-400 text-white rounded-full px-2 py-1">➕</span> {t('Cash Entries')}
  </span>
  <span className="tabular-nums text-lime-800">
    {formatCurrency(entryTotal)}
  </span>
</div>

                <div className="h-[1px] w-full bg-gradient-to-r from-blue-200 to-fuchsia-200 rounded-full opacity-60 my-3" />
                <div className="flex justify-between items-center text-lg">
                  <span className="flex items-center gap-2 text-blue-900 font-bold">
                    <span className="bg-blue-600 text-white rounded-full px-2 py-1">🧮</span>
                    {t('Net Expected Cash')}
                  </span>
                  <span className="tabular-nums text-blue-900 font-extrabold text-2xl">
                    {formatCurrency(netCash)}
                  </span>
                </div>
              </div>
            </div>
            {/* Actual Cash Input */}
            <div className="mb-7">
              <label className="block text-base font-semibold text-gray-800 mb-2">
                🔢 {t('Actual Counted Cash')}
              </label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                className={`
                  w-full p-5 rounded-2xl border-2 text-lg shadow-lg outline-none transition
                  ${actualCash === ""
                    ? "border-gray-300"
                    : parseFloat(actualCash) === netCash
                    ? "border-green-500"
                    : "border-red-500"}
                `}
                placeholder={`${config?.symbol || ""}0.00`}
              />
              {actualCash && (
                parseFloat(actualCash) === netCash
                  ? <p className="text-green-600 font-semibold mt-2">{t('Cash matches perfectly.')}</p>
                  : (
                      <p className="text-red-600 font-semibold mt-2">
                        ❌ {t("Difference")}:{" "}
                        {formatCurrency(
                          Math.abs(parseFloat(actualCash || 0) - netCash)
                        )}
                      </p>
                    )
              )}
            </div>
           {registerState === "open" && (
  <div className="mb-7">
    {/* Toggle Entry Form */}
    <button
      type="button"
      onClick={() => setShowEntryForm(v => !v)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl font-semibold mb-3
        transition-all shadow
        ${showEntryForm ? 'bg-lime-200 text-lime-900' : 'bg-gray-100 text-gray-700 hover:bg-lime-100'}
      `}
    >
      <span>{showEntryForm ? "Hide Cash Entry" : "➕ Add Cash Entry"}</span>
      <span className="text-lg">{showEntryForm ? "▲" : "▼"}</span>
    </button>
    {/* Entry Form */}
    {showEntryForm && (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!entryAmount || isNaN(entryAmount) || Number(entryAmount) <= 0) {
            toast.error("Enter a valid amount");
            return;
          }
try {
  const data = await secureFetch("/reports/cash-register-log", {
    method: "POST",
    body: JSON.stringify({
      type: "entry",
      amount: Number(entryAmount),
      note: entryReason || undefined,
    }),
  });

  toast.success("Cash entry added!");
  setEntryAmount("");
  setEntryReason("");
  setShowEntryForm(false);
  setShowRegisterModal(false);
  setTimeout(() => setShowRegisterModal(true), 350);
} catch (err) {
  console.error("❌ Failed to add cash entry:", err);
  toast.error(err.message || "Failed to add cash entry");
}


          if (res.ok) {
            toast.success("Cash entry added!");
            setEntryAmount("");
            setEntryReason("");
            setShowEntryForm(false);
            // Refresh all cash data and event log
            setShowRegisterModal(false);
            setTimeout(() => setShowRegisterModal(true), 350);
          } else {
            const err = await res.json();
            toast.error(err.error || "Failed to add cash entry");
          }
        }}
        className="flex flex-col gap-2 bg-white/70 rounded-2xl p-4 shadow border border-lime-200"
      >
        <label className="font-semibold text-gray-800">
          Amount ({config?.symbol || ""}):
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={entryAmount}
          onChange={e => setEntryAmount(e.target.value)}
          className="p-3 rounded-xl border-2 border-lime-300 focus:border-lime-500 text-lg mb-1"
          placeholder={`${config?.symbol || ""}0.00`}
          required
        />
        <label className="font-semibold text-gray-800">Reason / Note:</label>
        <input
          type="text"
          value={entryReason}
          onChange={e => setEntryReason(e.target.value)}
          className="p-3 rounded-xl border-2 border-gray-300 focus:border-lime-500 text-base"
          placeholder="Optional note"
          maxLength={40}
        />
        <button
          type="submit"
          className="mt-3 bg-lime-500 hover:bg-lime-600 text-white font-bold py-2 rounded-xl transition"
        >
          Add Cash Entry
        </button>
      </form>
    )}
  </div>
)}


            
          </>
        );
      })()}
{/* --- Register Event Log Toggle --- */}
{todayRegisterEvents && todayRegisterEvents.length > 0 && (
  <div className="mt-5">
    <button
      type="button"
      onClick={() => setShowRegisterLog(v => !v)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl font-semibold
        transition-all shadow
        ${showRegisterLog ? 'bg-blue-200 text-blue-900' : 'bg-gray-100 text-gray-700 hover:bg-blue-100'}
      `}
    >
      <span>{showRegisterLog ? 'Hide Register Log' : 'Show Register Log'}</span>
      <span className="text-lg">{showRegisterLog ? "▲" : "▼"}</span>
    </button>
    {showRegisterLog && (
      <div className="bg-white/90 border border-blue-100 rounded-2xl p-4 mt-3 max-h-64 overflow-y-auto shadow">
        {/* Header Row */}
        <div className="flex text-xs font-bold text-gray-400 pb-2 px-1">
          <span className="w-8"></span>
          <span className="min-w-[80px]">Type</span>
          <span className="min-w-[85px]">Amount</span>
          <span className="flex-1">Reason / Note</span>
          <span className="w-14 text-right">Time</span>
        </div>
 <ul className="divide-y">
  {combinedEvents.map((event, idx) => (
    <li key={idx} className="flex items-center py-2 gap-2 text-sm">
      <span className="text-xl">
        {event.type === "open" && "🔓"}
        {event.type === "close" && "🔒"}
        {event.type === "expense" && "📉"}
        {event.type === "entry" && "➕"}
        {event.type === "sale" && "🧾"}
        {event.type === "supplier" && "🚚"}
        {event.type === "payroll" && "👤"}
        {event.type === "change" && "💵"}
        {!["open","close","expense","entry","sale","supplier","payroll","change"].includes(event.type) && "📝"}
      </span>
      <span className="font-bold min-w-[70px] capitalize">
        {event.type}
      </span>
      <span className="tabular-nums min-w-[85px] text-blue-900 font-semibold">
        {event.amount ? formatCurrency(parseFloat(event.amount)) : ""}
      </span>
      <span className={`
        flex-1
        ${event.type === "entry" ? "font-semibold text-lime-800" : ""}
        ${event.type === "expense" ? "font-semibold text-orange-800" : ""}
        ${!["entry", "expense"].includes(event.type) ? "text-gray-600 italic" : ""}
        max-w-[180px]"
      `}>
        {event.note || (["entry", "expense"].includes(event.type) ? "(No reason provided)" : "")}
      </span>
      <span className="ml-auto text-xs text-gray-400">
        {event.created_at && new Date(event.created_at).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit"})}
      </span>
    </li>
  ))}
</ul>

      </div>
    )}
  </div>
)}


      {/* Action Buttons */}
      <div className="flex flex-col gap-4 pt-4 border-t mt-7">
        {showChangeForm && (
          <form
            onSubmit={handleChangeCashSubmit}
            className="flex flex-wrap items-center gap-3 bg-slate-50 rounded-xl p-3 shadow-inner"
          >
            <label className="text-sm font-semibold text-slate-700">
              {t("Change Amount")}
            </label>
            <input
              type="number"
              value={changeAmount}
              onChange={(e) => setChangeAmount(e.target.value)}
              className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-3 py-2"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold shadow hover:bg-emerald-600 transition"
            >
              {t("Log Change")}
            </button>
          </form>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowChangeForm((prev) => !prev)}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 transition"
          >
            {showChangeForm ? "⬆️" : "⬇️"} 💵 {t("Change Cash")}
          </button>
        <button
        onClick={async () => {
  const type =
    registerState === "unopened" || registerState === "closed"
      ? "open"
      : "close";

  const amount = parseFloat(
    registerState === "unopened" || registerState === "closed"
      ? openingCash
      : actualCash
  );

  if (!amount) return toast.error(t("Missing amount"));

  try {
    const result = await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({ type, amount }),
    });

    toast.success(
      type === "open"
        ? t("Register opened successfully.")
        : t("Register closed successfully.")
    );

    refreshRegisterState();
    setShowRegisterModal(false);
  } catch (err) {
    console.error(`❌ Failed to ${type} register:`, err);
    toast.error(err.message || `${t("Register")} ${type} failed`);
  }
}}

        >
          {(registerState === "unopened" || registerState === "closed")
            ? t('Open Register')
            : t('Close Register')}
        </button>
        </div>
      </div>

      {/* Optional: subtle fade-in animation */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: none; } }
        .animate-fade-in { animation: fade-in 0.36s cubic-bezier(.6,-0.28,.735,.045) both; }
      `}</style>
    </div>
  </div>
)}











  </div>
);



}
function HeaderTableNav({ position, children }) {
  return (
    <div className="w-full flex items-center justify-center">
      {children}
    </div>
  );
}
function TableOverviewHeaderTabs({ t, tabs, activeTab, onChangeTab }) {
  return (
    <div className="w-full flex items-center justify-center">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "border-indigo-300 bg-indigo-600 text-white shadow-sm"
                : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span className="leading-none">{t(tab.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
