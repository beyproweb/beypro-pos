import React, { useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import SubscriptionTab from "./settings-tabs/SubscriptionTab";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function LoginScreen() {
  const { t } = useTranslation();
  const [showSubscription, setShowSubscription] = useState(false);
  const navigate = useNavigate();
  const { setCurrentUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStaff, setIsStaff] = useState(false); // 👈 toggle between owner & staff

  const handleRegister = () => {
    setShowSubscription(true);
  };

  const handleLogin = async () => {
    try {
      setLoading(true);

      // Build payload depending on login type
      const payload = isStaff ? { email, pin } : { email, password };
      const endpoint = isStaff
        ? `${API_URL}/api/staff/login`
        : `${API_URL}/api/login`;

      const res = await axios.post(endpoint, payload);

      if (res.data.success) {
        const user = res.data.user || res.data.staff;
        localStorage.setItem("beyproUser", JSON.stringify(user));
        setCurrentUser(user);
        navigate("/");
      } else {
        toast.error("❌ Login failed");
      }
    } catch (err) {
      console.error("Login error:", err);
      toast.error("❌ Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      {showSubscription ? (
        <div className="w-full max-w-5xl">
          <SubscriptionTab />
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl w-full max-w-md text-center">
          <h1 className="text-4xl font-extrabold text-indigo-700 mb-3">
            {t("Welcome to Beypro")}
          </h1>
          <p className="text-gray-600 mb-8">
            {t("Manage smarter, grow faster.")}
          </p>

          {/* Login Type Selector */}
          <div className="flex justify-center gap-4 mb-6">
            <button
              onClick={() => setIsStaff(false)}
              className={`px-4 py-2 rounded-lg font-semibold border-2 transition ${
                !isStaff
                  ? "bg-indigo-700 text-white border-indigo-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t("Owner/Admin")}
            </button>
            <button
              onClick={() => setIsStaff(true)}
              className={`px-4 py-2 rounded-lg font-semibold border-2 transition ${
                isStaff
                  ? "bg-indigo-700 text-white border-indigo-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t("Staff")}
            </button>
          </div>

          {/* Email field */}
          <input
            type="email"
            placeholder={t("Email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          {/* Password or PIN depending on login type */}
          {!isStaff ? (
            <input
              type="password"
              placeholder={t("Password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-6 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          ) : (
            <input
              type="password"
              placeholder={t("PIN")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full mb-6 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-indigo-700 text-white rounded-lg font-semibold hover:bg-indigo-800 transition duration-200 mb-3"
          >
            {loading ? t("Logging in...") : t("Login")}
          </button>

          {/* Register button */}
          <button
            onClick={handleRegister}
            className="w-full py-3 border-2 border-indigo-600 text-indigo-700 rounded-lg font-semibold hover:bg-indigo-50 transition duration-200"
          >
            {t("Register & Continue")}
          </button>
        </div>
      )}
    </div>
  );
}
