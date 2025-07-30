import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import axios from "axios";

export default function SubscriptionTab() {

  const { t } = useTranslation();
  


  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    taxId: "",
    businessName: "",
    posLocation: "",
    usageType: "",
    cardNumber: "",
    expiry: "",
    cvv: "",
    billingCycle: "monthly",
    activePlan: "basic",
    efatura: false,
    invoiceTitle: "",
    taxOffice: "",
    invoiceType: "",
    password: "",
    confirmPassword: ""
  });

  const plans = [
    {
      key: "basic",
      name: "Basic",
      price: { monthly: "₺600", yearly: "₺6.000" },
      features: [
        "Unlimited Orders",
        "1 Register",
        "Basic Staff Management",
        "Kitchen Ticket Printing",
      ],
    },
    {
      key: "pro",
      name: "Pro",
      price: { monthly: "₺1.200", yearly: "₺12.000" },
      features: [
        "Everything in Basic",
        "Multiple Registers",
        "Payroll Automation",
        "Stock & Supplier Refill",
        "Email Reports",
      ],
    },
    {
      key: "enterprise",
      name: "Enterprise",
      price: { monthly: "₺2.200", yearly: "₺22.000" },
      features: [
        "Everything in Pro",
        "Driver App",
        "Multi-Location",
        "API Access",
        "Dedicated Support",
      ],
    },
  ];

  const handleSubscribe = async () => {
    if (form.password !== form.confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    try {
      // First: Register the user
      const registerRes = await axios.post("/api/register", {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        businessName: form.businessName,
        subscriptionPlan: form.activePlan
      });

      if (!registerRes.data.success) {
        toast.error(t("Registration failed. Please try again."));
        return;
      }

      // Then: Save the subscription
      const subscriptionRes = await axios.post("/api/subscribe", form);
     if (subscriptionRes.data.success) {
  // ✅ Store user in localStorage to keep authenticated
  localStorage.setItem("beyproUser", JSON.stringify({
    email: form.email,
    fullName: form.fullName,
  }));

  toast.success(t("🎉 Subscription registered! Welcome to Beypro."));
  setTimeout(() => {
    window.location.href = "/";
  }, 1500);
}

 else {
        toast.error(t("❌ All fields required."));
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error(t("❌ All fields required."));
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

return (
<div className="bg-white/40 backdrop-blur-xl rounded-3xl shadow-xl p-8 md:p-14 space-y-8 max-w-4xl mx-auto">







    {/* Main Content */}
   <main className="relative z-10 mx-auto px-4 pt-2 pb-24 space-y-8">
  <div className="p-4 md:p-0 space-y-4 max-w-3xl mx-auto">
    <h2 className="text-3xl md:text-4xl font-extrabold text-center text-indigo-700 font-display tracking-normal mt-0">
      🧠 {t("Join Beypro – Smarter Business")}
    </h2>
        <p className="text-center text-gray-600 text-base md:text-lg">
          {t("All-in-one POS for smart businesses")}
        </p>
          {/* Billing Toggle */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-100 overflow-hidden text-sm font-medium shadow-sm">
              {["monthly", "yearly"].map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setForm((p) => ({ ...p, billingCycle: cycle }))}
                  className={`px-5 py-2 transition-all duration-200 ${
                    form.billingCycle === cycle
                      ? "bg-indigo-600 text-white"
                      : "text-indigo-600 hover:bg-indigo-200"
                  }`}
                >
                  {t(cycle.charAt(0).toUpperCase() + cycle.slice(1))}
                </button>
              ))}
            </div>
          </div>

          {/* Plans */}
<div className="flex flex-col lg:flex-row gap-8 justify-center items-stretch" id="plans">


            {plans.map((plan, index) => {
              const bgColors = [
                "bg-gradient-to-br from-pink-100 via-white to-pink-50",
                "bg-gradient-to-br from-green-100 via-white to-green-50",
                "bg-gradient-to-br from-yellow-100 via-white to-yellow-50",
              ];
                 return (
      <div
        key={plan.key}
        className={`flex flex-col flex-1 min-w-[200px] max-w-full md:max-w-[530px] justify-between rounded-2xl border p-7 transition-all duration-300
          ${form.activePlan === plan.key ? "border-indigo-600 shadow-lg" : "border-gray-200 hover:shadow-md"}
          ${bgColors[index % bgColors.length]}`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xl font-bold text-indigo-700">{plan.name}</h3>
                      {form.activePlan === plan.key && (
                        <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full">
                          {t("Selected")}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-800 text-lg font-semibold mb-2">
                      {plan.price[form.billingCycle]}
                    </p>
                    <ul className="text-sm text-gray-700 space-y-2 mb-4">
                      {plan.features.map((f, i) => (
                        <li key={i}>✅ {t(f)}</li>
                      ))}
                    </ul>
                  </div>
                  {form.activePlan !== plan.key && (
                    <button
                      onClick={() => {
                        setForm((p) => ({ ...p, activePlan: plan.key }));
                        setTimeout(() => {
                          document
                            .getElementById("details")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 100);
                      }}
                      className="mt-auto w-full py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
                    >
                      {t("Choose")} {plan.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-gray-500 -mt-2">
            {t("Scroll down to enter your business details and subscribe securely")}
          </p>

          {/* Details Section */}
          <div className="grid md:grid-cols-1 gap-6 pt-6" id="details">
            <input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              placeholder={t("Full Name")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder={t("Email")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder={t("Phone Number")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="taxId"
              value={form.taxId}
              onChange={handleChange}
              placeholder={t("Tax ID Number")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="businessName"
              value={form.businessName}
              onChange={handleChange}
              placeholder={t("Business Name")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="posLocation"
              value={form.posLocation}
              onChange={handleChange}
              placeholder={t("POS Location / City")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <select
              name="usageType"
              value={form.usageType}
              onChange={handleChange}
              className="p-3 rounded-lg border w-full shadow-sm"
            >
              <option value="">{t("Select POS Usage Type")}</option>
              <option value="restaurant">{t("Restaurant")}</option>
              <option value="cafe">{t("Cafe")}</option>
              <option value="retail">{t("Retail")}</option>
            </select>
          </div>

          {/* e-Fatura */}
          <div className="grid gap-4 pt-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.efatura}
                onChange={() => setForm((prev) => ({ ...prev, efatura: !prev.efatura }))}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded"
              />
              <span className="text-gray-700 font-medium">{t("Enable e-Fatura / e-Arşiv")}</span>
            </label>

            {form.efatura && (
              <div className="grid md:grid-cols-2 gap-4">
                <select
                  name="invoiceType"
                  value={form.invoiceType}
                  onChange={handleChange}
                  className="p-3 rounded-lg border w-full shadow-sm"
                >
                  <option value="">{t("Select Invoice Type")}</option>
                  <option value="bireysel">{t("Individual")}</option>
                  <option value="kurumsal">{t("Corporate")}</option>
                </select>
                <input
                  name="invoiceTitle"
                  value={form.invoiceTitle}
                  onChange={handleChange}
                  placeholder={t("Invoice Title (Müke Hurry)")}
                  className="p-3 rounded-lg border w-full shadow-sm"
                />
                <input
                  name="taxOffice"
                  value={form.taxOffice}
                  onChange={handleChange}
                  placeholder={t("Tax Office (Vergi Dairesi)")}
                  className="p-3 rounded-lg border w-full shadow-sm"
                />
              </div>
            )}
          </div>

          {/* Card Info */}
          <div className="grid md:grid-cols-1 gap-6 pt-6">
            <input
              name="cardNumber"
              value={form.cardNumber}
              onChange={handleChange}
              placeholder={t("Credit Card Number")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="expiry"
              value={form.expiry}
              onChange={handleChange}
              placeholder={t("MM/YY")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="cvv"
              value={form.cvv}
              onChange={handleChange}
              placeholder={t("CVV")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
          </div>

          {/* Passwords */}
          <div className="grid md:grid-cols-1 gap-6 pt-6 pb-28">
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder={t("Password")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder={t("Confirm Password")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
          </div>
        </div>

    </main>

    {/* Sticky Subscribe CTA */}
    <div className="fixed bottom-28 left-0 right-0  px-4 py-4 flex justify-center">
      <button
        onClick={handleSubscribe}
        className="w-full max-w-md py-3 md:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-lg font-bold rounded-2xl shadow-xl hover:scale-[1.05] hover:brightness-110 transition-transform duration-300"
      >
        🚀 {t("Subscribe Now")}
      </button>
    </div>
  </div>
);







}
