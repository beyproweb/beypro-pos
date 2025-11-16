from pathlib import Path

path = Path("src/pages/TableOverview.jsx")
lines = path.read_text().splitlines()
start = 1597
end = 1719
del lines[start:end]
new_block = """{activeTab === "kitchen" && (
  <div className="px-3 md:px-8 py-6">
    {allOrders.length === 0 ? (
      <div className="flex flex-col items-center mt-10 gap-3">
        <span className="text-6xl">📭</span>
        <span className="text-xl text-gray-400 font-semibold">
          {t("No active orders right now.")}
        </span>
        <span className="text-sm text-slate-500 text-center max-w-xl">
          {t("Open an order from Tables or Packet and it will appear here for quick editing.")}
        </span>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {allOrders.map((order) => {
          const orderType = (order.order_type || order.__cardType || "table").toLowerCase();
          const typeLabel =
            orderType === "table"
              ? (t("Table") + " " + (order.table_number || order.tableNumber || "")).trim()
              : orderType === "packet"
              ? t("Packet Order")
              : orderType === "phone"
              ? t("Phone Order")
              : orderType === "takeaway"
              ? t("Takeaway Order")
              : "#" + order.id;
          const statusClasses = order.status === "cancelled" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700";
          const createdAtLabel = order.created_at
            ? new Date(order.created_at).toLocaleDateString() + " • " + new Date(order.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          const displayItems = Array.isArray(order.items) ? order.items.slice(0, 3) : [];
          return (
            <div
              key={"all-order-" + order.id + "-" + orderType + "-" + (order.table_number || order.customer_phone || "")}
              onClick={() => handleReopenOrder(order)}
              className="relative flex cursor-pointer flex-col gap-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg transition hover:-translate-y-0.5 hover:shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">{typeLabel}</p>
                  <p className="text-2xl font-bold text-slate-900">#{order.id}</p>
                  <p className="text-xs text-slate-500 mt-1">{createdAtLabel}</p>
                  {order.customer_name && (
                    <p className="text-sm text-slate-600">{order.customer_name}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={"px-3 py-1 text-xs font-semibold rounded-full " + statusClasses}>
                    {t(order.status)}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openCancelModal(order);
                    }}
                    className="rounded-full border border-rose-100 px-3 py-1 text-xs font-semibold text-rose-600 bg-white hover:bg-rose-50 transition"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-slate-600">
                {displayItems.map((item, idx) => {
                  const qty = Number(item.quantity || item.qty || 1);
                  const unitPrice = parseFloat(item.price || item.unit_price || 0);
                  const lineTotal = (qty * unitPrice).toFixed(2);
                  return (
                    <li key={order.id + "-item-" + idx} className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        {qty} × {item.name || item.product_name || item.order_item_name}
                      </span>
                      <span className="text-slate-500">₺{lineTotal}</span>
                    </li>
                  );
                })}
                {Array.isArray(order.items) && order.items.length > 3 && (
                  <li className="text-xs text-slate-400">
                    +{order.items.length - 3} {t("more items")}
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                <span>{t("Tap to continue")}</span>
                <span className="text-2xl font-bold text-slate-900">
                  ₺{getDisplayTotal(order).toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
""".splitlines()
lines[start:start] = new_block
Path(path).write_text("\n".join(lines) + "\n")
