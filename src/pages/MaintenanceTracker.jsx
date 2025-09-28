import React, { useState, useEffect } from "react";
import { Wrench, Plus, Loader, User, CheckCircle, Clock } from "lucide-react";
import axios from "axios";
import { useHasPermission } from "../components/hooks/useHasPermission";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
import { useTranslation } from "react-i18next";

// Demo data loader — swap for your backend integration
const fetchIssues = async () => [
  { id: 1, title: "Fryer oil needs replacement", status: "open", created_at: "2025-07-22", assigned: "Ali", description: "Oil smells burned, food quality dropping.", photo: "", resolved_at: null },
  { id: 2, title: "POS terminal connection lost", status: "in_progress", created_at: "2025-07-20", assigned: "Zeynep", description: "Terminal not printing receipts", photo: "", resolved_at: null },
  { id: 3, title: "Freezer temperature high", status: "resolved", created_at: "2025-07-15", assigned: "Ali", description: "Freezer at -6°C, needs to be below -16°C", photo: "", resolved_at: "2025-07-16" }
];

export default function MaintenanceTracker() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: "", description: "", assigned: "", photo: null,
  });
 const canAccess = useHasPermission("maintenance");
if (!canAccess) {
  return <div className="p-12 text-2xl text-red-600 text-center">
    {t("Access Denied: You do not have permission to view Maintenance Tracker.")}
  </div>;
}
  useEffect(() => {
    setLoading(true);
    fetchIssues().then(setIssues).finally(() => setLoading(false));
  }, []);

  const handleInput = e => setForm(f => ({
    ...f, [e.target.name]: e.target.value
  }));

  const handlePhoto = e => setForm(f => ({ ...f, photo: e.target.files[0] }));

  async function submitIssue(e) {
    e.preventDefault();
    setLoading(true);
    // TODO: POST to backend
    setTimeout(() => {
      setIssues([
        {
          id: Date.now(),
          title: form.title,
          description: form.description,
          assigned: form.assigned,
          photo: form.photo ? URL.createObjectURL(form.photo) : "",
          status: "open",
          created_at: new Date().toISOString().slice(0, 10),
          resolved_at: null
        },
        ...issues,
      ]);
      setShowForm(false);
      setForm({ title: "", description: "", assigned: "", photo: null });
      setLoading(false);
    }, 1200);
  }

  const statusColors = {
    open: "bg-red-100 text-red-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    resolved: "bg-green-100 text-green-700"
  };

  return (
    <div className="max-w-3xl mx-auto px-3 py-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-8 h-8 text-gray-600 dark:text-gray-300" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Maintenance Tracker</h1>
      </div>
      <p className="mb-5 text-gray-500 dark:text-gray-300">
        Log, assign, and resolve issues fast—never lose track of a single problem.  
        <span className="ml-1 font-semibold">Minimize downtime, maximize uptime!</span>
      </p>
      {/* Quick action */}
      <button
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700 text-white font-semibold shadow hover:bg-gray-900 mb-5"
        onClick={() => setShowForm(v => !v)}
      >
        <Plus className="w-5 h-5" /> {showForm ? "Cancel" : "Add New Issue"}
      </button>
      {/* New Issue Form */}
      {showForm && (
        <form className="bg-white dark:bg-zinc-900/70 rounded-2xl shadow border border-gray-200 dark:border-zinc-800 p-6 mb-7" onSubmit={submitIssue}>
          <div className="flex flex-col gap-3 mb-3">
            <input
              name="title"
              className="rounded-xl border border-gray-300 dark:border-zinc-700 px-3 py-2"
              placeholder="Issue title (e.g., Dishwasher leak)"
              value={form.title}
              onChange={handleInput}
              required
            />
            <textarea
              name="description"
              className="rounded-xl border border-gray-300 dark:border-zinc-700 px-3 py-2"
              rows={2}
              placeholder="Short description"
              value={form.description}
              onChange={handleInput}
              required
            />
            <input
              name="assigned"
              className="rounded-xl border border-gray-300 dark:border-zinc-700 px-3 py-2"
              placeholder="Assigned to (staff name)"
              value={form.assigned}
              onChange={handleInput}
              required
            />
            <input
              type="file"
              accept="image/*"
              onChange={handlePhoto}
            />
          </div>
          <button
            className="px-5 py-2 rounded-xl bg-green-600 text-white font-bold shadow hover:bg-green-700 transition"
            disabled={loading}
          >
            {loading ? <Loader className="w-5 h-5 animate-spin inline" /> : "Submit Issue"}
          </button>
        </form>
      )}
      {/* Issues Table */}
      <div className="rounded-2xl shadow bg-white dark:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100 dark:border-zinc-700">
              <th className="py-2 px-3 font-bold">Status</th>
              <th className="py-2 px-3 font-bold">Issue</th>
              <th className="py-2 px-3 font-bold">Assigned</th>
              <th className="py-2 px-3 font-bold">Created</th>
              <th className="py-2 px-3 font-bold">Resolved</th>
              <th className="py-2 px-3 font-bold">Photo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : issues.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No issues found</td></tr>
            ) : issues.map(issue => (
              <tr key={issue.id} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/60 dark:hover:bg-zinc-800/20 transition">
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${statusColors[issue.status]}`}>
                    {issue.status === "open" && <Clock className="w-4 h-4" />}
                    {issue.status === "in_progress" && <Loader className="w-4 h-4 animate-spin" />}
                    {issue.status === "resolved" && <CheckCircle className="w-4 h-4" />}
                    {issue.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 px-3">{issue.title}<div className="text-xs text-gray-500">{issue.description}</div></td>
                <td className="py-2 px-3 flex items-center gap-1"><User className="w-4 h-4" /> {issue.assigned}</td>
                <td className="py-2 px-3">{issue.created_at}</td>
                <td className="py-2 px-3">{issue.resolved_at || "-"}</td>
                <td className="py-2 px-3">
                  {issue.photo ? <img src={issue.photo} alt="Photo" className="w-10 h-10 rounded object-cover" /> : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Footer */}
      <div className="mt-7 text-sm text-gray-400 text-center">
        Beypro Maintenance — <span className="font-semibold">Track problems, never drop the ball.</span>
      </div>
    </div>
  );
}
