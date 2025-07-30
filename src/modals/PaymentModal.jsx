import React from "react";

export default function PaymentModal({
  show,
  onClose,
  isSplitMode,
  setIsSplitMode,
  discountType,
  discountValue,
  selectedForPayment,
  cartItems,
  t,
  paymentMethods,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  confirmPayment,
  splits,
  setSplits,
  totalDue,
  activeSplitMethod,
  setActiveSplitMethod,
  confirmPaymentWithSplits,
  navigate,
}) {
  if (!show) return null;

  // Helper for calculating sum of split amounts
  const sumOfSplits = Object.values(splits)
    .map((v) => parseFloat(v || 0))
    .reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0);

  // Discounted subtotal for selected or all unpaid
  const getDiscountedTotal = () => {
    const items = selectedForPayment.length > 0
      ? cartItems.filter(i => selectedForPayment.includes(i.unique_id) && !i.paid)
      : cartItems.filter(i => !i.paid);
    let subtotal = items.reduce((sum, i) => {
  const base = i.price * i.quantity;
  const extras = (i.extras || []).reduce(
    (s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
    0
  ) * i.quantity;
  return sum + base + extras;
}, 0);

    if (discountType === "percent") {
      subtotal -= subtotal * (discountValue / 100);
    }
    if (discountType === "fixed") {
      subtotal = Math.max(0, subtotal - discountValue);
    }
    return subtotal;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl w-96 shadow-2xl relative">
        <h2 className="text-2xl font-bold mb-4 text-center">
          {isSplitMode ? `💳 ${t("Split Payment")}` : `💳 ${t("Select Payment Method")}`}
        </h2>
        {discountValue > 0 && (
          <div className="flex justify-between items-center mb-1">
            <span className="text-base font-bold text-pink-700">
              🎁 {t("Discount")}
              {discountType === "percent"
                ? ` (${discountValue}%)`
                : ` (-₺${discountValue})`}
            </span>
            <span className="text-base font-extrabold text-pink-700">
              -{discountType === "percent"
                ? `₺${(
                    (selectedForPayment.length > 0
                      ? cartItems.filter(i => selectedForPayment.includes(i.unique_id) && !i.paid)
                      : cartItems.filter(i => !i.paid)
                    ).reduce((sum, i) => sum + i.price * i.quantity, 0) * (discountValue / 100)
                  ).toFixed(2)}`
                : `₺${discountValue}`}
            </span>
          </div>
        )}

        <p className="text-center text-3xl font-semibold mb-6">
          ₺{getDiscountedTotal().toFixed(2)}
        </p>

        <div className="mb-4 text-center">
          <button
            onClick={() => setIsSplitMode((prev) => !prev)}
            className="inline-block px-4 py-2 bg-yellow-100 text-yellow-800 font-semibold rounded-full shadow hover:bg-yellow-200 transition"
          >
            {isSplitMode
              ? `🔁 ${t("Switch to Single Payment")}`
              : `🔀 ${t("Switch to Split Payment")}`}
          </button>
        </div>

        {isSplitMode ? (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div key={method} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {method === "Cash" && <span className="text-2xl">💵</span>}
                  {method === "Credit Card" && <span className="text-2xl">💳</span>}
                  {method === "Sodexo" && <span className="text-2xl">🍽️</span>}
                  {method === "Multinet" && <span className="text-2xl">🪙</span>}
                  <span className="font-medium">{t(method)}</span>
                </div>
                <button
                  onClick={() => setActiveSplitMethod(method)}
                  className="w-28 text-right px-4 py-3 border rounded-xl bg-gray-50 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
                >
                  {splits[method] ?? "0.00"}
                </button>
              </div>
            ))}
            <div className="flex justify-between items-center my-3 px-3 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-xl shadow text-lg font-bold">
  <span className="text-yellow-700">{t("Remaining")}</span>
  <span className={
    (totalDue - sumOfSplits) === 0
      ? "text-green-700"
      : "text-red-700 animate-pulse"
  }>
    ₺{(totalDue - sumOfSplits).toFixed(2)}
  </span>
</div>

          </div>
        ) : (
          <div className="space-y-2">
            {paymentMethods.map((method) => (
              <button
                key={method}
                onClick={async () => {
                  let idsToPay = selectedForPayment.length > 0
                    ? selectedForPayment
                    : cartItems.filter(i => !i.paid && i.confirmed).map(i => i.unique_id);
                  await confirmPayment(method, idsToPay);
                  onClose();
                }}
                className={`w-full py-2 rounded-xl border text-lg font-medium transition ${
                  selectedPaymentMethod === method
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-800 hover:bg-gray-100"
                }`}
              >
                {method === "Cash" && "💵"} {method === "Credit Card" && "💳"}
                {method === "Sodexo" && "🍽️"} {method === "Multinet" && "🪙"} {t(method)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-2">
          {isSplitMode && (
            <button
              onClick={async () => {
                await confirmPaymentWithSplits(splits);
                navigate("/tables");
              }}
              disabled={totalDue - sumOfSplits !== 0}
              className={`w-full py-3 rounded-xl text-lg font-semibold transition ${
                totalDue - sumOfSplits !== 0
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {t("Pay")} ₺{totalDue.toFixed(2)}
            </button>
          )}
          <button
            onClick={onClose}
            className="block w-full py-2 rounded-lg text-center bg-gray-200 text-gray-800 hover:bg-gray-300 transition"
          >
            ❌ {t("Cancel")}
          </button>
        </div>

        {activeSplitMethod && (
          <div className="absolute top-0 left-full ml-4 w-60 z-50">
            <div className="bg-white border p-4 rounded-xl shadow-xl">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, ".", "←"].map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === "←") {
                        const current = splits[activeSplitMethod]?.toString() || "";
                        setSplits((prev) => ({
                          ...prev,
                          [activeSplitMethod]: current.slice(0, -1) || ""
                        }));
                      } else {
                        const current = splits[activeSplitMethod]?.toString() || "";
                        setSplits((prev) => ({
                          ...prev,
                          [activeSplitMethod]: (current + key).replace(/^0+(?!\.)/, "")
                        }));
                      }
                    }}
                    className="py-3 bg-gray-100 rounded-xl text-lg font-bold hover:bg-gray-200"
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="flex space-x-2 mt-4">
                <button
                  onClick={() => setSplits((prev) => ({ ...prev, [activeSplitMethod]: "" }))}
                  className="w-1/2 bg-red-100 text-red-800 py-2 rounded-xl hover:bg-red-200"
                >
                  {t("Clear")}
                </button>
                <button
                  onClick={() => setActiveSplitMethod(null)}
                  className="w-1/2 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700"
                >
                  {t("OK")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
