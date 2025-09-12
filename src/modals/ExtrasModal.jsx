// ExtrasModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { X, Check, Loader2, AlertCircle } from "lucide-react";
// ⬇️ Adjust this import to your project. If you don't have it, use the fallback below.
import { EXTRAS_GROUPS_API as API_FROM_UTILS } from "../utils/api";
import { toast } from "react-toastify";

const FALLBACK_API =
  (typeof window !== "undefined" &&
    `${window.location.origin.replace(/\/$/, "")}/api/extras-groups`) ||
  "/api/extras-groups";

const EXTRAS_GROUPS_API = API_FROM_UTILS || FALLBACK_API;

export default function ExtrasModal({
  isOpen,
  onClose,
  onConfirm, // (selectedItems) => void
  defaultSelected = [], // [{id, name, price}] optional
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [groups, setGroups] = useState([]); // [{id, group_name, items:[{id,name,price}]}]
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [selected, setSelected] = useState(() => {
    // Map for O(1) membership checks
    const m = new Map();
    for (const it of defaultSelected) m.set(String(it.id), it);
    return m;
  });

  // Fetch when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;

    (async () => {
      setErr("");
      setLoading(true);
      try {
        const res = await fetch(EXTRAS_GROUPS_API, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `GET ${EXTRAS_GROUPS_API} ${res.status} ${res.statusText} ${text}`
          );
        }
        const data = await res.json();
        if (ignore) return;

        const normalized = Array.isArray(data) ? data : [];
        setGroups(normalized);
        // Auto-select first group tab
        if (normalized.length && !activeGroupId) {
          setActiveGroupId(normalized[0].id);
        }
      } catch (e) {
        const msg = e?.message || "Failed to fetch extras groups";
        setErr(msg);
        toast.error(`Extras yüklenemedi: ${msg}`);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
    // re-fetch every time it opens so you see latest groups/items
  }, [isOpen]);

  const activeGroup = useMemo(
    () => groups.find((g) => String(g.id) === String(activeGroupId)) || null,
    [groups, activeGroupId]
  );

  const toggleItem = (item) => {
    const key = String(item.id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  };

  const confirm = () => {
    onConfirm?.(Array.from(selected.values()));
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-[min(100%,980px)] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-xl font-semibold">Choose Extras</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex">
          {/* Left: Groups */}
          <div className="w-56 border-r p-3 overflow-auto max-h-[65vh]">
            {loading && (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="animate-spin" size={18} />
                Loading extras…
              </div>
            )}
            {!!err && (
              <div className="flex items-start gap-2 text-red-600 text-sm">
                <AlertCircle size={18} />
                <span>Failed to fetch extras.</span>
              </div>
            )}

            {!loading && !err && groups.length === 0 && (
              <div className="text-gray-500 text-sm">No extras groups.</div>
            )}

            {!loading &&
              !err &&
              groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className={`block w-full text-left px-3 py-2 rounded-xl mb-2 border ${
                    String(activeGroupId) === String(g.id)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {g.group_name}
                </button>
              ))}
          </div>

          {/* Right: Items */}
          <div className="flex-1 p-4 overflow-auto max-h-[65vh]">
            {activeGroup ? (
              <div>
                <h4 className="font-semibold mb-3">
                  {activeGroup.group_name}
                </h4>
                {(!activeGroup.items || activeGroup.items.length === 0) && (
                  <div className="text-gray-500 text-sm">
                    No items in this group.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeGroup.items?.map((it) => {
                    const checked = selected.has(String(it.id));
                    return (
                      <label
                        key={it.id}
                        className={`flex items-center justify-between gap-3 border rounded-xl px-3 py-2 cursor-pointer ${
                          checked ? "border-blue-400 bg-blue-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(it)}
                            className="h-4 w-4"
                          />
                          <div>
                            <div className="font-medium">{it.name}</div>
                            <div className="text-sm text-gray-500">
                              {Number(it.price || 0).toFixed(2)} ₺
                            </div>
                          </div>
                        </div>
                        {checked && <Check className="text-blue-600" size={18} />}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">
                Select a group on the left.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t">
          <div className="text-sm text-gray-600">
            Selected: {selected.size} item{selected.size !== 1 ? "s" : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
            >
              Add Extras
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
