import React, { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "react-toastify";

// If you already centralize your API base, you can replace this with your helper
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// --- Helpers ---------------------------------------------------------------
const emailRegex = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/i;

function parseRecipients(input) {
  return input
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateRecipients(list) {
  const bad = list.filter((e) => !emailRegex.test(e));
  return { ok: bad.length === 0, bad };
}

const TEMPLATES = [
  {
    id: "blank",
    name: "Blank",
    subject: "",
    html: "",
  },
  {
    id: "new-burger",
    name: "🍔 New Burger Launch",
    subject: "Meet our new smashburger!",
    html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta charset="utf-8" />
    <title>Beypro Campaign</title>
  </head>
  <body style="margin:0;background:#0b1220;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#111b2e;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:24px 24px 0 24px;text-align:center;">
          <h1 style="margin:0;font-size:28px;">🔥 New Smashburger Alert</h1>
          <p style="opacity:.9;margin:8px 0 0 0;">Crispy edges, melty cheese, and a toasted bun.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px 24px;">
          <div style="background:#18243a;border-radius:12px;padding:16px;">
            <p style="margin:0 0 12px 0;">Limited-time offer: <strong>20% off</strong> today only.</p>
            <a href="https://beypro.com" style="display:inline-block;padding:12px 16px;background:#4f46e5;border-radius:10px;color:#fff;text-decoration:none;">Order Now</a>
          </div>
          <p style="margin:16px 0 0 0;font-size:12px;opacity:.7;">You are receiving this because you visited us recently. Unsubscribe anytime.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  },
  {
    id: "promo",
    name: "% Discount Promo",
    subject: "Today only — save big at Hurrybey!",
    html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta charset="utf-8" />
    <title>Beypro Campaign</title>
  </head>
  <body style="margin:0;background:#ffffff;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:24px 24px 0 24px;">
          <h1 style="margin:0 0 8px 0;font-size:26px;">% İndirim Fırsatı</h1>
          <p style="margin:0;color:#4b5563">Bugüne özel kampanya — kaçırma!</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px 24px;">
          <p style="margin:0 0 12px 0;">Kasada <strong>KOD: BEYPRO20</strong> kullan.</p>
          <a href="https://beypro.com" style="display:inline-block;padding:12px 16px;background:#111827;border-radius:10px;color:#fff;text-decoration:none;">Sipariş Ver</a>
          <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280">Aboneliği iptal etmek için bu e-postayı yanıtlayabilir veya profilinden çıkış yapabilirsin.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  },
];

// --- Component ------------------------------------------------------------
export default function MarketingCampaigns() {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [toList, setToList] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Beypro");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("blank");

  // derive recipients
  const recipients = useMemo(() => parseRecipients(toList), [toList]);

  useEffect(() => {
    // Load template on first mount or when changed
    const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (tpl) {
      if (tpl.subject !== undefined) setSubject(tpl.subject);
      if (tpl.html !== undefined) setHtml(tpl.html);
    }
  }, [selectedTemplate]);

  const handleSend = useCallback(async () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject.");
      return;
    }
    if (!html.trim()) {
      toast.error("Please enter HTML content.");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Please add at least one recipient.");
      return;
    }
    const { ok, bad } = validateRecipients(recipients);
    if (!ok) {
      toast.error(`Invalid recipient(s): ${bad.join(", ")}`);
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          html,
          recipients,
          fromEmail: fromEmail || undefined,
          fromName: fromName || undefined,
          campaignId: "marketing-campaigns-ui",
        }),
      });

      // Read text first to guard against HTML error pages
      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || `HTTP ${res.status} (non-JSON)`);
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast.success(`Sent ${data.sent} email(s).`);
    } catch (err) {
      toast.error(`Send failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  }, [subject, html, recipients, fromEmail, fromName]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Marketing Campaigns</h1>
        <p className="text-sm text-gray-500">Compose and send simple email campaigns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Composer */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium mb-1">Template</label>
              <select
                className="w-full border rounded-lg p-2 bg-white"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium mb-1">From Name</label>
              <input
                className="w-full border rounded-lg p-2"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Beypro"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium mb-1">From Email (optional)</label>
              <input
                className="w-full border rounded-lg p-2"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="no-reply@beypro.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Recipients</label>
            <textarea
              className="w-full border rounded-lg p-2 h-24"
              value={toList}
              onChange={(e) => setToList(e.target.value)}
              placeholder="one@domain.com, two@domain.com or newline separated"
            />
            <div className="text-xs text-gray-500 mt-1">{recipients.length} recipient(s)</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              className="w-full border rounded-lg p-2"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your campaign subject"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">HTML</label>
            <textarea
              className="w-full border rounded-lg p-2 h-64 font-mono"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="Paste or write HTML here"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">Tracking pixel is injected server-side when configured.</span>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send Campaign"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Preview</h2>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(html).then(
                  () => toast.success("HTML copied"),
                  () => toast.error("Copy failed")
                );
              }}
              className="text-sm px-3 py-1 rounded border"
            >
              Copy HTML
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white">
            {/* Using sandboxed iframe-like preview with srcDoc approach is not available directly here; using div */}
            <div className="p-0">
              <div
                className="min-h-[400px]"
                style={{ background: "#f8fafc" }}
                dangerouslySetInnerHTML={{ __html: html || "<div style='padding:16px;color:#64748b'>No content</div>" }}
              />
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Tip: Real inboxes may render emails differently. Keep layout simple (tables, inline styles) for best compatibility.
          </div>
        </div>
      </div>
    </div>
  );
}
