import React, { useState, useEffect, useRef } from "react";
import { useStock } from "../context/StockContext";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toast } from "react-toastify"; // make sure you imported toast
import 'react-toastify/dist/ReactToastify.css';
import io from "socket.io-client";
import SupplierCartModal from "../components/SupplierCartModal";
import SupplierScheduledCart from "../components/SupplierScheduledCart";
import { useTranslation } from "react-i18next";
import {
  SUPPLIERS_API,
  SUPPLIER_CARTS_API,
  SUPPLIER_CART_ITEMS_API,
  TRANSACTIONS_API,
} from "../utils/api";
import socket from "../utils/socket";
export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
  ingredient: "",
  quantity: "",
  unit: "kg",
  total_cost: "",
  paymentStatus: "Due",
  paymentMethod: "Due", // 👈 Set "Due" as default
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
   const { t, i18n } = useTranslation();
  const [cartItems, setCartItems] = useState([]); // cart items
  const [showCartModal, setShowCartModal] = useState(false); // cart modal visibility
  const [cartId, setCartId] = useState(null);
  const [sending, setSending] = useState(false); // 🔥 control button loading state
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoOrder, setAutoOrder] = useState(false);
const [repeatDays, setRepeatDays] = useState([]);
const [repeatType, setRepeatType] = useState("none");
const [search, setSearch] = useState("");
const [showUploadOptions, setShowUploadOptions] = useState(false);
const fileInputRef = useRef(null);
const cameraInputRef = useRef(null);
const [previewImage, setPreviewImage] = useState(null);

  const socketRef = useRef();
  const { fetchStock } = useStock();
  const [receiptFile, setReceiptFile] = useState(null);


useEffect(() => {
  console.log("✅ fetchStock from context is loaded in Supplier.js");
  fetchStock(); // ← actually call it here
}, [fetchStock]); // ✅ include it in dependency array


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

const openSupplierCart = async (supplierId) => {
  try {
    setSelectedSupplier(suppliers.find((s) => s.id === supplierId));

    // Try to fetch unconfirmed cart first
    let res = await fetch(`${SUPPLIER_CARTS_API}/items?supplier_id=${supplierId}`);
    let data = await res.json();

    // If not found, try scheduled one
    if (!res.ok || !data?.items?.length) {
      res = await fetch(`${SUPPLIER_CARTS_API}/scheduled?supplier_id=${supplierId}`);
      data = await res.json();

      if (!res.ok || !data?.items?.length) {
        alert("⚠️ No scheduled or open cart found for this supplier.");
        return;
      }
    }

    // ✅ Set current cart state
    setCartItems(data.items);
    setCartId(data.cart_id || null);

    // ⚠️ Only override schedule fields if present
    if (data.scheduled_at !== null && data.scheduled_at !== undefined) {
      setScheduledAt(data.scheduled_at);
    }

    if (data.repeat_type !== undefined) {
      setRepeatType(data.repeat_type);
    }

    setRepeatDays(Array.isArray(data.repeat_days) ? data.repeat_days : []);


    if (data.auto_confirm !== undefined) {
      setAutoOrder(data.auto_confirm);
    }

    setShowCartModal(true);

    // ✅ Fetch history for skipped info
    const historyRes = await fetch(`${SUPPLIER_CARTS_API}/history?supplier_id=${supplierId}`);
    const historyData = await historyRes.json();
    if (historyRes.ok) {
      setCartHistory(historyData.history || []);
    } else {
      console.warn("⚠️ Could not load cart history.");
      setCartHistory([]);
    }

  } catch (err) {
    console.error("❌ Error opening supplier cart:", err);
    alert("Something went wrong while loading the cart.");
  }
};






  const fetchCartItems = async (cartId) => {
    try {
      const res = await fetch(`${SUPPLIER_CART_ITEMS_API}?cart_id=${cartId}`);
      const data = await res.json();
      if (res.ok) {
        setCartItems(data.items);
      } else {
        setCartItems([]);
      }
    } catch (error) {
      console.error("Error fetching cart items:", error);
      setCartItems([]);
    }
  };

  const confirmSupplierCart = async (cartId) => {
  if (!scheduledAt) {
    toast.error("❗ Please select a schedule date and time.");
    return;
  }

  try {
    const payload = { scheduled_at: scheduledAt };

    if (repeatType && repeatType !== "none") payload.repeat_type = repeatType;
    if (repeatDays?.length > 0) payload.repeat_days = repeatDays;
    if (typeof autoOrder === "boolean") payload.auto_confirm = autoOrder;

    const res = await fetch(`/api/supplier-carts/${cartId}/confirm`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      toast.success("✅ Cart confirmed with schedule!");
    } else {
      toast.error(data.error || "Failed to confirm cart.");
    }
  } catch (err) {
    console.error("❌ Error confirming cart:", err);
    toast.error("❌ Network error confirming cart.");
  }
};




  const sendSupplierCart = async (cartId) => {
  if (!scheduledAt) {
    toast.error("❌ Please select a schedule date and time first!");
    return;
  }

  try {
    setSending(true);

    // ✅ Auto-confirm only if enabled
    if (autoOrder) {
      const payload = { scheduled_at: scheduledAt };

      if (repeatType && repeatType !== "none") payload.repeat_type = repeatType;
      if (repeatDays?.length > 0) payload.repeat_days = repeatDays;
      if (typeof autoOrder === "boolean") payload.auto_confirm = autoOrder;

      const confirmRes = await fetch(`${SUPPLIER_CARTS_API}/${cartId}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        toast.error(confirmData.error || "❌ Failed to confirm cart before sending.");
        return;
      }
    }

    // ✅ Send the cart
    const res = await fetch(`${SUPPLIER_CARTS_API}/${cartId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });

    const data = await res.json();

    if (res.ok) {
      toast.success("✅ Order sent successfully!");
      setShowCartModal(false);
      await fetchStock(); // 🔄 Refresh stock
    } else {
      toast.error(data.error || "❌ Failed to send order.");
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
    fetchSuppliers();
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
      const response = await fetch(SUPPLIERS_API);
      if (!response.ok) throw new Error("Failed to fetch suppliers");
      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    }
  };

  const fetchTransactions = async (supplierId) => {
    try {
      const response = await fetch(`${SUPPLIERS_API}/${supplierId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  const fetchSupplierDetails = async (supplierId, retries = 3) => {
    try {
      if (!supplierId) return;
      const response = await fetch(`${SUPPLIERS_API}/${supplierId}`);
      if (!response.ok) {
        if (retries > 0) {
          setTimeout(() => fetchSupplierDetails(supplierId, retries - 1), 500);
          return;
        }
        throw new Error("Supplier still not found after retry.");
      }
      const data = await response.json();
      setSelectedSupplier(data);
    } catch (error) {
      console.error("Error fetching supplier details:", error);
      alert("Supplier not found. It may have been deleted.");
      setSelectedSupplier(null);
    }
  };

  const handleSelectSupplier = (supplierId) => {
    const supplier = suppliers.find((sup) => sup.id === parseInt(supplierId));
    if (!supplier) return;
    setSelectedSupplier(supplier);
    fetchTransactions(supplier.id);
  };

  // Handle input change for supplier transaction form
  const handleInputChange = (e) => {
    setNewTransaction({ ...newTransaction, [e.target.name]: e.target.value });
  };

const handleAddTransaction = async (e) => {
  e.preventDefault();

  if (!selectedSupplier) {
    alert("Please select a supplier before adding a transaction.");
    return;
  }

  const { ingredient, quantity, unit, total_cost, paymentStatus, paymentMethod } = newTransaction;
  if (!ingredient || !quantity || !total_cost) {
    alert("Please enter all required fields.");
    return;
  }

  let pricePerUnit = 0;
  if (unit === "kg" || unit === "lt") {
    pricePerUnit = total_cost / quantity;
  } else if (unit === "g" || unit === "ml") {
    pricePerUnit = (total_cost / quantity) * 1000;
  } else if (unit === "piece") {
    pricePerUnit = total_cost / quantity;
  }

  // ✅ Use FormData to include file
  const formData = new FormData();
  formData.append("supplier_id", selectedSupplier.id);
  formData.append("ingredient", ingredient);
  formData.append("quantity", parseFloat(quantity));
  formData.append("unit", unit);
  formData.append("total_cost", parseFloat(total_cost));
  formData.append("amount_paid", 0);
  formData.append("payment_method", paymentMethod || "Cash");
  formData.append("price_per_unit", parseFloat(pricePerUnit.toFixed(2)));

  if (receiptFile) {
    formData.append("receipt", receiptFile);
  }

  try {
    const response = await fetch(TRANSACTIONS_API, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      alert("Order added successfully!");
      await fetchTransactions(selectedSupplier.id);
      await fetchSupplierDetails(selectedSupplier.id);
      await fetchSuppliers();

      // ✅ Reset form
      setNewTransaction({
        ingredient: "",
        quantity: "",
        unit: "kg",
        total_cost: "",
        paymentStatus: "Due",
        paymentMethod: "Cash",
      });
      setReceiptFile(null); // reset uploaded file
    } else {
      alert("Error adding transaction.");
    }
  } catch (error) {
    console.error("Error adding transaction:", error);
    alert("Network error. Please try again.");
  }
};


  const handlePayment = async () => {
  if (!selectedSupplier || !paymentAmount || !paymentMethod) {
    alert("Please enter a payment amount and select a payment method.");
    return;
  }

  const amountToPay = parseFloat(paymentAmount);
  const totalDue = parseFloat(selectedSupplier.total_due);

  if (isNaN(amountToPay) || amountToPay <= 0) {
    alert("Please enter a valid payment amount.");
    return;
  }

  // ✅ Prevent overpayment
  if (amountToPay > totalDue) {
    alert(`You cannot pay more than the total due (${totalDue.toFixed(2)}₺).`);
    return;
  }

  try {
    const response = await fetch(`${SUPPLIERS_API}/${selectedSupplier.id}/pay`, {

      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment: amountToPay,
        payment_method: paymentMethod,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(`Error: ${data.error || "Failed to update payment"}`);
      return;
    }

    alert("Payment updated successfully!");

    // ✅ Fetch updated supplier info
    const updatedSupplierResponse = await fetch(`${SUPPLIERS_API}/${selectedSupplier.id}`);
    const updatedSupplier = await updatedSupplierResponse.json();

    setSelectedSupplier((prev) => ({
      ...prev,
      total_due: updatedSupplier.total_due,
    }));

    await fetchTransactions(selectedSupplier.id);
    await fetchSuppliers();

    // ✅ Reset payment form
    setPaymentAmount("");
    setPaymentMethod("Cash");

    // ✅ Auto-close if fully paid!
    if (updatedSupplier.total_due <= 0) {
      setPaymentModalOpen(false);
    }

  } catch (error) {
    console.error("Network or server error:", error);
    alert("Network error. Please try again.");
  }
};



  const handleAddSupplier = async () => {
    try {
      const response = await fetch(SUPPLIERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSupplier),
      });
      if (!response.ok) throw new Error("Failed to add supplier");
      const createdSupplier = await response.json();
      if (!createdSupplier.id) throw new Error("Supplier ID is missing!");
      await fetchSupplierDetails(createdSupplier.id);
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
      console.error("Error adding supplier:", error);
      alert("Something went wrong. Please refresh and try again.");
    }
  };

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier || !selectedSupplier.id) {
      alert("Missing Supplier ID. Please refresh and try again.");
      return;
    }
    try {
      const response = await fetch(`${SUPPLIERS_API}/${selectedSupplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedSupplier),
      });
      if (!response.ok) throw new Error("Failed to update supplier.");
      alert("Supplier updated successfully!");
      await fetchSuppliers();
      setEditModalOpen(false);
    } catch (error) {
      console.error("Error updating supplier:", error);
      alert("Failed to update supplier. Please try again.");
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
    saveAs(blob, `transactions_supplier_${selectedSupplier.id}.xlsx`);
  };

  const handleClearTransactions = async () => {
    if (!selectedSupplier) return;
    const confirm = window.confirm("Are you sure you want to delete ALL transactions for this supplier?");
    if (!confirm) return;
    try {
      const response = await fetch(`${SUPPLIERS_API}/${selectedSupplier.id}/transactions`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to clear transactions.");
      alert("All transactions cleared.");
      fetchTransactions(selectedSupplier.id);
      fetchSupplierDetails(selectedSupplier.id);
    } catch (err) {
      console.error(err);
      alert("Something went wrong while clearing transactions.");
    }
  };

  const handleDeleteSupplier = async () => {
  if (!selectedSupplier?.id) return;

  try {
    const res = await fetch(`${SUPPLIERS_API}/${selectedSupplier.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success("🚮 Supplier deleted successfully!");
      setEditModalOpen(false);
      fetchSuppliers(); // Refresh supplier list if you have this
    } else {
      toast.error("❌ Failed to delete supplier.");
    }
  } catch (err) {
    console.error("Error deleting supplier:", err);
    toast.error("❌ Server error while deleting supplier.");
  }
};


  return (
  <div className="min-h-screen px-6 py-8 bg-gradient-to-br from-white-50 to-gray-100 dark:from-black dark:to-gray-900 space-y-8">
    {/* Page Title */}
        {console.log("transactions", transactions)}
    <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-700 tracking-tight drop-shadow-lg">
      📦 {t("Supplier Management")}
    </h1>
{previewImage && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur"
    onClick={() => setPreviewImage(null)}
    style={{ cursor: "zoom-out" }}
  >
    <img
      src={previewImage.startsWith("http") ? previewImage : BACKEND_URL + previewImage}
      alt="Receipt Fullscreen"
      className="max-h-[90vh] max-w-[95vw] rounded-3xl shadow-2xl border-8 border-white"
      onClick={e => e.stopPropagation()}
    />
  </div>
)}


    {/* Tabs */}
    <div className="flex gap-4 mb-8">
      <button
        onClick={() => setActiveTab("suppliers")}
        className={`px-6 py-3 rounded-2xl font-bold text-lg shadow transition-all duration-300
          ${activeTab === "suppliers"
            ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white scale-105"
            : "bg-white/70 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border border-gray-200 hover:bg-indigo-50"
          }`}
      >
        📦 {t("Suppliers")}
      </button>
      <button
        onClick={() => setActiveTab("cart")}
        className={`px-6 py-3 rounded-2xl font-bold text-lg shadow transition-all duration-300
          ${activeTab === "cart"
            ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white scale-105"
            : "bg-white/70 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border border-gray-200 hover:bg-purple-50"
          }`}
      >
        🛒 {t("Supplier Cart")}
      </button>
    </div>

    {/* --- SUPPLIERS TAB --- */}
    {activeTab === "suppliers" && (
      <div className="space-y-8">
        {/* Supplier select & Add button */}
<div className="flex flex-wrap items-center gap-4">
  <select
    className="p-3 rounded-xl border w-72 shadow-md text-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-300"
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
  <button
    className="bg-gradient-to-r from-green-400 to-green-600 text-white px-5 py-2.5 rounded-2xl shadow-lg font-bold hover:scale-105 transition-all"
    onClick={() => setSupplierModalOpen(true)}
  >
    ➕ {t("Add Supplier")}
  </button>

  {/* TOTAL DUE CARD */}
  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl shadow-lg bg-gradient-to-r from-red-100 via-white to-orange-100 dark:from-gray-900 dark:to-gray-800 border border-orange-300 dark:border-orange-900 ml-1">
    <span className="text-xl font-bold text-orange-600">🧾 {t("All Dues")}:</span>
    <span className="text-2xl font-extrabold text-red-600 drop-shadow">{suppliers.reduce((sum, s) => sum + (parseFloat(s.total_due) || 0), 0).toFixed(2)}₺</span>
  </div>
</div>


        {/* Add/Edit Supplier Modals */}
        {isSupplierModalOpen && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 relative">
      {/* Blob for style */}
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-indigo-400 opacity-20 rounded-full blur-3xl pointer-events-none animate-blob z-0" />
      {/* Header */}
      <h2 className="text-2xl font-extrabold text-indigo-700 mb-2 tracking-tight z-10 relative">
        ➕ {t("Add New Supplier")}
      </h2>
      <p className="mb-4 text-gray-500 text-sm z-10 relative">{t("Enter supplier details below.")}</p>
      {/* Form */}
      <div className="space-y-3 z-10 relative">
        <input
          type="text"
          name="name"
          placeholder={t("Supplier Name")}
          value={newSupplier.name}
          onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm focus:ring-2 focus:ring-indigo-200 text-lg"
          required
        />
        <input
          type="text"
          name="phone"
          placeholder={t("Phone Number")}
          value={newSupplier.phone}
          onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
          required
        />
        <input
          type="text"
          name="tax_number"
          placeholder={t("Tax Number")}
          value={newSupplier.tax_number}
          onChange={e => setNewSupplier({ ...newSupplier, tax_number: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          name="id_number"
          placeholder={t("ID Number")}
          value={newSupplier.id_number}
          onChange={e => setNewSupplier({ ...newSupplier, id_number: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="email"
          name="email"
          placeholder={t("Email")}
          value={newSupplier.email}
          onChange={e => setNewSupplier({ ...newSupplier, email: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          name="address"
          placeholder={t("Address")}
          value={newSupplier.address}
          onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <textarea
          name="notes"
          placeholder={t("Notes")}
          value={newSupplier.notes}
          onChange={e => setNewSupplier({ ...newSupplier, notes: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
      </div>
      {/* Actions */}
      <div className="flex justify-end gap-3 mt-8 z-10 relative">
        <button
          className="px-5 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 dark:text-white hover:brightness-110 transition shadow"
          onClick={() => setSupplierModalOpen(false)}
        >
          ❌ {t("Cancel")}
        </button>
        <button
          className="px-6 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-green-500 to-teal-500 text-white hover:scale-105 transition shadow-lg"
          onClick={handleAddSupplier}
        >
          ✅ {t("Add Supplier")}
        </button>
      </div>
    </div>
  </div>
)}


        {editModalOpen && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 relative">
      <div className="absolute -top-16 -left-16 w-40 h-40 bg-pink-400 opacity-20 rounded-full blur-3xl pointer-events-none animate-blob z-0" />
      <h2 className="text-2xl font-extrabold text-pink-600 mb-2 tracking-tight z-10 relative">
        ✏️ {t("Edit Supplier")}
      </h2>
      <div className="space-y-3 z-10 relative">
        <input
          type="text"
          placeholder={t("Name")}
          value={selectedSupplier.name}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, name: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          placeholder={t("Phone")}
          value={selectedSupplier.phone || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, phone: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="email"
          placeholder={t("Email")}
          value={selectedSupplier.email || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, email: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          placeholder={t("Address")}
          value={selectedSupplier.address || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, address: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          placeholder={t("Tax Number")}
          value={selectedSupplier.tax_number || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, tax_number: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <input
          type="text"
          placeholder={t("ID Number")}
          value={selectedSupplier.id_number || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, id_number: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
        <textarea
          placeholder={t("Notes")}
          value={selectedSupplier.notes || ""}
          onChange={e => setSelectedSupplier({ ...selectedSupplier, notes: e.target.value })}
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
        />
      </div>
      {/* Actions */}
      <div className="flex justify-end gap-3 mt-8 z-10 relative">
        <button
          className="px-5 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 dark:text-white hover:brightness-110 transition shadow"
          onClick={() => setEditModalOpen(false)}
        >
          ❌ {t("Cancel")}
        </button>
        <button
          className="px-6 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:scale-105 transition shadow-lg"
          onClick={handleUpdateSupplier}
        >
          ✅ {t("Save Changes")}
        </button>
      </div>
    </div>
  </div>
)}


        {/* Supplier Profile */}
        {selectedSupplier && (
          <div className="rounded-3xl shadow-xl bg-gradient-to-br from-indigo-100 to-white/90 dark:from-gray-900 dark:to-gray-800 p-7 border border-white/40 dark:border-gray-800">
            <h2 className="text-xl font-bold text-purple-700 mb-4">🏢 {t("Supplier Profile")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div><strong>{t("Name")}:</strong> {selectedSupplier.name}</div>
              <div>
                <strong>{t("Total Due")}:</strong>
                <span className={selectedSupplier.total_due > 0 ? "text-red-500 font-bold" : "text-green-600 font-bold"}>
                  {Number(selectedSupplier.total_due).toFixed(2) + "₺"}
                </span>
              </div>
              <div><strong>{t("Phone")}:</strong> {selectedSupplier.phone || "N/A"}</div>
              <div><strong>{t("Email")}:</strong> {selectedSupplier.email || "N/A"}</div>
              <div className="md:col-span-2"><strong>{t("Address")}:</strong> {selectedSupplier.address || "N/A"}</div>
            </div>
            {/* Actions */}
            <div className="flex flex-wrap gap-3 mt-3">
              {selectedSupplier.phone && (
                <a href={`tel:${selectedSupplier.phone}`}>
                  <button className="bg-gradient-to-r from-green-400 to-teal-500 text-white px-4 py-2 rounded-2xl shadow hover:scale-105 transition flex items-center">
                    📞 {t("Call Supplier")}
                  </button>
                </a>
              )}
              <button
                className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-2xl shadow hover:scale-105 transition flex items-center"
                onClick={() => handleEditSupplier(selectedSupplier)}
              >
                ✏️ {t("Edit Supplier")}
              </button>
              <button
                className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-2xl shadow hover:scale-105 transition flex items-center"
                onClick={async () => {
                  const confirmDelete = window.confirm(t("Are you sure you want to delete this supplier?"));
                  if (!confirmDelete) return;
                  // ...delete logic...
                }}
              >
                🗑️ {t("Delete Supplier")}
              </button>
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
        <div className={`text-3xl font-extrabold mt-1
          ${selectedSupplier?.total_due > 0 ? "text-red-600" : "text-green-500"}`}>
          {selectedSupplier?.total_due ? Number(selectedSupplier.total_due).toFixed(2) + "₺" : "0.00₺"}
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
      {paymentAmount && (
        <div className="text-center mb-4 z-10 relative">
          {selectedSupplier?.total_due - parseFloat(paymentAmount) > 0 ? (
            <>
              <span className="text-gray-600 dark:text-gray-300 text-sm font-semibold">{t("Remaining After Payment")}:</span>
              <div className="text-lg font-bold text-red-500">
                {Math.max(0, (selectedSupplier?.total_due - parseFloat(paymentAmount))).toFixed(2)}₺
              </div>
            </>
          ) : (
            <div className="text-green-600 font-extrabold text-lg">✅ {t("Fully Paid!")}</div>
          )}
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



        {/* Add Transaction Form */}
<form
  onSubmit={handleAddTransaction}
  className="bg-white/80 dark:bg-gray-900/70 p-8 rounded-3xl shadow-2xl my-6 border border-gray-100 dark:border-gray-800 max-w-8xl mx-auto"
>
  <h3 className="text-xl font-bold text-indigo-700 mb-6 tracking-tight">
    ➕ {t("Add Supplier Order")}
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-2">
    <input
      type="text"
      name="ingredient"
      placeholder={t("Ingredient Name")}
      className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg focus:ring-2 focus:ring-indigo-300"
      value={newTransaction.ingredient}
      onChange={handleInputChange}
      required
      autoFocus
    />
    <input
      type="number"
      name="quantity"
      min="0"
      step="any"
      placeholder={t("Quantity")}
      className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg focus:ring-2 focus:ring-indigo-300"
      value={newTransaction.quantity}
      onChange={handleInputChange}
      required
    />
    <select
      name="unit"
      className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
      value={newTransaction.unit}
      onChange={handleInputChange}
      required
    >
      <option value="kg">{t("kg")}</option>
      <option value="g">{t("g")}</option>
      <option value="lt">{t("lt")}</option>
      <option value="ml">{t("ml")}</option>
      <option value="piece">{t("piece")}</option>
    </select>
    <input
      type="number"
      name="total_cost"
      min="0"
      step="any"
      placeholder={t("Total Cost (₺)")}
      className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
      value={newTransaction.total_cost}
      onChange={handleInputChange}
      required
    />
    <select
  name="paymentMethod"
  className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg"
  value={newTransaction.paymentMethod}
  onChange={handleInputChange}
  required
>
  <option value="Due">🕓 {t("Due")}</option>
  <option value="Cash">💵 {t("Cash")}</option>
  <option value="Credit Card">💳 {t("Credit Card")}</option>
  <option value="IBAN">🏦 {t("IBAN")}</option>
</select>

  </div>

  <div className="flex flex-col md:flex-row md:items-center gap-4 mt-2">
    <div className="flex-1 text-lg font-bold text-indigo-700">
      {t("Unit Price")}: <span className="font-extrabold">{computedUnitPrice()}₺</span>
    </div>
    <div className="flex gap-3">
      <button
        type="submit"
        className="bg-gradient-to-r from-green-400 to-green-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg hover:scale-105 transition"
      >
        ➕ {t("Add Order")}
      </button>
      <button
        type="button"
        className={`
          px-5 py-2.5 rounded-2xl font-bold shadow transition
          ${!selectedSupplier || selectedSupplier.total_due <= 0
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:scale-105"
          }`}
        onClick={() => {
          if (!selectedSupplier || selectedSupplier.total_due <= 0) {
            alert(t("No payment due for this supplier."));
            return;
          }
          setPaymentModalOpen(true);
        }}
      >
        💳 {t("Make Payment")}
      </button>
    </div>
    <button
  type="button"
  className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-2xl font-bold shadow hover:scale-105 transition cursor-pointer"
  onClick={() => setShowUploadOptions(true)}
>
  📸 {t("Upload Receipt")}
</button>

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

  </div>
</form>


        {/* History Download/Clear */}
        <div className="flex gap-3 mt-3">
          <button className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white px-4 py-2 rounded-2xl font-bold shadow hover:scale-105 transition" onClick={handleDownloadHistory}>
            📥 {t("Download Excel")}
          </button>
          <button className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-2xl font-bold shadow hover:scale-105 transition" onClick={handleClearTransactions}>
            🧹 {t("Clear History")}
          </button>
        </div>

        {/* Transactions Table */}
        {transactions.length > 0 && (
          <div className="mt-8 rounded-3xl shadow-2xl bg-white/90 dark:bg-gray-900/90 p-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-indigo-700 mb-4">📜 {t("Transaction History")}</h2>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm text-gray-700 dark:text-gray-200">
                <thead className="bg-gradient-to-r from-indigo-200 to-purple-100 dark:from-gray-800 dark:to-gray-700">
                  <tr>
                    <th className="p-3">{t("Date")}</th>
                    <th className="p-3">{t("Ingredient")}</th>
                    <th className="p-3">{t("Quantity")}</th>
                    <th className="p-3">{t("Unit")}</th>
                    <th className="p-3">{t("Total Cost (₺)")}</th>
                    <th className="p-3">{t("Amount Paid (₺)")}</th>
                    <th className="p-3">{t("Price Per Unit (₺)")}</th>
                    <th className="p-3">{t("Total Due (₺)")}</th>
                    <th className="p-3">{t("Payment Method")}</th>
                    <th className="p-3">{t("Receipt")}</th>

                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn, index) => {
                    // ...row logic unchanged...
                    return (
                      <tr key={txn.id || `txn-${index}`} className="hover:bg-indigo-50 dark:hover:bg-gray-800 transition">
                        <td className="p-2">{txn.delivery_date ? new Date(txn.delivery_date).toLocaleDateString() : "N/A"}</td>
                        <td className="p-2">{txn.ingredient === "Payment" ? "N/A" : txn.ingredient}</td>
                        <td className="p-2">{txn.quantity || "N/A"}</td>
                        <td className="p-2">{txn.unit || "N/A"}</td>
                        <td className="p-2">{txn.total_cost ? Number(txn.total_cost).toFixed(2) + "₺" : "0.00₺"}</td>
                        <td className="p-2">{txn.amount_paid ? Number(txn.amount_paid).toFixed(2) + "₺" : "0.00₺"}</td>
                        <td className="p-2">{txn.price_per_unit ? Number(txn.price_per_unit).toFixed(2) + "₺" : "N/A"}</td>
                        <td className={`p-2 ${txn.due_after > 0 ? "text-red-500 font-bold" : "text-green-600 font-bold"}`}>
                          {txn.due_after ? Number(txn.due_after).toFixed(2) + "₺" : "N/A"}
                        </td>
                        <td className="p-2">
  {txn.payment_method === "Cash"
    ? "💵 " + t("Cash")
    : txn.payment_method === "Credit Card"
    ? "💳 " + t("Credit Card")
    : txn.payment_method === "IBAN"
    ? "🏦 " + t("IBAN")
    : txn.payment_method === "Due"
    ? "🕓 " + t("Due")
    : "N/A"}
</td>
<td className="p-2">
  {txn.receipt_url ? (
    <div className="flex flex-col items-start gap-1">
      <button
        className="text-blue-600 underline hover:text-blue-800"
        onClick={() => setPreviewImage(txn.receipt_url)}
        type="button"
      >
        📄 View
      </button>
      <a
        href={txn.receipt_url}
        download
        className="text-indigo-500 underline text-sm"
      >
        ⬇️ Download
      </a>

    </div>
  ) : (
    <span className="text-gray-400">—</span>
  )}
</td>




                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
      <div className="bg-white/70 dark:bg-gray-900/70 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800">
        <h2 className="text-2xl font-bold text-purple-600 mb-6">
          🛒 {t("Supplier Carts")}
        </h2>
        {suppliers.length > 0 ? (
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-stretch">
            {suppliers.map((supplier) => (
              <SupplierScheduledCart
                key={supplier.id}
                supplier={supplier}
                openSupplierCart={openSupplierCart}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center">{t("No Suppliers")}</p>
        )}
      </div>
    )}

    {/* --- Supplier Cart Modal --- */}
    {showCartModal && (
      <SupplierCartModal
        show={showCartModal}
        cartItems={cartItems}
        onClose={() => setShowCartModal(false)}
        onChangeQty={handleCartQuantityChange}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        sending={sending}
        onConfirm={() => confirmSupplierCart(cartId, scheduledAt)}
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
);


}
