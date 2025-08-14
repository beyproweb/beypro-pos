// src/utils/qrActiveOrder.js
export const getActiveQrOrderId = () => localStorage.getItem("qr_active_order_id");
export const setActiveQrOrderId = (id) => localStorage.setItem("qr_active_order_id", String(id));
export const clearActiveQrOrderId = () => localStorage.removeItem("qr_active_order_id");
