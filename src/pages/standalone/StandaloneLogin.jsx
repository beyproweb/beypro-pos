import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { normalizeUser } from "../../utils/normalizeUser";
import { BASE_URL } from "../../utils/secureFetch";

export default function StandaloneLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { setCurrentUser } = useAuth();

  useEffect(() => {
    try {
      const existing = localStorage.getItem("token") || sessionStorage.getItem("token");
      if (existing) navigate("/standalone/app", { replace: true });
    } catch {}
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const res = await fetch(`${BASE_URL}/standalone/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Login failed");
      }

      const normalizedUser = normalizeUser({
        ...data.user,
        token: data.token,
        allowed_modules: data.allowed_modules,
      });

      const authStorage = rememberMe ? window.localStorage : window.sessionStorage;
      const otherStorage = rememberMe ? window.sessionStorage : window.localStorage;
      try {
        otherStorage.removeItem("token");
        otherStorage.removeItem("beyproUser");
        otherStorage.removeItem("standaloneToken");
      } catch {}

      authStorage.setItem("token", data.token);
      authStorage.setItem("standaloneToken", data.token);
      if (normalizedUser.restaurant_id) {
        localStorage.setItem("restaurant_id", normalizedUser.restaurant_id);
      } else {
        localStorage.removeItem("restaurant_id");
      }
      authStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
      setCurrentUser(normalizedUser);

      navigate("/standalone/app", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex-1 bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl rounded-3xl overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.45)] grid lg:grid-cols-2 bg-white/95">
        {/* Left: Brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/60">Beypro</div>
            <h1 className="mt-3 text-4xl font-bold">QR Menu + Kitchen</h1>
            <p className="mt-4 text-white/70 text-sm leading-relaxed">
              Lightweight standalone portal for QR menus and live kitchen flow.
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
              <div className="text-sm font-semibold">Included</div>
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                <li>• QR menu branding & settings</li>
                <li>• Kitchen screen with live orders</li>
                <li>• Standalone access only</li>
              </ul>
            </div>
            <div className="text-xs text-white/50">15 days free → ₺99/month</div>
          </div>
        </div>

        {/* Right: Form */}
        <div className="p-6 sm:p-10">
          <div className="lg:hidden mb-6">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Beypro</div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">QR Menu + Kitchen</h1>
            <p className="text-sm text-slate-500 mt-1">Standalone portal login</p>
          </div>

          <div className="hidden lg:block">
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your standalone portal</p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Keep me logged in
              </label>
              <span className="text-xs text-slate-500">Secure access</span>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-sm text-slate-600 mt-6">
            Don’t have an account?{" "}
            <Link className="text-indigo-600 font-semibold" to="/standalone/register">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
