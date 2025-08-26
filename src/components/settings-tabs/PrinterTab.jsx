import React, { useEffect, useMemo, useState } from "react";

const BRIDGE = "http://127.0.0.1:7777";              // Local Beypro Bridge
const API_SETTINGS = "/api/printer-settings";        // Your existing settings route
const API_PRINT_RAW = "/api/lan-printers/print-raw"; // Already in your backend
const API_PRINT_TEST = "/api/lan-printers/print-test"; // Added above (optional)

// Simple helper
async function fetchJSON(url, init = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

export default function PrinterTab() {
  const [loading, setLoading] = useState(false);
  const [discover, setDiscover] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [scanAll, setScanAll] = useState(false);

  const [layout, setLayout] = useState({
    // your backend default fields exist; we add host/port fields into layout object
    shopAddress: "",
    receiptWidth: "80mm",
    fontSize: 14,
    lineHeight: 1.2,
    alignment: "left",
    // custom
    printerHost: "",
    printerPort: 9100,
  });

  const [selectedHost, setSelectedHost] = useState("");
  const [selectedPort, setSelectedPort] = useState(9100);

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [assistState, setAssistState] = useState({ tempIp: "", adapterAlias: "" });

  const subnetMismatch = discover?.subnetMismatch === true;
  const primaryBase = discover?.primaryBase ?? "";

  const currentPrinter = useMemo(() => {
    const p = printers.find((x) => x.host === selectedHost);
    return p || null;
  }, [printers, selectedHost]);

  function resetStatus() {
    setMsg("");
    setError("");
  }

  async function loadSettings() {
    try {
      const data = await fetchJSON(API_SETTINGS);
      const saved = data?.layout || {};
      setLayout((prev) => ({
        ...prev,
        ...saved,
        printerHost: saved.printerHost || "",
        printerPort: Number(saved.printerPort) || 9100,
      }));
      if (saved.printerHost) {
        setSelectedHost(saved.printerHost);
        setSelectedPort(Number(saved.printerPort) || 9100);
      }
      setMsg(`Loaded printer settings (${data?.source || "n/a"}).`);
    } catch (e) {
      setError("Failed to load printer settings.");
    }
  }

  async function saveSettings() {
    resetStatus();
    setLoading(true);
    try {
      const outgoing = {
        ...layout,
        printerHost: selectedHost || layout.printerHost || "",
        printerPort: Number(selectedPort || layout.printerPort || 9100),
      };
      await fetchJSON(API_SETTINGS, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: outgoing }),
      });
      setLayout(outgoing);
      setMsg("Printer settings saved ✅");
    } catch (e) {
      setError("Save failed. Check server logs for /api/printer-settings.");
    } finally {
      setLoading(false);
    }
  }

  async function pingBridge() {
    try {
      const res = await fetchJSON(`${BRIDGE}/ping`, {}, 3000);
      setMsg(`Bridge OK. Interfaces: ${res?.interfaces?.map((i) => i.address).join(", ") || "n/a"}`);
    } catch (e) {
      setError("Bridge not reachable. Please start Beypro Bridge on this computer.");
    }
  }

  async function doDiscover(all = false) {
    resetStatus();
    setLoading(true);
    try {
      const url = `${BRIDGE}/discover${all ? "?all=1" : ""}`;
      const data = await fetchJSON(url, {}, 20000);
      setDiscover(data);
      const list = (data?.results || [])
        .map((r) => ({
          host: r.host,
          ports: r.ports,
          sameSubnet: r.sameSubnet,
          base: r.base,
        }))
        .sort((a, b) => a.host.localeCompare(b.host));
      setPrinters(list);

      // preselect saved one if visible
      if (layout.printerHost) {
        const exists = list.find((x) => x.host === layout.printerHost);
        if (exists) {
          setSelectedHost(exists.host);
          setSelectedPort(exists.ports.includes(9100) ? 9100 : exists.ports[0] || 9100);
        }
      }

      if (!list.length) {
        if (data?.networks?.length) {
          setMsg(
            `No printers on ${data.primaryBase}. Networks: ` +
            data.networks.map((n) => `${n.name} (${n.address})`).join(", ")
          );
        } else {
          setMsg("No network interfaces detected.");
        }
      } else {
        setMsg(
          `Found ${list.length} device(s).` +
          (data.subnetMismatch ? " (Subnet mismatch detected — use Fix Network)" : "")
        );
      }
    } catch (e) {
      setError("Discovery failed. Check that Bridge is running and firewall allows local connections.");
    } finally {
      setLoading(false);
    }
  }

  async function fixNetworkWizard() {
    resetStatus();
    if (!selectedHost) {
      setError("Select a printer from the list first.");
      return;
    }
    setLoading(true);
    try {
      // 1) Add temp IP (Windows, admin)
      const addRes = await fetchJSON(`${BRIDGE}/assist/subnet/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: selectedHost }),
      }, 15000);

      setAssistState({ tempIp: addRes?.tempIp || "", adapterAlias: addRes?.adapterAlias || "" });
      setMsg(`Temporary IP ${addRes?.tempIp} added on ${addRes?.adapterAlias}. Opening printer web panel...`);

      // 2) Open printer UI for DHCP switch
      await fetchJSON(`${BRIDGE}/assist/subnet/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: selectedHost }),
      }, 5000);

      setMsg((m) => m + " Set IP Mode = DHCP in the printer UI, save & reboot. Then click Rescan.");
    } catch (e) {
      setError("Could not add temporary IP. Run Beypro Bridge as Administrator and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function cleanupTempIp() {
    resetStatus();
    if (!assistState.tempIp) {
      setMsg("No temporary IP to remove.");
      return;
    }
    setLoading(true);
    try {
      await fetchJSON(`${BRIDGE}/assist/subnet/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapterAlias: assistState.adapterAlias || undefined,
          tempIp: assistState.tempIp,
        }),
      }, 8000);
      setMsg(`Temporary IP ${assistState.tempIp} removed.`);
      setAssistState({ tempIp: "", adapterAlias: "" });
    } catch (e) {
      setError("Failed to remove temporary IP. Try running Bridge as Administrator.");
    } finally {
      setLoading(false);
    }
  }

  async function testPrint() {
    resetStatus();
    const host = selectedHost || layout.printerHost;
    const port = selectedPort || layout.printerPort || 9100;
    if (!host) {
      setError("Select a printer (or enter its IP) first.");
      return;
    }
    setLoading(true);
    try {
      // Prefer pretty test route if present; fall back to raw
      try {
        await fetchJSON(API_PRINT_TEST, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, port, title: "Beypro Test" }),
        }, 10000);
      } catch {
        await fetchJSON(API_PRINT_RAW, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, port, content: "*** BEYPRO TEST ***\n\nThank you!\n" }),
        }, 10000);
      }
      setMsg("Test print sent ✅");
    } catch (e) {
      setError("Test print failed. Ensure the printer listens on RAW 9100 and is reachable from this PC.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    pingBridge();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Printer</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DISCOVERY PANEL */}
        <div className="border rounded">
          <div className="p-2 border-b bg-gray-50 text-sm font-medium">
            Discover Printers on LAN
          </div>
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
                onClick={() => doDiscover(false)}
                disabled={loading}
              >
                {loading ? "Scanning…" : "Find Printers"}
              </button>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scanAll} onChange={(e) => setScanAll(e.target.checked)} />
                Scan all local networks (slow)
              </label>

              <button
                className="px-3 py-2 rounded border"
                onClick={() => doDiscover(scanAll)}
                disabled={loading}
              >
                Rescan
              </button>
            </div>

            {discover && (
              <div className="text-sm text-gray-700">
                <div>Primary subnet: <b>{primaryBase || "n/a"}</b></div>
                {!!discover?.networks?.length && (
                  <div>
                    Networks: {discover.networks.map((n) => `${n.name} ${n.address} (${n.base})`).join(" • ")}
                  </div>
                )}
                {subnetMismatch && (
                  <div className="mt-2 p-2 rounded bg-yellow-100 border border-yellow-300">
                    We found devices on a different subnet. Most users should reset the printer to DHCP.
                    If this is your printer, use <b>Fix Network</b> to temporarily reach its web page, set DHCP, then Rescan.
                  </div>
                )}
              </div>
            )}

            <div className="border rounded">
              <div className="p-2 border-b bg-gray-50 text-sm font-medium">Discovered Devices</div>
              <div className="p-2 space-y-2">
                {!printers.length && <div className="text-gray-500 text-sm">No devices found yet.</div>}
                {printers.map((p) => (
                  <label key={p.host} className="flex items-center justify-between px-2 py-2 rounded hover:bg-gray-50 border">
                    <div>
                      <div className="font-mono">{p.host}</div>
                      <div className="text-xs text-gray-600">
                        Ports: {p.ports.join(", ")} • Subnet: {p.base} {p.sameSubnet ? "(same)" : "(different)"}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="selPrinter"
                      checked={selectedHost === p.host}
                      onChange={() => {
                        setSelectedHost(p.host);
                        setSelectedPort(p.ports.includes(9100) ? 9100 : p.ports[0] || 9100);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                onClick={fixNetworkWizard}
                disabled={!selectedHost || loading}
              >
                Fix Network (Open Printer UI)
              </button>
              <button
                className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
                onClick={testPrint}
                disabled={loading || (!selectedHost && !layout.printerHost)}
              >
                Test Print
              </button>
              <button
                className="px-3 py-2 rounded border disabled:opacity-50"
                onClick={cleanupTempIp}
                disabled={!assistState.tempIp || loading}
              >
                Cleanup Temp IP
              </button>
            </div>
          </div>
        </div>

        {/* SETTINGS PANEL */}
        <div className="border rounded">
          <div className="p-2 border-b bg-gray-50 text-sm font-medium">Saved Settings</div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Printer IP</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={selectedHost || layout.printerHost}
                  onChange={(e) => {
                    setSelectedHost(e.target.value.trim());
                  }}
                  placeholder="e.g. 192.168.1.150"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Port</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={selectedPort || layout.printerPort || 9100}
                  onChange={(e) => setSelectedPort(Number(e.target.value || 9100))}
                  min={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Receipt Width</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={layout.receiptWidth}
                  onChange={(e) => setLayout({ ...layout, receiptWidth: e.target.value })}
                >
                  <option value="80mm">80mm</option>
                  <option value="58mm">58mm</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Font Size</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={layout.fontSize}
                  onChange={(e) => setLayout({ ...layout, fontSize: Number(e.target.value || 14) })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600">Shop Address (header)</label>
              <textarea
                className="w-full border rounded px-2 py-1"
                rows={3}
                value={layout.shopAddress}
                onChange={(e) => setLayout({ ...layout, shopAddress: e.target.value })}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
                onClick={saveSettings}
                disabled={loading}
              >
                Save Settings
              </button>
              <button
                className="px-3 py-2 rounded border disabled:opacity-50"
                onClick={() => {
                  setSelectedHost(layout.printerHost || "");
                  setSelectedPort(Number(layout.printerPort || 9100));
                  setMsg("Restored saved printer IP/port locally.");
                }}
              >
                Use Saved IP/Port
              </button>
            </div>

            {!!msg && <div className="p-2 rounded bg-green-50 border border-green-200 text-green-800">{msg}</div>}
            {!!error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-800">{error}</div>}

            <div className="text-xs text-gray-500">
              Note: Windows “Test Page” will not print on ESC/POS printers. Use the <b>Test Print</b> button here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
