import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { MapPin, User, Plus, Pencil, Trash2, Gift } from "lucide-react";
const API_URL = import.meta.env.VITE_API_URL || "";

const paymentMethods = ["Cash", "Credit Card", "Multinet", "Sodexo"];

function PhoneOrderModal({ open, onClose, onCreateOrder }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", birthday: "", email: "" });
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", birthday: "", email: "" });

  // Address management
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [addrForm, setAddrForm] = useState({ label: "", address: "" });
  const [editAddrId, setEditAddrId] = useState(null);

  // ---- Customer search ----
  const searchCustomers = async (val) => {
    setSearch(val);
    if (val.length < 2) return setMatches([]);
    setLoading(true);
    const res = await fetch(`${API_URL}/api/customers?search=${encodeURIComponent(val)}`);
    const data = await res.json();
    setMatches(data);
    setLoading(false);
  };

  // ---- Address CRUD ----
  const fetchAddresses = async (customerId) => {
    if (!customerId) return setAddresses([]);
    const res = await fetch(`${API_URL}/api/customers/${customerId}/addresses`);
    const data = await res.json();
    setAddresses(data || []);
    // Auto-select default if exists
    const def = data.find(a => a.is_default) || data[0];
    setSelectedAddressId(def?.id || null);
  };
  const handleAddAddress = async () => {
    if (!addrForm.address) return alert("Address required!");
    const res = await fetch(`${API_URL}/api/customers/${selected.id}/addresses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addrForm)
    });
    if (res.ok) {
      setAddrForm({ label: "", address: "" });
      setEditAddrId(null);
      await fetchAddresses(selected.id);
    }
  };
  const handleEditAddress = async (id) => {
    if (!addrForm.address) return;
    const res = await fetch(`${API_URL}/customer-addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addrForm)
    });
    if (res.ok) {
      setEditAddrId(null);
      setAddrForm({ label: "", address: "" });
      await fetchAddresses(selected.id);
    }
  };
  const handleDeleteAddress = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    const res = await fetch(`${API_URL}/customer-addresses/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchAddresses(selected.id);
    }
  };

  // ---- Add New Customer ----
  const handleAddCustomer = async () => {
    if (!form.name || !form.phone) {
      alert("Name and phone required!");
      return;
    }
    try {
      // Save customer
     const res = await fetch(`${API_URL}/api/customers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: form.name, phone: form.phone, birthday: form.birthday || null, email: form.email || null })
});

      if (!res.ok) {
        const error = await res.json();
        alert("Error saving customer: " + (error.error || "Unknown error"));
        return;
      }
      const customer = await res.json();

      // If address field is filled, save as first address
      if (form.address && customer?.id) {
        await fetch(`${API_URL}/customers/${customer.id}/addresses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: "Home",
            address: form.address,
            is_default: true
          })
        });
      }

      setSelected(customer);
      setShowNew(false);
      setForm({ name: "", phone: "", address: "", birthday: "" });
      setMatches(prev => [customer, ...prev.filter(c => c.id !== customer.id)]);
      await fetchAddresses(customer.id);
    } catch (err) {
      alert("Network error: " + err.message);
    }
  };

  // ---- Edit Customer ----
  const handleEditCustomer = async (id) => {
const res = await fetch(`${API_URL}/customers/${id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(editForm)
});
    if (res.ok) {
      setMatches(prev =>
        prev.map(m => m.id === id ? { ...m, ...editForm } : m)
      );
      setEditId(null);
    } else {
      alert("Failed to update!");
    }
  };

  // ---- Select Customer & Load Addresses ----
  const handleCustomerClick = async (c) => {
    setSelected(c);
    setShowNew(false);
    setEditId(null);
    await fetchAddresses(c.id);
  };

  // ---- Start Order ----
  const handleStartOrder = async () => {
    const customer = selected;
    const addrObj = addresses.find(a => a.id === selectedAddressId);
    if (!customer || !addrObj) return alert("Select customer and address!");

    try {
      const isOpen = await checkRegisterOpen();
      if (!isOpen) {
        alert("❌ Register is closed. Please open the register before placing a phone order.");
        return;
      }

      const body = {
        order_type: "phone",
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: addrObj.address,
        payment_method: paymentMethod,
        total: 0,
      };

      const res2 = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res2.ok) {
        const err = await res2.json();
        alert(err.error || "Failed to create order");
        return;
      }

      const order = await res2.json();

      if (order && order.id) {
        navigate(`/transaction/phone/${order.id}`, { state: { order } });
        if (onCreateOrder) onCreateOrder(order);
        if (onClose) onClose();
      }

    } catch (err) {
      alert("Failed to start order: " + err.message);
    }
  };

  // ---- Modal Closed: reset ----
  useEffect(() => {
    if (!open) {
      setSearch("");
      setMatches([]);
      setSelected(null);
      setShowNew(false);
      setForm({ name: "", phone: "", address: "", birthday: "" });
      setAddresses([]);
      setSelectedAddressId(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-200/40 via-fuchsia-200/40 to-indigo-100/60 backdrop-blur-[2px]">
      <div className="relative bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-w-lg w-full p-0">
        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-6 pb-3 rounded-t-3xl bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-400 shadow">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">{t("Phone Order")}</h2>
          <button className="text-white text-2xl hover:scale-110 transition" onClick={onClose}>✖️</button>
        </div>
        {/* Content */}
        <div className="px-6 pt-3 pb-6">
          {/* 1. Search/Select Customer */}
          {!showNew && (
            <>
              <input
                className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full mb-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                placeholder={t("Search customer (name or phone)...")}
                value={search}
                onChange={e => searchCustomers(e.target.value)}
              />
              {loading && <div>{t("Loading...")}</div>}
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {matches.map(c =>
                  editId === c.id ? (
                    <div key={c.id} className="p-3 rounded-2xl border-2 bg-blue-50 dark:bg-zinc-800 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          className="px-2 py-1 rounded border flex-1"
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Name"
                        />
                        <input
                          className="px-2 py-1 rounded border flex-1"
                          value={editForm.phone}
                          onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="Phone"
                        />
                      </div>
                      <input
  className="px-2 py-1 rounded border flex-1"
  value={editForm.email || ""}
  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
  placeholder="Email"
/>

                      <div className="flex gap-2">
                        <input
                          type="date"
                          className="px-2 py-1 rounded border flex-1"
                          value={editForm.birthday || ""}
                          onChange={e => setEditForm(f => ({ ...f, birthday: e.target.value }))}
                          placeholder="Birthday"
                          max={new Date().toISOString().slice(0, 10)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 bg-green-600 text-white font-semibold rounded py-1"
                          onClick={() => handleEditCustomer(c.id)}
                        >Save</button>
                        <button
                          className="flex-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded py-1"
                          onClick={() => setEditId(null)}
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={c.id}
                      className={`p-3 rounded-2xl cursor-pointer transition text-base border-2 ${
                        selected?.id === c.id
                          ? "bg-gradient-to-r from-blue-100 via-fuchsia-100 to-indigo-100 border-blue-300"
                          : "bg-white dark:bg-gray-800 border-transparent"
                      } hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:border-blue-200`}
                      onClick={() => handleCustomerClick(c)}
                    >
                      <b>{c.name}</b>{" "}
                      <span className="text-xs text-gray-600 dark:text-gray-300">{c.phone}</span>
                      {c.birthday && (
                        <span className="ml-2 text-xs text-pink-500 flex items-center gap-1">
                          <Gift size={14} className="inline" />
                          {new Date(c.birthday).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        className="ml-3 text-blue-500 hover:underline text-xs"
                        onClick={e => {
                          e.stopPropagation();
                          setEditId(c.id);
                          setEditForm({ name: c.name, phone: c.phone, birthday: c.birthday || "", email: c.email || "" });
                        }}
                      >✏️ Edit</button>
                    </div>
                  )
                )}
              </div>
              <button
                className="mt-3 text-blue-700 dark:text-blue-300 font-semibold hover:underline"
                onClick={() => setShowNew(true)}
              >
                <Plus className="inline mb-1" size={18}/> {t("Add New Customer")}
              </button>
            </>
          )}

          {/* 2. Add New Customer */}
          {showNew && (
            <div className="space-y-3">
              <input
                className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                placeholder={t("Name")}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <input
                className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                placeholder={t("Phone")}
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
              <input
                className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                placeholder={t("Address (optional)")}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
  className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
  placeholder={t("Email (optional)")}
  value={form.email}
  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
  type="email"
/>

              {/* Birthday Field - visually enhanced */}
              <div className="flex items-center gap-2 mt-2">
                <Gift className="text-pink-400" size={22} />
                <input
                  type="date"
                  className="border-2 border-pink-100 rounded-xl px-4 py-2 flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition"
                  placeholder="Birthday"
                  value={form.birthday || ""}
                  onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                  max={new Date().toISOString().slice(0, 10)}
                  style={{ minWidth: 0 }}
                />
                <span className="text-sm text-pink-500">{form.birthday ? new Date(form.birthday).toLocaleDateString() : t("Birthday")}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl shadow transition"
                  onClick={handleAddCustomer}
                >
                  {t("Save Customer")}
                </button>
                <button
                  className="flex-1 text-gray-700 dark:text-gray-200 hover:underline font-semibold rounded-xl px-2 py-2"
                  onClick={() => setShowNew(false)}
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          )}

          {/* 3. Address Management for selected customer */}
          {selected && (
            <div className="mt-5">
              <div className="font-semibold mb-2 flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <MapPin size={18} /> {t("Addresses")}
              </div>
              <div className="flex flex-col gap-2">
                {addresses.map(addr => (
                  <div key={addr.id}
                    className={`rounded-xl border px-3 py-2 flex items-center justify-between transition
                      ${selectedAddressId === addr.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-blue-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"}
                      cursor-pointer`}
                    onClick={() => setSelectedAddressId(addr.id)}
                  >
                    <div className="flex-1">
                      <span className="font-bold">{addr.label || "Address"}:</span>
                      <span className="ml-2">{addr.address}</span>
                      {addr.is_default && <span className="ml-2 px-2 text-xs bg-blue-500 text-white rounded">Default</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); setEditAddrId(addr.id); setAddrForm({ label: addr.label, address: addr.address }); }} className="text-blue-600 p-1"><Pencil size={16}/></button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteAddress(addr.id); }} className="text-red-500 p-1"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Add New Address */}
              {editAddrId === "new" ? (
                <div className="mt-2 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-2">
                  <input
                    className="w-1/3 px-1 rounded border"
                    placeholder="Label (Home, Work...)"
                    value={addrForm.label}
                    onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))}
                  />
                  <input
                    className="w-2/3 px-1 rounded border"
                    placeholder="Full address"
                    value={addrForm.address}
                    onChange={e => setAddrForm(f => ({ ...f, address: e.target.value }))}
                  />
                  
                  <button
                    onClick={handleAddAddress}
                    className="bg-blue-600 text-white px-2 py-1 rounded ml-2"
                  >Save</button>
                  <button
                    onClick={() => { setEditAddrId(null); setAddrForm({ label: "", address: "" }); }}
                    className="ml-1 text-gray-600 underline"
                  >Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditAddrId("new"); setAddrForm({ label: "", address: "" }); }}
                  className="mt-2 flex items-center gap-1 text-blue-700 font-semibold hover:underline"
                >
                  <Plus size={16} /> {t("Add Address")}
                </button>
              )}
              {/* Edit Address Form */}
              {editAddrId && editAddrId !== "new" && (
                <div className="mt-2 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-2">
                  <input
                    className="w-1/3 px-1 rounded border"
                    placeholder="Label (Home, Work...)"
                    value={addrForm.label}
                    onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))}
                  />
                  <input
                    className="w-2/3 px-1 rounded border"
                    placeholder="Full address"
                    value={addrForm.address}
                    onChange={e => setAddrForm(f => ({ ...f, address: e.target.value }))}
                  />
                  
                  <button
                    onClick={() => handleEditAddress(editAddrId)}
                    className="bg-blue-600 text-white px-2 py-1 rounded ml-2"
                  >Save</button>
                  <button
                    onClick={() => { setEditAddrId(null); setAddrForm({ label: "", address: "" }); }}
                    className="ml-1 text-gray-600 underline"
                  >Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* 4. Payment Method */}
          <div className="mt-6 mb-2">
            <label className="block mb-2 font-semibold text-gray-800 dark:text-white">{t("Payment Method")}</label>
            <select
              className="border-2 border-blue-100 rounded-xl px-4 py-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              {paymentMethods.map(method => (
                <option key={method} value={method}>{t(method)}</option>
              ))}
            </select>
          </div>

          {/* 5. Start Order */}
          <button
            className="w-full mt-5 bg-blue-700 hover:bg-blue-900 text-white font-bold text-lg py-3 rounded-2xl shadow transition"
            disabled={!selected || !selectedAddressId}
            onClick={handleStartOrder}
          >
            {t("Start Order")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PhoneOrderModal;
