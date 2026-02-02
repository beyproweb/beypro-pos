import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { normalizeUser } from "../../utils/normalizeUser";
import { BASE_URL } from "../../utils/secureFetch";

export default function StandaloneRegister() {
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { setCurrentUser } = useAuth();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const res = await fetch(`${BASE_URL}/standalone/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          business_name: businessName,
          email: normalizedEmail,
          password,
        }),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Registration failed");
      }

      const normalizedUser = normalizeUser({
        ...data.user,
        token: data.token,
        allowed_modules: data.allowed_modules,
      });

      localStorage.setItem("token", data.token);
      localStorage.setItem("standaloneToken", data.token);
      if (normalizedUser.restaurant_id) {
        localStorage.setItem("restaurant_id", normalizedUser.restaurant_id);
      }
      localStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
      setCurrentUser(normalizedUser);

      navigate("/standalone/app", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md bg-white/95 rounded-2xl shadow-2xl p-6">
        <h1 className="text-2xl font-bold text-gray-900">QR Menu + Kitchen</h1>
        <p className="text-sm text-gray-500 mt-1">Create a standalone account</p>

        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Business name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="text-sm text-gray-600 mt-4">
          Already have an account?{" "}
          <Link className="text-indigo-600 font-semibold" to="/standalone/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
