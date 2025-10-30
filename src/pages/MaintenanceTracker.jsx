// src/pages/MaintenanceTracker.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Wrench, Plus, Loader, User, CheckCircle, Clock, Trash2, Edit3, Play, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";
import { useHasPermission } from "../components/hooks/useHasPermission";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api")
  .toString().replace(/\/+$/, "");
const ORIGIN = API_BASE.replace(/\/api$/, ""); // for photo_url like /uploads/...

export default function MaintenanceTracker() {
  const { t } = useTranslation();
  const canAccess = useHasPermission("maintenance");
  const [staff, setStaff] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters/form
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", assigned_to: "", priority: "medium", photo: null
  });

  if (!canAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Maintenance Tracker.")}
      </div>
    );
  }

  // initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [issueList, staffList] = await Promise.all([
          secureFetch("/maintenance"),
          secureFetch("/staff"),
        ]);
        if (!alive) return;
        setIssues(Array.isArray(issueList) ? issueList : []);
        setStaff(Array.isArray(staffList) ? staffList : []);
      } catch {
        // show toast if you use react-toastify
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // live updates from backend
    socket.on("maintenance_created", (row) => setIssues((p) => [row, ...p]));
    socket.on("maintenance_updated", (row) =>
      setIssues((p) => p.map((it) => (it.id === row.id ? row : it)))
    );
    socket.on("maintenance_deleted", ({ id }) =>
      setIssues((p) => p.filter((it) => it.id !== id))
    );
    socket.on("maintenance_comment", (c) => {
      // optional: you can fetch comments on demand; here we ignore list
      console.log("comment", c);
    });

    return () => {
      alive = false;
      socket.off("maintenance_created");
      socket.off("maintenance_updated");
      socket.off("maintenance_deleted");
      socket.off("maintenance_comment");
    };
  }, []);

  const handleInput = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const handlePhoto = (e) => setForm((f) => ({ ...f, photo: e.target.files?.[0] || null }));

  async function submitIssue(e) {
    e?.preventDefault?.();
    if (!form.title?.trim()) return;

    try {
      setLoading(true);
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("description", form.description || "");
      fd.append("priority", form.priority || "medium");
      if (form.assigned_to) fd.append("assigned_to", String(form.assigned_to));
      if (form.photo) fd.append("photo", form.photo);

      // secureFetch will preserve FormData and not force JSON headers
      await secureFetch("/maintenance", { method: "POST", body: fd });
      // list will auto-update via socket "maintenance_created"
      setShowForm(false);
      setForm({ title: "", description: "", assigned_to: "", priority: "medium", photo: null });
    } catch (err) {
      console.error("Create issue failed", err);
    } finally {
      setLoading(false);
    }
  }

  async function startIssue(id) {
    try {
      const row = await secureFetch(`/maintenance/${id}/start`, { method: "PATCH" });
      setIssues((p) => p.map((it) => (it.id === id ? row : it)));
    } catch (e) { console.error(e); }
  }

  async function resolveIssue(id) {
    try {
      const row = await secureFetch(`/maintenance/${id}/resolve`, { method: "PATCH" });
      setIssues((p) => p.map((it) => (it.id === id ? row : it)));
    } catch (e) { console.error(e); }
  }

  async function deleteIssue(id) {
    try {
      await secureFetch(`/maintenance/${id}`, { method: "DELETE" });
      setIssues((p) => p.filter((it) => it.id !== id));
    } catch (e) { console.error(e); }
  }

  async function quickAssign(id, assigned_to) {
    try {
      const row = await secureFetch(`/maintenance/${id}`, {
        method: "PUT",
        body: JSON.stringify({ assigned_to }),
      });
      setIssues((p) => p.map((it) => (it.id === id ? row : it)));
    } catch (e) { console.error(e); }
  }

  const filtered = useMemo(() => {
    return issues.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (assignedFilter && String(it.assigned_to || "") !== String(assignedFilter)) return false;
      const hay = `${it.title ?? ""} ${it.description ?? ""}`.toLowerCase();
      return !search || hay.includes(search.toLowerCase());
    });
  }, [issues, statusFilter, assignedFilter, search]);

  const statusColors = {
    open: "bg-red-100 text-red-700",
    in_progress: "bg-amber-100 text-amber-700",
    resolved: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="max-w-5xl mx-auto px-3 py-8">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-8 h-8 text-gray-700" />
        <h1 className="text-2xl font-extrabold">Maintenance Tracker</h1>
      </div>
      <p className="mb-5 text-gray-500">
        Log, assign, and resolve issues fast — minimize downtime, maximize uptime.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-white font-semibold shadow hover:bg-gray-900"
        >
          <Plus className="w-5 h-5" /> {showForm ? "Cancel" : "Add New Issue"}
        </button>

        <select
          className="px-3 py-2 rounded-xl border"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          className="px-3 py-2 rounded-xl border"
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
        >
          <option value="">All assignees</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="null">Unassigned</option>
        </select>

        <input
          className="px-3 py-2 rounded-xl border flex-1 min-w-[200px]"
          placeholder="Search title/description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <form
          onSubmit={submitIssue}
          className="bg-white rounded-2xl shadow border p-6 mb-6 space-y-3"
        >
          <input
            name="title"
            value={form.title}
            onChange={handleInput}
            required
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Issue title (e.g., Dishwasher leak)"
          />
          <textarea
            name="description"
            value={form.description}
            onChange={handleInput}
            rows={3}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Short description"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              name="assigned_to"
              value={form.assigned_to}
              onChange={handleInput}
              className="flex-1 rounded-xl border px-3 py-2"
            >
              <option value="">Assign to…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              name="priority"
              value={form.priority}
              onChange={handleInput}
              className="flex-1 rounded-xl border px-3 py-2"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input type="file" accept="image/*" onChange={handlePhoto} className="flex-1" />
          </div>
          <button
            className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold shadow hover:bg-emerald-700"
            disabled={loading}
          >
            {loading ? <Loader className="w-5 h-5 animate-spin inline" /> : "Submit Issue"}
          </button>
        </form>
      )}

      <div className="rounded-2xl shadow bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 px-3 font-bold">Status</th>
              <th className="py-2 px-3 font-bold">Issue</th>
              <th className="py-2 px-3 font-bold">Assigned</th>
              <th className="py-2 px-3 font-bold">Priority</th>
              <th className="py-2 px-3 font-bold">Created</th>
              <th className="py-2 px-3 font-bold">Resolved</th>
              <th className="py-2 px-3 font-bold">Photo</th>
              <th className="py-2 px-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">No issues found</td></tr>
            ) : (
              filtered.map((it) => {
                const assignee = staff.find((s) => s.id === it.assigned_to);
                return (
                  <tr key={it.id} className="border-b hover:bg-gray-50/60 transition">
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${statusColors[it.status]}`}>
                        {it.status === "open" && <Clock className="w-4 h-4" />}
                        {it.status === "in_progress" && <Loader className="w-4 h-4 animate-spin" />}
                        {it.status === "resolved" && <CheckCircle className="w-4 h-4" />}
                        {it.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-semibold">{it.title}</div>
                      <div className="text-xs text-gray-500">{it.description}</div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <select
                          className="border rounded-md text-xs px-1 py-0.5"
                          value={it.assigned_to || ""}
                          onChange={(e) => quickAssign(it.id, e.target.value || null)}
                        >
                          <option value="">Unassigned</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-2 px-3 capitalize">{it.priority || "medium"}</td>
                    <td className="py-2 px-3">{new Date(it.created_at).toLocaleString()}</td>
                    <td className="py-2 px-3">{it.resolved_at ? new Date(it.resolved_at).toLocaleString() : "-"}</td>
                    <td className="py-2 px-3">
                      {it.photo_url ? (
                        <img
                          src={`${ORIGIN}${it.photo_url}`}
                          alt="Photo"
                          className="w-12 h-12 rounded object-cover"
                        />
                      ) : "-"}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {it.status === "open" && (
                          <button className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 flex items-center gap-1"
                                  onClick={() => startIssue(it.id)}>
                            <Play className="w-4 h-4" /> Start
                          </button>
                        )}
                        {it.status !== "resolved" && (
                          <button className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 flex items-center gap-1"
                                  onClick={() => resolveIssue(it.id)}>
                            <Check className="w-4 h-4" /> Resolve
                          </button>
                        )}
                        <button className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1"
                                onClick={() => {/* open edit modal if needed */}}>
                          <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 flex items-center gap-1"
                                onClick={() => deleteIssue(it.id)}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-7 text-sm text-gray-400 text-center">
        Beypro Maintenance — <span className="font-semibold">Track problems, never drop the ball.</span>
      </div>
    </div>
  );
}
