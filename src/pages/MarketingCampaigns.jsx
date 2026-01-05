import React, { useState, useEffect, useRef } from "react";
import { Megaphone, Send, Users, Percent, BarChart, Mail } from "lucide-react";

import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useHeader } from "../context/HeaderContext";

const STATS_POLL_MS = 5000;   // poll every 5s
const STATS_POLL_MAX = 12;    // for up to 60s
function rate(n, d) {
  // percent with 1 decimal (e.g. 12.3%)
  if (!d || d <= 0) return null;         // return null so UI can show "—"
  return Math.round((n / d) * 1000) / 10;
}

// Add near the top of the component (helpers)
function mergeHistory(prev, listFromServer) {
  // Key by _id if present, else by date+subject+message
  const keyOf = (x) => x._id || `${x.date}|${x.subject}|${x.message}`;
  const map = new Map();
  // keep existing (optimistic rows included)
  for (const it of prev) map.set(keyOf(it), it);
  // overlay from server
  for (const s of listFromServer) map.set(keyOf(s), s);

  // Return newest first
  return Array.from(map.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
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
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const [whatsAppQR, setWhatsAppQR] = useState(null);
const [qrStatus, setQrStatus] = useState("idle");

  useEffect(() => {
    setHeader({ title: "Marketing Campaigns" });
    return () => setHeader({});
  }, [setHeader]);

async function fetchWhatsAppQR() {
  setQrStatus("loading");
  try {
    const res = await secureFetch("/campaigns/whatsapp/qr");
    if (res.qr) {
      setWhatsAppQR(res.qr);
      setQrStatus("ready");
    } else if (res.status === "ready") {
      setWhatsAppQR(null);
      setQrStatus("connected");
    } else {
      setWhatsAppQR(null);
      setQrStatus("waiting");
    }
  } catch (err) {
    console.error("❌ Failed to load QR:", err);
    setQrStatus("error");
  }
}
    // Fetch + apply stats (prefers /by/:cid, falls back to /last)
async function fetchAndApplyStats(cid) {
  try {
    // 🔹 always use secureFetch so JWT token is included
    let payload = null;

    if (cid) {
      try {
        payload = await secureFetch(`/campaigns/stats/by/${cid}`);
      } catch {
        payload = await secureFetch("/campaigns/stats/last");
      }
    } else {
      payload = await secureFetch("/campaigns/stats/last");
    }

    if (payload?.ok) {
      // 🔸 update global stats
      setStats((s) => ({
        ...s,
        lastOpen: Number.isFinite(payload.openRate)
          ? payload.openRate
          : s.lastOpen,
        lastClick: Number.isFinite(payload.clickRate)
          ? payload.clickRate
          : s.lastClick,
      }));

      // 🔸 reflect in table top row
      setHistory((prev) => {
        if (!prev.length) return prev;
        const [first, ...rest] = prev;
        return [
          {
            ...first,
            openRate: payload.openRate ?? first.openRate,
            clickRate: payload.clickRate ?? first.clickRate,
          },
          ...rest,
        ];
      });

      // 🔸 stop polling early if non-zero stats found
      if ((payload.openRate ?? 0) > 0 || (payload.clickRate ?? 0) > 0) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ Failed to fetch campaign stats:", err);
  }
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
// ---- Sticky merge helpers ----
function truthyStr(s) {
  return typeof s === "string" && s.trim().length > 0 ? s : "";
}

function stickyMergeHistory(prev, incoming) {
  // Key by campaign id when available; else by date+subject+message
  const keyOf = (r) => r._id || `${r.date}|${r.subject}|${r.message}`;

  const map = new Map();
  // seed with previous (keeps optimistic rows)
  for (const row of prev) {
    map.set(keyOf(row), row);
  }

  for (const row of incoming) {
    const k = keyOf(row);
    const old = map.get(k);

    if (!old) {
      map.set(k, row);
      continue;
    }

    // Preserve any previously known non-empty subject/message
    const subject = truthyStr(row.subject) || old.subject || "";
    const message = truthyStr(row.message) || old.message || "";

    // Prefer newer open/click rates if present
    const openRate = Number.isFinite(row.openRate) ? row.openRate : old.openRate;
    const clickRate = Number.isFinite(row.clickRate) ? row.clickRate : old.clickRate;

    // Prefer whichever has a concrete date (server date wins if present)
    const date = row.date || old.date;

    map.set(k, {
      ...old,
      ...row, // keep other incoming fields (type, etc.)
      date,
      subject,
      message,
      openRate,
      clickRate,
      _id: old._id || row._id, // keep id
    });
  }

  // newest first
  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return db - da;
  });
}

useEffect(() => {
  // ✅ Top counters (customers)
  fetchCustomerCount()
    .then((count) =>
      setStats((s) => ({ ...s, totalCustomers: count }))
    )
    .catch(() => {});

  // ✅ Keep top cards in sync with "last" campaign stats
 secureFetch("/campaigns/stats/last")
    .then((data) => {
      setStats((s) => ({
        ...s,
        lastOpen: data.openRate ?? s.lastOpen,
        lastClick: data.clickRate ?? s.lastClick,
      }));
    })
    .catch((err) =>
      console.warn("⚠️ Failed to fetch last campaign stats:", err)
    );

  // ✅ Load customers for WhatsApp selector
  fetchCustomers().catch(() => {});

  // ✅ Load recent campaigns (with rates)
 secureFetch("/campaigns/list")
    .then((res) => {
      if (res.ok && Array.isArray(res.campaigns)) {
            const rows = res.campaigns
              .filter((c) => c && c.id)
              .map((c) => ({
                date: c.sent_at ? String(c.sent_at).slice(0, 10) : "",
                type: c.channel || (c.text && !c.html ? "WhatsApp" : "Email"),
                subject: c.subject || "",
                message: c.message || "",
                openRate: Number.isFinite(c.openRate) ? c.openRate : 0,
                clickRate: Number.isFinite(c.clickRate) ? c.clickRate : 0,
                _id: String(c.id),
          }));

        // ✅ Merge into table
        setHistory((prev) => stickyMergeHistory(prev, rows));

        // ✅ Update top cards from latest campaign
        const latest = rows[0];
        if (latest) {
          setStats((s) => ({
            ...s,
            lastOpen: Number.isFinite(latest.openRate)
              ? latest.openRate
              : 0,
            lastClick: Number.isFinite(latest.clickRate)
              ? latest.clickRate
              : 0,
          }));
        }
      }
    })
    .catch((err) =>
      console.warn("⚠️ Failed to fetch campaign list:", err)
    );
}, []);





async function fetchCustomerCount() {
  const res = await secureFetch("/customers");
  // Handle both {data: [...]} or plain [...]
  const data = Array.isArray(res) ? res : res.data || [];
  return data.length || 0;
}

async function fetchCustomers() {
  const res = await secureFetch("/customers");
  // Handle both shapes safely
  const list = Array.isArray(res) ? res : res.data || [];

  // Only customers with phone, deduplicated by phone number
  const phoneMap = new Map();
  list.forEach((c) => {
    if (c.phone && !phoneMap.has(c.phone)) {
      phoneMap.set(c.phone, { name: c.name, phone: c.phone });
    }
  });

  const uniquePhoneCustomers = Array.from(phoneMap.values());
  setCustomers(uniquePhoneCustomers);
  setSelectedPhones(uniquePhoneCustomers.map((c) => c.phone)); // Select all by default
}


// 🔹 Fetch Customers (fixed for both array and {data:[]} formats)
async function fetchCustomers() {
  try {
    const res = await secureFetch("/customers");
    const list = Array.isArray(res) ? res : res.data || [];

    // Only customers with phone, deduplicated by phone number
    const phoneMap = new Map();
    list.forEach((c) => {
      if (c.phone && !phoneMap.has(c.phone)) {
        phoneMap.set(c.phone, { name: c.name, phone: c.phone });
      }
    });

    const uniquePhoneCustomers = Array.from(phoneMap.values());
    setCustomers(uniquePhoneCustomers);
    setSelectedPhones(uniquePhoneCustomers.map((c) => c.phone)); // Select all by default

    if (uniquePhoneCustomers.length === 0) {
      console.warn("⚠️ No customers found in database for this restaurant.");
    }
  } catch (err) {
    console.error("❌ Failed to fetch customers:", err);
  }
}

// 🔹 Send Email Campaign (robust error handling + fallback-safe)
async function sendCampaign() {
  if (!message || !subject) return;
  setSending(true);

  try {
    if (primaryUrl && !/^https?:\/\//i.test(primaryUrl)) {
      alert(t("Tracked link must start with http:// or https://"));
      setSending(false);
      return;
    }

    const data = await secureFetch("/campaigns/email", {
      method: "POST",
      body: JSON.stringify({
        subject,
        body: message,
        primary_url: primaryUrl || undefined,
      }),
    });

    // Optimistic history update
    setHistory((prev) => [
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

    // Start polling campaign stats
    if (data?.campaignId) startStatsPolling(data.campaignId);

    // Fetch latest campaign list shortly after
    setTimeout(() => {
     secureFetch("/campaigns/list")
        .then((res) => {
          const list = res?.campaigns || res?.data?.campaigns || [];
          if (Array.isArray(list)) {
            const rows = list
              .filter((c) => c && c.id)
              .map((c) => ({
                date: c.sent_at ? String(c.sent_at).slice(0, 10) : "",
                type: c.channel || (c.text && !c.html ? "WhatsApp" : "Email"),
                subject: c.subject || "",
                message: c.message || "",
                openRate: Number.isFinite(c.openRate) ? c.openRate : 0,
                clickRate: Number.isFinite(c.clickRate) ? c.clickRate : 0,
                _id: String(c.id),
              }));

            setHistory((prev) => {
              const merged = stickyMergeHistory(prev, rows);
              const latest = merged[0];
              if (latest) {
                setStats((s) => ({
                  ...s,
                  lastOpen: Number.isFinite(latest.openRate)
                    ? latest.openRate
                    : 0,
                  lastClick: Number.isFinite(latest.clickRate)
                    ? latest.clickRate
                    : 0,
                }));
              }
              return merged;
            });
          }
        })
        .catch((err) =>
          console.warn("⚠️ Failed to refresh campaign list:", err)
        );
    }, 3000);

    // Reset inputs
    setMessage("");
    setSubject("");
    setPrimaryUrl("");
  } catch (e) {
    console.error("❌ Campaign send failed:", e);
    alert(t("Failed to send campaign!"));
  }

  setSending(false);
}

// 🔹 Send WhatsApp Campaign (safe + consistent)
async function sendWhatsAppCampaign() {
  if (!message) return;
  setSending(true);

  try {
    const result = await secureFetch("/campaigns/whatsapp", {
      method: "POST",
      body: JSON.stringify({
        body: message,
        phones: selectedPhones,
        subject: subject || undefined,
        primary_url: primaryUrl || undefined,
      }),
    });

    if (result.failed > 0) {
      alert(
        t("WhatsApp campaign sent with {{count}} failures. Check console for details.", {
          count: result.failed,
        })
      );
    } else {
      alert(`✅ ${t("WhatsApp campaign sent!")}`);
    }

    setHistory((prev) => [
      {
        date: new Date().toISOString().slice(0, 10),
        type: "WhatsApp",
        subject: subject || t("WhatsApp Campaign"),
        message,
        openRate: 0,
        clickRate: 0,
      },
      ...prev,
    ]);

    setMessage("");
  } catch (e) {
    console.error("❌ WhatsApp campaign send failed:", e);
    alert(t("Failed to send WhatsApp campaign!"));
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
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white mb-1 text-center">
            {t("Boost Sales with Email & WhatsApp Campaigns")}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 text-center mb-2">
            {t(
              "Instantly reach your customers with stunning email and WhatsApp promotions."
            )}{" "}
            <br />
            <span className="font-semibold text-orange-600">
              {t("Send, track, and grow your restaurant loyalty.")}
            </span>
          </p>
        </div>
        {/* Stats */}
        <div className="flex gap-4 mb-10 justify-center">
          <StatCard
            icon={<Users />}
            label={t("Total Customers")}
            value={stats.totalCustomers}
            color="from-blue-500 to-blue-700"
          />
          <StatCard
            icon={<Percent />}
            label={t("Last Open Rate")}
            value={Number.isFinite(stats.lastOpen) ? `${stats.lastOpen}%` : "—"}
            color="from-green-400 to-green-600"
          />
          <StatCard
            icon={<BarChart />}
            label={t("Last Click Rate")}
            value={Number.isFinite(stats.lastClick) ? `${stats.lastClick}%` : "—"}
            color="from-yellow-400 to-yellow-600"
          />
        </div>
        {/* Email/WhatsApp Campaign Form */}
        <div className="bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-xl border border-orange-200 dark:border-zinc-800 p-8 mb-8 flex flex-col gap-3">
          <h2 className="text-xl font-extrabold mb-2 flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-600" /> {t("New Campaign")}
          </h2>
          <input
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-1 shadow focus:ring-2 focus:ring-blue-400 font-semibold transition"
            type="text"
            value={subject}
            placeholder={t("Email Subject")}
            onChange={e => setSubject(e.target.value)}
            disabled={sending}
            maxLength={80}
          />

          {/* NEW: Tracked link (CTA) */}
          <input
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-1 shadow focus:ring-2 focus:ring-blue-400 font-semibold transition"
            type="url"
            value={primaryUrl}
            placeholder={t("Tracked link (e.g. https://www.beypro.com/)")}
            onChange={e => setPrimaryUrl(e.target.value)}
            disabled={sending}
          />

          <textarea
            className="w-full rounded-xl border border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 mb-3 shadow focus:ring-2 focus:ring-orange-400 font-semibold transition resize-none"
            rows={3}
            value={message}
            placeholder={t(
              "Type your campaign message… (links inside your message are also tracked)"
            )}
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
                {selectedPhones.length === customers.length
                  ? t("Unselect All")
                  : t("Select All")}
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t("{{selected}} / {{total}} selected for WhatsApp", {
                  selected: selectedPhones.length,
                  total: customers.length,
                })}
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
              <Send className="inline w-5 h-5 mr-1 -mt-1" />{" "}
              {sending ? t("Sending…") : t("Send Email")}
            </button>
            <button
              className="px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold shadow hover:bg-green-700 transition disabled:opacity-70"
              disabled={sending || !message || selectedPhones.length === 0}
              onClick={sendWhatsAppCampaign}
            >
              <Send className="inline w-5 h-5 mr-1 -mt-1" />{" "}
              {sending ? t("Sending…") : t("Send WhatsApp")}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("Will send to all checked customers with WhatsApp.")}
            </span>
          </div>
        </div>
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 mb-8 text-center">
      <h2 className="text-xl font-bold mb-3 flex items-center justify-center gap-2">
        <span>📱 {t("WhatsApp Connection")}</span>
        <button
          onClick={fetchWhatsAppQR}
          className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
        >
          {t("Refresh")}
        </button>
      </h2>

      {qrStatus === "connected" && (
        <p className="text-green-600 font-semibold">✅ {t("WhatsApp Connected!")}</p>
      )}
      {qrStatus === "waiting" && (
        <p className="text-yellow-500 font-semibold">⏳ {t("Waiting for QR code...")}</p>
      )}
      {qrStatus === "error" && (
        <p className="text-red-500 font-semibold">❌ {t("Failed to fetch QR.")}</p>
      )}
      {whatsAppQR && (
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
            whatsAppQR
          )}&size=200x200`}
          alt={t("WhatsApp QR")}
          className="mx-auto my-3 border rounded-xl shadow-md"
        />
      )}
    </div>
  

        {/* Recent Campaigns */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">{t("Recent Campaigns")}</h2>
          <button
            onClick={async () => {
              if (
                window.confirm(
                  t(
                    "Are you sure you want to delete all campaigns from database? This cannot be undone."
                  )
                )
              ) {
                try {
                  const res = await secureFetch("/campaigns/clear-all", {
                    method: "DELETE",
                  });
                  if (res.ok) {
                    alert(
                      `✅ ${t("{{count}} campaigns cleared successfully.", {
                        count: res.deleted,
                      })}`
                    );
                    setHistory([]);
                  } else {
                    alert(
                      `❌ ${t("Failed to clear campaigns: {{error}}", {
                        error: res.error || "",
                      })}`
                    );
                  }
                } catch (err) {
                  console.error("❌ Clear campaigns failed:", err);
                  alert(t("Error clearing campaigns."));
                }
              }
            }}
            className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg shadow transition"
          >
            {t("Clear Campaigns")}
          </button>
        </div>

        <div className="bg-white/85 dark:bg-zinc-900/80 border border-orange-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mb-8">
          {history.length === 0 ? (
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-6">
              {t("Send your first email or WhatsApp blast to see it appear here.")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-orange-50/80 dark:bg-zinc-800/70 text-left text-gray-600 dark:text-gray-300 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3">{t("Date")}</th>
                  <th className="px-4 py-3">{t("Type")}</th>
                  <th className="px-4 py-3">{t("Subject / Message")}</th>
                  <th className="px-4 py-3 text-center">{t("Open %")}</th>
                  <th className="px-4 py-3 text-center">{t("Click %")}</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 12).map((row, idx) => {
                  const key = row._id || `${row.date}-${idx}`;
                  const summary =
                    row.subject?.trim() ||
                    row.message?.trim() ||
                    (row.type === "Email" ? t("Email campaign") : t("WhatsApp blast"));
                  const displayType =
                    row.type === "Email"
                      ? t("Email")
                      : row.type === "WhatsApp"
                        ? t("WhatsApp")
                        : row.type || "—";
                  return (
                    <tr
                      key={key}
                      className="border-t border-orange-100/70 dark:border-zinc-800/80 hover:bg-orange-50/60 dark:hover:bg-zinc-800/60 transition"
                    >
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {row.date || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            row.type === "Email"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                              : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                          }`}
                        >
                          {displayType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-[220px] truncate">
                        {summary}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                        {Number.isFinite(row.openRate) ? `${row.openRate}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                        {Number.isFinite(row.clickRate) ? `${row.clickRate}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>


        {/* Footer */}
        <div className="mt-7 text-sm text-gray-400 text-center">
          <span className="font-semibold">{t("Beypro Marketing")}</span> —{" "}
          {t("Reach every customer, fill every table.")}
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
