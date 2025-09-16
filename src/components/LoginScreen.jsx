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
  const handleRegister = () => {
    setShowSubscription(true);
  };
  const { setCurrentUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  // ... form logic ...
  try {
    const response = await axios.post(`${API_URL}/api/staff/login`, { email, password });
 // password is either password or pin

    if (response.data.success) {
if (response.data.user) {
  // Normal user/admin login
  const userObj = {
    ...response.data.user,
    name: response.data.user.full_name || response.data.user.fullName || response.data.user.name || "Manager"
  };
  localStorage.setItem("beyproUser", JSON.stringify(userObj));
  setCurrentUser(userObj);

} else if (response.data.staff) {
    // Staff login
    const staffObj = {
      ...response.data.staff,
      name: response.data.staff.name || "Manager"
    };
    localStorage.setItem("beyproUser", JSON.stringify(staffObj));
    setCurrentUser(staffObj);
  }
  toast.success(t("Welcome back!"));
  navigate("/dashboard"); 
}
 else {
      toast.error(response.data.error || t("Login failed"));
    }
  } catch (err) {
    console.error("Login error:", err);
    toast.error(t("Server error during login"));
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
        <p className="text-gray-600 mb-8">{t("Manage smarter, grow faster.")}</p>

        <input
          type="email"
          placeholder={t("Email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="password"
          placeholder={t("Password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 bg-indigo-700 text-white rounded-lg font-semibold hover:bg-indigo-800 transition duration-200 mb-3"
        >
          {loading ? t("Logging in...") : t("Login")}
        </button>

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
