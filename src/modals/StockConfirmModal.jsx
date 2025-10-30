// modals/StockConfirmModal.js
import React, { useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";

export default function StockConfirmModal({
  isOpen,
  onClose,
  productName,
  expectedQuantity,
  unit,
  onConfirm,
  productObj,
  batchCount,
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [actualQuantity, setActualQuantity] = useState(expectedQuantity);
     const { t, i18n } = useTranslation();
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      try {
        const data = await secureFetch("/suppliers");
        if (mounted) {
          setSuppliers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("❌ Failed to load suppliers:", err);
        if (mounted) setSuppliers([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    setActualQuantity(expectedQuantity);
  }, [expectedQuantity]);

  const handleConfirm = () => {
  if (!selectedSupplier || !actualQuantity || parseFloat(actualQuantity) <= 0) {
    alert('Please select a supplier and enter a valid quantity.');
    return;
  }

  const payload = {
    supplier_id: selectedSupplier,
    quantity: parseFloat(actualQuantity),
    name: productName,
    unit,
    productObj,
    batchCount,
  };

  console.log("📤 Confirming stock with payload:", payload); // ✅ Add this line

  onConfirm(payload);
  onClose();
};


  if (!isOpen) return null;

  return (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white w-full max-w-md rounded-xl p-6">
      <h2 className="text-xl font-bold mb-4">📦 {t("Add to Stock")}</h2>

      <p className="mb-4">
        {t("Product")}: <span className="font-semibold">{productName}</span><br />
        {t("Expected Quantity")}: <span className="font-semibold">{expectedQuantity} {unit}</span>
      </p>

      <div className="mb-3">
        <label className="block font-medium">{t("Select Supplier")}:</label>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="border p-2 rounded w-full"
        >
          <option value="">{t("-- Select --")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block font-medium">{t("Actual Quantity to Add")}:</label>
        <input
          type="number"
          value={actualQuantity}
          onChange={(e) => setActualQuantity(e.target.value)}
          className="border p-2 rounded w-full"
        />
        {parseFloat(actualQuantity) < expectedQuantity && (
          <p className="text-sm text-orange-500 mt-1">⚠️ {t("Less than batch output.")}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
        >
          {t("Cancel")}
        </button>
        <button
          onClick={handleConfirm}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
        >
          {t("Confirm")}
        </button>
      </div>
    </div>
  </div>
);

}
