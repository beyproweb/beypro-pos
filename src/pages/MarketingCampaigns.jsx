import React, { useState, useEffect, useRef } from "react";
import { Megaphone, Send, Users, Percent, BarChart, Mail } from "lucide-react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATS_POLL_MS = 5000;   // poll every 5s
const STATS_POLL_MAX = 12;    // for up to 60s
function rate(n, d) {
  // percent with 1 decimal (e.g. 12.3%)
  if (!d || d <= 0) return null;         // return null so UI can show "—"
  return Math.round((n / d) * 1000) / 10;
}


function normalizeCampaign(c = {}) {
  // handle provider naming differences
  const delivered =
    c.delivered ??
    (typeof c.sent === "number"
      ? c.sent - (c.bounced ?? 0) - (c.spam ?? 0)
      : c.total_delivered ?? c.success ?? 0);

  return {
    ...c,
    delivered,
    opens_unique:
      c.opens_unique ?? c.unique_opens ?? c.opens_unique_count ?? c.opens ?? 0,
    clicks_unique:
      c.clicks_unique ?? c.unique_clicks ?? c.clicks_unique_count ?? c.clicks ?? 0,
    sent_at: c.sent_at ?? c.created_at ?? c.started_at ?? c.date ?? null,
  };
}

function pickLastCompleted(list = []) {
  return [...list]
    .map(normalizeCampaign)
    .filter(c => (c.delivered ?? 0) > 0 && c.sent_at)
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
}
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Minimal CTA block (keeps your existing design)
function buildCtaBlock(url, text = "Open") {
  return `
  <div style="text-align:center;margin:24px 0">
    <a href="${url}" target="_blank" rel="noopener"
       style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;
              border-radius:10px;text-decoration:none;font-weight:600">
      ${escapeHtml(text)}
    </a>
  </div>`;
}

// Append CTA block just before </body> if present; otherwise at the end.
function appendCta(html = "", url, text) {
  const block = buildCtaBlock(url, text);
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, block + "</body>");
  }
  return html + block;
}

export default function EmailCampaignLanding() {
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [primaryUrl, setPrimaryUrl] = useState(""); // ← tracked CTA link
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalCustomers: 0, lastOpen: 0, lastClick: 0 });
  const pollRef = useRef(null);
  const pollCountRef = useRef(0);
  // WhatsApp customer selection state
  const [customers, setCustomers] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState([]);


  +  // Fetch + apply stats (prefers /by/:cid, falls back to /last)
  async function fetchAndApplyStats(cid) {
    try {
      let payload = null;
      if (cid) {
        try {
          const res = await axios.get(`${API_URL}/api/campaigns/stats/by/${cid}`);
          payload = res.data;
        } catch {
          const res = await axios.get(`${API_URL}/api/campaigns/stats/last`);
          payload = res.data;
        }
      } else {
        const res = await axios.get(`${API_URL}/api/campaigns/stats/last`);
        payload = res.data;
      }
      if (payload?.ok) {
        setStats(s => ({
          ...s,
          lastOpen: Number.isFinite(payload.openRate) ? payload.openRate : s.lastOpen,
          lastClick: Number.isFinite(payload.clickRate) ? payload.clickRate : s.lastClick,
        }));
        // also reflect in the top row of the table
        setHistory(prev => {
          if (!prev.length) return prev;
          const [first, ...rest] = prev;
          return [{
            ...first,
            openRate: payload.openRate ?? first.openRate,
            clickRate: payload.clickRate ?? first.clickRate,
          }, ...rest];
        });
        // stop early if we have any non-zero rate
        if ((payload.openRate ?? 0) > 0 || (payload.clickRate ?? 0) > 0) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }
    } catch {}
  }

  function startStatsPolling(cid) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      await fetchAndApplyStats(cid);
      if (pollCountRef.current >= STATS_POLL_MAX) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, STATS_POLL_MS);
  }

useEffect(() => {
  // top counters
  fetchCustomerCount().then(count =>
    setStats(s => ({ ...s, totalCustomers: count }))
  );

  // keep top cards (Last Open/Click) in sync with "last" endpoint
  fetch(`${API_URL}/api/campaigns/stats/last`)
    .then(res => res.json())
    .then(data => {
      setStats(s => ({
        ...s,
        lastOpen: data.openRate ?? s.lastOpen,
        lastClick: data.clickRate ?? s.lastClick
      }));
    })
    .catch(() => {});

  // load customers for WhatsApp selector
  fetchCustomers().catch(() => {});

  // NEW: fetch campaign list (with open/click rates for each row)
  axios.get(`${API_URL}/api/campaigns/list`)
    .then(res => {
      if (res.data?.ok && Array.isArray(res.data.campaigns)) {
        setHistory(
          res.data.campaigns.map(c => ({
            date: c.sent_at ? String(c.sent_at).slice(0,10) : "",
            type: "Email",
            subject: c.subject,
            message: c.message,
            openRate: Number.isFinite(c.openRate) ? c.openRate : 0,
            clickRate: Number.isFinite(c.clickRate) ? c.clickRate : 0,
            _id: c.id, // keep internal id if needed
          }))
        );
      } else {
        setHistory([]);
      }
    })
    .catch(() => {});

}, []);


  async function fetchCustomerCount() {
    const res = await axios.get(`${API_URL}/api/customers`);
    return res.data.length || 0;
  }

  async function fetchCustomers() {
    const res = await axios.get(`${API_URL}/api/customers`);
    // Only customers with phone, deduplicated by phone number
    const phoneMap = new Map();
    res.data.forEach(c => {
      if (c.phone && !phoneMap.has(c.phone)) {
        phoneMap.set(c.phone, { name: c.name, phone: c.phone });
      }
    });
    const uniquePhoneCustomers = Array.from(phoneMap.values());
    setCustomers(uniquePhoneCustomers);
    setSelectedPhones(uniquePhoneCustomers.map(c => c.phone)); // Select all by default
  }

async function sendCampaign() {
  if (!message || !subject) return;
  setSending(true);
  try {
    if (primaryUrl && !/^https?:\/\//i.test(primaryUrl)) {
      alert("Tracked link must start with http:// or https://");
      setSending(false);
      return;
    }
    const { data } = await axios.post(`${API_URL}/api/campaigns/email`, {
      subject,
      body: message,
      // ↓↓↓ tracked CTA link goes to backend; it becomes the big button and is click-tracked
      primary_url: primaryUrl || undefined,
    });

    // Optimistically prepend the new campaign row at 0% / 0%
    setHistory(prev => [
      {
        date: new Date().toISOString().slice(0, 10),
        type: "Email",
        subject,
        message,
        openRate: 0,
        clickRate: 0,
        _id: data?.campaignId || undefined,
      },
      ...prev,
    ]);

    // Start polling stats for THIS campaign (updates top cards and first row via fetchAndApplyStats)
    if (data?.campaignId) {
      startStatsPolling(data.campaignId);
    }

    // Clear inputs
    setMessage("");
    setSubject("");
    setPrimaryUrl("");
  } catch (e) {
    alert("Failed to send campaign!");
  }
  setSending(false);
}


  async function sendWhatsAppCampaign() {
    if (!message) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/api/campaigns/whatsapp`, {
        body: message,
        phones: selectedPhones,
      });
      setHistory([
        { date: new Date().toISOString().slice(0, 10), type: "WhatsApp", message, openRate: 0, clickRate: 0 },
        ...history,
      ]);
      setMessage("");
    } catch (e) {
      alert("Failed to send WhatsApp campaign!");
    }
    setSending(false);
  }

  function handleSelectAll() {
    if (selectedPhones.length === customers.length) {
      setSelectedPhones([]); // Unselect all
    } else {
      setSelectedPhones(customers.map(c => c.phone)); // Select all
    }
  }

  function handleSelectOne(phone) {
    setSelectedPhones(phones =>
      phones.includes(phone)
        ? phones.filter(p => p !== phone)
        : [...phones, phone]
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-orange-50 via-white to-blue-50 dark:from-zinc-900 dark:via-zinc-950 dark:to-blue-900 py-10">
      <div className="max-w-3xl mx-auto px-5">
        {/* Hero */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="bg-orange-500/90 p-3 rounded-full shadow-xl mb-2">
            <Megaphone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white mb-1 text-center">Boost Sales with Email & WhatsApp Campaigns</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 text-center mb-2">
            Instantly reach your customers with stunning email and WhatsApp promotions. <br />
            <span className="font-semibold text-orange-600">Send, track, and grow your restaurant loyalty.</span>
          </p>
        </div>
        {/* Stats */}
        <div className="flex gap-4 mb-10 justify-center">
          <StatCard icon={<Users />} label="Total Customers" value={stats.totalCustomers} color="from-blue-500 to-blue-700" />
          <StatCard
            icon={<Percent />}
            label="Last Open Rate"
            value={Number.isFinite(stats.lastOpen) ? `${stats.lastOpen}%` : "—"}
            color="from-green-400 to-green-600"
          />
          <StatCard
            icon={<BarChart />}
            label="Last Click Rate"
            value={Number.isFinite(stats.lastClick) ? `${stats.lastClick}%` : "—"}
            color="from-yellow-400 to-yellow-600"
          />
        </div>
        {/* Email/WhatsApp Campaign Form */}
        <div className="bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-xl border border-orange-200 dark:border-zinc-800 p-8 mb-8 flex flex-col gap-3">
          <h2 className="text-xl font-extrabold mb-2 flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-600" /> New Campaign
          </h2>
          <input
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-1 shadow focus:ring-2 focus:ring-blue-400 font-semibold transition"
            type="text"
            value={subject}
            placeholder="Email Subject"
            onChange={e => setSubject(e.target.value)}
            disabled={sending}
            maxLength={80}
          />

          {/* NEW: Tracked link (CTA) */}
          <input
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-1 shadow focus:ring-2 focus:ring-blue-400 font-semibold transition"
            type="url"
            value={primaryUrl}
            placeholder="Tracked link (e.g. https://www.beypro.com/)"
            onChange={e => setPrimaryUrl(e.target.value)}
            disabled={sending}
          />

          <textarea
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-3 shadow focus:ring-2 focus:ring-orange-400 font-semibold transition resize-none"
            rows={3}
            value={message}
            placeholder="Type your campaign message… (links inside your message are also tracked)"
            onChange={e => setMessage(e.target.value)}
            disabled={sending}
            maxLength={400}
          />

          {/* WhatsApp Customer Selector */}
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-1">
              <button
                className="px-3 py-1 rounded bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-white text-xs font-bold"
                onClick={handleSelectAll}
                type="button"
              >
                {selectedPhones.length === customers.length ? "Unselect All" : "Select All"}
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {selectedPhones.length} / {customers.length} selected for WhatsApp
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto border rounded bg-orange-50 dark:bg-zinc-900 p-2">
              {customers.map((c) => (
                <label key={c.phone} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPhones.includes(c.phone)}
                    onChange={() => handleSelectOne(c.phone)}
                  />
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{c.phone}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <button
              className="px-6 py-2.5 rounded-xl bg-orange-600 text-white font-bold shadow hover:bg-orange-700 transition disabled:opacity-70"
              disabled={sending || !message || !subject}
              onClick={sendCampaign}
            >
              <Send className="inline w-5 h-5 mr-1 -mt-1" /> {sending ? "Sending…" : "Send Email"}
            </button>
            <button
              className="px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold shadow hover:bg-green-700 transition disabled:opacity-70"
              disabled={sending || !message || selectedPhones.length === 0}
              onClick={sendWhatsAppCampaign}
            >
              <Send className="inline w-5 h-5 mr-1 -mt-1" /> {sending ? "Sending…" : "Send WhatsApp"}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Will send to all checked customers with WhatsApp.
            </span>
          </div>
        </div>
        {/* Recent Campaigns */}
        <div>
          <h2 className="font-bold mb-2 text-lg">Recent Campaigns</h2>
          <div className="overflow-x-auto rounded-2xl shadow bg-white dark:bg-zinc-900/70 border border-orange-100 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-orange-100 dark:border-zinc-700">
                  <th className="py-2 px-3 font-bold">Date</th>
                  <th className="py-2 px-3 font-bold">Type</th>
                  <th className="py-2 px-3 font-bold">Subject</th>
                  <th className="py-2 px-3 font-bold">Message</th>
                  <th className="py-2 px-3 font-bold">Open Rate</th>
                  <th className="py-2 px-3 font-bold">Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-gray-400">No campaigns yet</td></tr>
                ) : history.map((c, i) => (
                  <tr key={i} className="border-b border-orange-50 dark:border-zinc-800 hover:bg-orange-50/60 dark:hover:bg-zinc-800/30 transition">
                    <td className="py-2 px-3">{c.date}</td>
                    <td className="py-2 px-3">{c.type}</td>
                    <td className="py-2 px-3">{c.subject}</td>
                    <td className="py-2 px-3">{c.message}</td>
                    <td className="py-2 px-3">{c.openRate ? `${c.openRate}%` : "—"}</td>
                    <td className="py-2 px-3">{c.clickRate ? `${c.clickRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Footer */}
        <div className="mt-7 text-sm text-gray-400 text-center">
          <span className="font-semibold">Beypro Marketing</span> — Reach every customer, fill every table.
        </div>
      </div>
    </div>
  );
}

// Stats Card
function StatCard({ icon, label, value, color }) {
  return (
    <div className={`flex flex-col items-center min-w-[110px] rounded-xl bg-gradient-to-br ${color} text-white shadow-lg px-4 py-2`}>
      <span className="mb-1">{icon}</span>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
