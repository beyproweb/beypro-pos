import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import secureFetch, { getAuthToken } from "../../utils/secureFetch";
import { safeNavigate } from "../../utils/navigation";

export default function SubscriptionTab() {
  const { t } = useTranslation();

  // Form state — we fetch actual tenant/user data and populate this.
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    taxId: "",
    businessName: "",
    posLocation: "",
    posLocationLat: "",
    posLocationLng: "",
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
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  // On mount: if token present, fetch /me to load tenant/user info.
useEffect(() => {
  const token = getAuthToken();
  if (!token) {
    setIsLoggedIn(false);
    return;
  }

  let mounted = true;
  (async () => {
    setLoading(true);
    try {
      const res = await secureFetch("me");
      if (!mounted) return;

      console.log("🔍 Raw API response from /me:", res);

      // Handle both response formats: direct user object OR res.user
      const u = res?.user || res;
      
      if (u && (u.id || u.email || u.name)) {
        console.log("📋 User object from response:", u);

        // ✅ Map all backend fields (including new ones)
        const formData = {
          fullName: u.full_name || u.fullName || u.name || "",
          email: u.email || "",
          phone: u.phone || "",
          taxId: u.tax_id || u.taxId || "",
          businessName: u.business_name || u.businessName || u.restaurant_name || "",
          posLocation: u.pos_location || u.posLocation || "",
          posLocationLat: u.pos_location_lat || u.posLocationLat || "",
          posLocationLng: u.pos_location_lng || u.posLocationLng || "",
          usageType: u.usage_type || u.usageType || "",
          efatura: u.efatura ?? false,
          invoiceTitle: u.invoice_title || u.invoiceTitle || "",
          taxOffice: u.tax_office || u.taxOffice || "",
          invoiceType: u.invoice_type || u.invoiceType || "",
          cardNumber: u.card_number || u.cardNumber || "",
          expiry: u.expiry || "",
          cvv: u.cvv || "",
          billingCycle: u.billing_cycle || u.billingCycle || "monthly",
          activePlan: u.active_plan || u.plan || u.subscription_plan || "basic",
          password: "",
          confirmPassword: "",
        };

        console.log("✅ Populated form data:", formData);
        
        setForm(formData);
        setIsLoggedIn(true);
      } else {
        console.log("❌ No valid user data found in response");
        setIsLoggedIn(false);
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch /me:", err);
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  })();

  return () => {
    mounted = false;
  };
}, []);



  const handleSave = async () => {
    if (form.password && form.password !== form.confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    const token = getAuthToken();

    if (!token) {
      toast.error(t("You are not logged in. Please login again."));
      return;
    }

    try {
      setLoading(true);

    const payload = {
  fullName: form.fullName,
  email: form.email,
  businessName: form.businessName,
  billingCycle: form.billingCycle,
  activePlan: form.activePlan,
  password: form.password || "",
  cardNumber: form.cardNumber || "",
  expiry: form.expiry || "",
  cvv: form.cvv || "",
  phone: form.phone || "",
  posLocation: form.posLocation || "",
  posLocationLat: form.posLocationLat ? parseFloat(form.posLocationLat) : null,
  posLocationLng: form.posLocationLng ? parseFloat(form.posLocationLng) : null,
  usageType: form.usageType || "",
  efatura: form.efatura || false,
  invoiceTitle: form.invoiceTitle || "",
  taxOffice: form.taxOffice || "",
  invoiceType: form.invoiceType || "",
};


      console.log("📦 Sending payload to /me:", payload);

      const res = await secureFetch("me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      console.log("⬅️ /me response:", res);

      if (res?.success) {
        toast.success(t("Profile updated successfully"));
        const stored = JSON.parse(localStorage.getItem("beyproUser") || "{}");
        const updated = {
          ...stored,
          email: form.email,
          fullName: form.fullName,
          businessName: form.businessName,
        };
        localStorage.setItem("beyproUser", JSON.stringify(updated));
      } else {
        toast.error(res?.error || t("Failed to update profile"));
      }
    } catch (err) {
      console.error("❌ Error saving subscription data:", err);
      toast.error(err.message || t("Update failed"));
    } finally {
      setLoading(false);
    }
  };

  // If not logged in, the button will run original subscribe/register flow.
  const handleSubscribe = async () => {
    if (form.password !== form.confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    try {
      setLoading(true);
      // Register
      const normalizedEmail = String(form.email || "").trim().toLowerCase();
      const registerRes = await secureFetch("/register", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password: form.password,
          full_name: form.fullName,
          business_name: form.businessName,
          subscription_plan: form.activePlan,
        }),
      });

      if (!registerRes || !registerRes.success) {
        toast.error(t("Registration failed. Please try again."));
        return;
      }

      // After successful registration, optionally call /subscribe if backend expects it.
      // We try to call /subscribe if it exists.
      try {
        const sub = await secureFetch("/subscribe", {
          method: "POST",
          body: JSON.stringify(form),
        });
        if (sub?.success) {
          toast.success(t("🎉 Subscription registered! Welcome to Beypro."));
          setTimeout(() => safeNavigate("/"), 1200);
        } else {
          toast.success(t("Registration successful. Please login."));
        }
      } catch (err) {
        // /subscribe might not exist or fail — still treat registration success as success.
        toast.success(t("Registration successful. Please login."));
      }
    } catch (error) {
      console.error("❌ Registration request failed", {
        message: error?.message,
        details: error?.details,
      });
      toast.error(t("❌ All fields required."));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const v = type === "checkbox" ? checked : value;
    setForm((prev) => ({ ...prev, [name]: v }));
  };

  // Render: show all tenant info but only allow editing of email, phone and password fields.
return (
  <div className="bg-white/50 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-14 space-y-10 max-w-4xl mx-auto">
    <main className="relative z-10 mx-auto px-4 pt-2 pb-28 space-y-12">
      <div className="p-4 md:p-0 space-y-10 max-w-3xl mx-auto">

        {/* ---------------- My Account Section ---------------- */}
        <section className="space-y-6">
          <h2 className="text-4xl font-extrabold text-center text-indigo-700 font-display tracking-tight">
            👤 {t("My Account")}
          </h2>
          <p className="text-center text-gray-600 text-base md:text-lg">
            {t("Manage your business information and account details")}
          </p>

          {/* Business Details */}
          <div className="grid md:grid-cols-1 gap-6 pt-4" id="details">
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
              placeholder={t("Email")}
              className="p-3 rounded-lg border w-full shadow-sm bg-gray-100 cursor-not-allowed"
              disabled
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
              placeholder={t("Tax ID Number")}
              className="p-3 rounded-lg border w-full shadow-sm bg-gray-100 cursor-not-allowed"
              disabled
            />

            <input
              name="businessName"
              value={form.businessName}
              placeholder={t("Business Name")}
              className="p-3 rounded-lg border w-full shadow-sm bg-gray-100 cursor-not-allowed"
              disabled
            />

            <input
              name="posLocation"
              value={form.posLocation}
              onChange={handleChange}
              placeholder={t("POS Location / City")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />

            <div className="grid md:grid-cols-2 gap-4">
              <input
                name="posLocationLat"
                type="number"
                step="0.0000001"
                value={form.posLocationLat}
                onChange={handleChange}
                placeholder={t("Latitude (e.g., 38.0872)")}
                className="p-3 rounded-lg border w-full shadow-sm"
              />
              <input
                name="posLocationLng"
                type="number"
                step="0.0000001"
                value={form.posLocationLng}
                onChange={handleChange}
                placeholder={t("Longitude (e.g., 27.7288)")}
                className="p-3 rounded-lg border w-full shadow-sm"
              />
            </div>

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

          {/* e-Fatura Section */}
          <div className="grid gap-4 pt-8">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.efatura}
                onChange={() =>
                  setForm((prev) => ({ ...prev, efatura: !prev.efatura }))
                }
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded"
              />
              <span className="text-gray-700 font-medium">
                {t("Enable e-Fatura / e-Arşiv")}
              </span>
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
                  placeholder={t("Invoice Title (e.g. Müge Hurry)")}
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

          {/* Credit Card Info */}
          <div className="grid md:grid-cols-1 gap-6 pt-8">
            <h3 className="text-lg font-semibold text-gray-800">
              💳 {t("Payment Method")}
            </h3>
            <input
              name="cardNumber"
              value={form.cardNumber}
              onChange={handleChange}
              placeholder={t("Credit Card Number")}
              className="p-3 rounded-lg border w-full shadow-sm"
            />
            <div className="grid grid-cols-2 gap-4">
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
          </div>

          {/* Password Fields */}
          <div className="grid md:grid-cols-1 gap-6 pt-10">
            <h3 className="text-lg font-semibold text-gray-800">
              🔐 {t("Security")}
            </h3>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder={t("Password (leave blank to keep current)")}
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
        </section>

        {/* ---------------- Update Account Button ---------------- */}
        <div className="flex justify-center pt-8">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-2xl shadow-xl hover:scale-[1.03] transition-transform duration-200 disabled:opacity-60"
          >
            {loading ? `💾 ${t("Updating...")}` : `💾 ${t("Update Account")}`}
          </button>
        </div>

        {/* ---------------- Upgrade Account Section ---------------- */}
        <section className="space-y-6 pt-16">
          <h2 className="text-4xl font-extrabold text-center text-indigo-700 font-display tracking-tight">
            🚀 {t("Upgrade Your Account")}
          </h2>
          <p className="text-center text-gray-600 text-base md:text-lg">
            {t("Select your preferred Beypro plan to unlock more features")}
          </p>

          {/* Billing Cycle Selector */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-100 overflow-hidden text-sm font-medium shadow-sm">
              {["monthly", "yearly"].map((cycle) => (
                <button
                  key={cycle}
                  onClick={() =>
                    setForm((p) => ({ ...p, billingCycle: cycle }))
                  }
                  className={`px-5 py-2 transition-all duration-200 ${
                    form.billingCycle === cycle
                      ? "bg-indigo-600 text-white"
                      : "text-indigo-600 hover:bg-indigo-200"
                  }`}
                  disabled={isLoggedIn}
                >
                  {t(
                    cycle.charAt(0).toUpperCase() + cycle.slice(1)
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Plans Grid */}
          <div
            className="flex flex-col lg:flex-row gap-8 justify-center items-stretch"
            id="plans"
          >
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
                    ${
                      form.activePlan === plan.key
                        ? "border-indigo-600 shadow-lg"
                        : "border-gray-200 hover:shadow-md"
                    }
                    ${bgColors[index % bgColors.length]}`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xl font-bold text-indigo-700">
                        {t(plan.name)}
                      </h3>
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
                  {form.activePlan !== plan.key && !isLoggedIn && (
                    <button
                      onClick={() => {
                        setForm((p) => ({ ...p, activePlan: plan.key }));
                        setTimeout(() => {
                          document
                            .getElementById("details")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }, 100);
                      }}
                      className="mt-auto w-full py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
                    >
                      {t("Choose")} {t(plan.name)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>

    {/* Sticky Save CTA */}
    <div className="sticky bottom-6 left-0 right-0 z-50 px-4 py-4 flex justify-center pointer-events-auto bg-white/80 backdrop-blur-md shadow-lg rounded-t-2xl">
      {isLoggedIn ? (
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full max-w-md py-6 md:py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-2xl shadow-xl hover:scale-[1.03] transition-transform duration-200 disabled:opacity-60"
        >
          {loading ? `💾 ${t("Saving...")}` : `💾 ${t("Save Changes")}`}
        </button>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full max-w-md py-3 md:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-lg font-bold rounded-2xl shadow-xl hover:scale-[1.05] transition-transform duration-300 disabled:opacity-60"
        >
          🚀 {t("Upgrade")}
        </button>
      )}
    </div>
  </div>
);


}
