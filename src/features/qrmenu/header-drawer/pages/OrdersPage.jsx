import React from "react";
import { splitOrdersByState } from "../services/customerService";

function OrderRow({ order, t }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800 dark:text-neutral-100">#{order.id}</span>
        <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-neutral-400">{t(order.status)}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
        {new Date(order.createdAt).toLocaleString()} • {order.itemCount} {t("items")}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-neutral-100">{order.total.toFixed(2)}</div>
    </div>
  );
}

function OrdersSection({ title, orders, t }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide uppercase text-gray-500 dark:text-neutral-400">{title}</h4>
      {orders.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-neutral-500">{t("No orders")}</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <OrderRow key={`${title}-${order.id}`} order={order} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersPage({ t, orders, loading, error, onRefresh, onBack }) {
  const { active, past } = React.useMemo(() => splitOrdersByState(orders), [orders]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"
          >
            {t("Back")}
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("My Orders")}</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs font-semibold text-gray-600 dark:text-neutral-300"
        >
          {t("Refresh")}
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto">
        {loading ? <p className="text-sm text-gray-500 dark:text-neutral-400">{t("Loading orders...")}</p> : null}
        {error ? <p className="text-xs text-rose-600">{t(error)}</p> : null}
        {!loading ? (
          <>
            <OrdersSection title={t("Active")} orders={active} t={t} />
            <OrdersSection title={t("Past")} orders={past} t={t} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(OrdersPage);
