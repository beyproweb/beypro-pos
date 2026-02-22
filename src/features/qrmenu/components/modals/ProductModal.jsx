import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "../../../../context/CurrencyContext";

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
};

const ProductModal = React.memo(function ProductModal({
  open,
  product,
  extrasGroups,
  onClose,
  onAddToCart,
  t,
  apiUrl,
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [note, setNote] = useState("");
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev || "");
  }, [open]);

  useEffect(() => {
    if (!open || !product) return;
    setQuantity(1);
    setSelectedExtras([]);
    setNote("");
    setActiveGroupIdx(0);
  }, [open, product]);

  if (!open || !product) return null;

  const basePrice = parseFloat(product.price) || 0;

  const normalizedGroups = toArray(extrasGroups).map((g) => ({
    id: g.id,
    groupName: g.groupName || g.group_name,
    items: Array.isArray(g.items)
      ? g.items
      : (() => {
          try {
            const parsed = JSON.parse(g.items || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
  }));

  const productGroupIds = toArray(product?.selectedExtrasGroup)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  let availableGroups = [];
  if (productGroupIds.length > 0) {
    availableGroups = toArray(normalizedGroups).filter((g) =>
      productGroupIds.includes(Number(g.id))
    );
  }

  if (
    availableGroups.length === 0 &&
    Array.isArray(product?.extras) &&
    product.extras.length > 0
  ) {
    availableGroups = [
      {
        id: "manual",
        groupName: "Extras",
        items: product.extras.map((ex, idx) => ({
          id: idx,
          name: ex.name,
          price: Number(ex.extraPrice || ex.price || 0),
          unit: ex.unit || "",
          amount:
            ex.amount !== undefined && ex.amount !== null && ex.amount !== ""
              ? Number(ex.amount)
              : 1,
        })),
      },
    ];
  }

  const priceOf = (exOrItem) =>
    parseFloat(exOrItem?.price ?? exOrItem?.extraPrice ?? 0) || 0;

  const extrasPerUnit = selectedExtras.reduce(
    (sum, ex) => sum + priceOf(ex) * (ex.quantity || 1),
    0
  );
  const lineTotal = (basePrice + extrasPerUnit) * quantity;

  const incExtra = (group, item) => {
    setSelectedExtras((prev) => {
      const existing = prev.find(
        (ex) => ex.group === group.groupName && ex.name === item.name
      );
      if (existing) {
        return prev.map((ex) =>
          ex.group === group.groupName && ex.name === item.name
            ? { ...ex, quantity: (ex.quantity || 0) + 1 }
            : ex
        );
      } else {
        return [
          ...prev,
          {
            group: group.groupName,
            name: item.name,
            price: priceOf(item),
            quantity: 1,
          },
        ];
      }
    });
  };

  const decExtra = (group, item) => {
    setSelectedExtras((prev) =>
      prev
        .map((ex) =>
          ex.group === group.groupName && ex.name === item.name
            ? { ...ex, quantity: Math.max(0, (ex.quantity || 0) - 1) }
            : ex
        )
        .filter((ex) => ex.quantity > 0)
    );
  };

  const handleBackdrop = (e) => {
    if (e.target.dataset.backdrop === "true") onClose?.();
  };

  return createPortal(
    <div
      data-backdrop="true"
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[720px] md:w-[860px] bg-white/95 sm:rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
      >
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-4 top-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
        >
          ×
        </button>

        <div className="flex items-center gap-4 px-6 py-5 border-b border-neutral-200 bg-white/80 backdrop-blur-sm">
          <img
            src={
              product.image
                ? /^https?:\/\//.test(product.image)
                  ? product.image
                  : `${apiUrl}/uploads/${product.image}`
                : "https://via.placeholder.com/120?text=No+Image"
            }
            alt={product.name}
            className="w-16 h-16 object-cover rounded-xl border border-neutral-300 shadow-sm"
          />
          <div className="flex flex-col">
            <div className="text-xl font-medium text-neutral-900 tracking-tight">
              {product.name}
            </div>
            <div className="text-lg font-semibold text-neutral-600">
              {formatCurrency(basePrice)}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          <aside className="sm:w-48 border-b sm:border-b-0 sm:border-r border-neutral-200 bg-neutral-50/60 p-3 overflow-x-auto sm:overflow-y-auto">
            <div className="text-[11px] font-semibold text-neutral-500 mb-3 px-1 uppercase tracking-wide">
              {t("Extras")}
            </div>
            <div className="flex sm:block gap-2 sm:gap-0">
              {availableGroups.map((g, idx) => (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupIdx(idx)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-2 border transition-all ${
                    activeGroupIdx === idx
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                      : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {g.groupName}
                </button>
              ))}
            </div>
          </aside>

          <section className="flex-1 p-5 overflow-y-auto bg-white/80">
            {availableGroups.length > 0 ? (
              <>
                <div className="font-medium text-neutral-800 mb-3 text-base tracking-tight">
                  {availableGroups[activeGroupIdx].groupName}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(availableGroups[activeGroupIdx].items || []).map((item) => {
                    const unit = priceOf(item);
                    const q =
                      selectedExtras.find(
                        (ex) =>
                          ex.group === availableGroups[activeGroupIdx].groupName &&
                          ex.name === item.name
                      )?.quantity || 0;
                    return (
                      <div
                        key={item.id ?? item.name}
                        className="flex flex-col items-center bg-white border border-neutral-200 rounded-xl px-3 py-3 min-h-[96px] shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="text-center text-sm font-medium text-neutral-800 leading-tight line-clamp-2">
                          {item.name}
                        </div>
                        <div className="text-xs text-neutral-500 font-medium mt-0.5">
                          {formatCurrency(unit)}
                        </div>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              decExtra(availableGroups[activeGroupIdx], item)
                            }
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-700 text-lg hover:bg-neutral-200"
                          >
                            –
                          </button>
                          <span className="min-w-[28px] text-center text-base font-semibold text-neutral-800">
                            {q}
                          </span>
                          <button
                            onClick={() =>
                              incExtra(availableGroups[activeGroupIdx], item)
                            }
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-700 text-lg hover:bg-neutral-200"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-neutral-400 italic">{t("Select a group")}</div>
            )}

            <div className="mt-6">
              <div className="text-sm font-medium text-neutral-700 mb-2">
                {t("Quantity")}
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-full bg-neutral-100 text-neutral-700 text-2xl hover:bg-neutral-200"
                >
                  –
                </button>
                <span className="w-12 text-center text-2xl font-semibold text-neutral-900">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-11 h-11 rounded-full bg-neutral-100 text-neutral-700 text-2xl hover:bg-neutral-200"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-5">
              <textarea
                className="w-full rounded-xl border border-neutral-300 p-3 text-sm text-neutral-700 placeholder-neutral-400 bg-white/70 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder={t("Add a note (optional)…")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </section>
        </div>

        <div className="border-t border-neutral-200 px-6 py-4 flex items-center justify-between bg-white/90 backdrop-blur-sm">
          <div className="text-lg font-medium text-neutral-900">
            {t("Total")}: <span className="font-semibold">{formatCurrency(lineTotal)}</span>
          </div>
          <button
            onClick={() => {
              const unique_id = `${product.id}-${Date.now().toString(36)}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              const extrasList = Array.isArray(selectedExtras) ? selectedExtras : [];
              onAddToCart({
                id: product.id,
                name: product.name,
                image: product.image,
                price: basePrice,
                quantity,
                extras: extrasList.filter((e) => e.quantity > 0),
                note,
                unique_id,
              });
            }}
            className="py-2.5 px-6 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-all"
          >
            {t("Add to Cart")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default ProductModal;
