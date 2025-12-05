import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";
import { openCashDrawer } from "../../utils/cashDrawer";

export default function RegisterSettingsTab() {
  const { t } = useTranslation();

  const [register, setRegister] = useState({
    openingCash: "500.00",
    requirePin: true,
    autoClose: false,
    sendSummaryEmail: true,
    cashDrawerPrinter: {
      interface: "network",
      host: "",
      port: 9100,
      vendorId: "",
      productId: "",
      path: "",
      baudRate: 9600,
      pin: 2,
      address: "",
    },
  });

  useSetting("register", setRegister, {
    openingCash: "500.00",
    requirePin: true,
    autoClose: false,
    sendSummaryEmail: true,
    cashDrawerPrinter: {
      interface: "network",
      host: "",
      port: 9100,
      vendorId: "",
      productId: "",
      path: "",
      baudRate: 9600,
      pin: 2,
      address: "",
    },
  });

  const handleSave = async () => {
    await saveSetting("register", register);
    alert("✅ Register settings saved!");
  };

  const handleTestDrawer = async () => {
    try {
      const success = await openCashDrawer();
      if (success) {
        alert("✅ Cash drawer opened successfully!");
      } else {
        alert("⚠️ Cash drawer not configured or device error. Check the printer IP/port and register settings.");
      }
    } catch (err) {
      alert(`❌ Error: ${err?.message || err}`);
    }
  };

  const handlePrinterChange = (field, value) => {
    setRegister((prev) => ({
      ...prev,
      cashDrawerPrinter: {
        ...prev.cashDrawerPrinter,
        [field]: value,
      },
    }));
  };

  const printer = register.cashDrawerPrinter || {};

  return (
  <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
    <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
      🧾 {t("Cash Register Settings")}
    </h2>

    {/* Opening Cash */}
    <div className="mb-6">
      <label className="block text-lg font-medium text-gray-800 dark:text-white mb-1">
        {t("Suggested Opening Cash (₺)")}
      </label>
      <input
        type="number"
        value={register.openingCash}
        onChange={(e) =>
          setRegister((prev) => ({ ...prev, openingCash: e.target.value }))
        }
        className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-300"
      />
    </div>

    {/* Cash drawer printer */}
    <div className="mt-10 border-t border-slate-200 pt-6">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        🖨️ {t("Cash Drawer Printer")}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("Define how the drawer pulse will be sent when cash payments are confirmed.")}
      </p>

      {/* Quick Setup Guide */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">💡 {t("Quick Setup Tips")}:</p>
        <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1 ml-4 list-disc">
          <li>{t("If your receipt printer has a cash drawer, use the same IP address and port (9100)")}</li>
          <li>{t("Most ESC/POS printers use pin 2 for the cash drawer")}</li>
          <li>{t("If the drawer doesn't open, check: 1) Printer IP/Port are correct, 2) Printer is connected, 3) Pin number is right")}</li>
        </ul>
      </div>

      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("Interface")}
          </label>
          <select
            value={printer.interface || "network"}
            onChange={(e) => handlePrinterChange("interface", e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-gray-50 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="network">{t("Network (LAN/WiFi)")}</option>
            <option value="usb">{t("USB")}</option>
            <option value="serial">{t("Serial / COM")}</option>
            <option value="bluetooth">{t("Bluetooth")}</option>
          </select>
        </div>

        {printer.interface === "network" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("Printer IP")}</label>
              <input
                type="text"
                value={printer.host || ""}
                onChange={(e) => handlePrinterChange("host", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="192.168.1.50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Port")}</label>
              <input
                type="number"
                value={printer.port || 9100}
                onChange={(e) => handlePrinterChange("port", Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="9100"
              />
            </div>
          </div>
        )}

        {printer.interface === "usb" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("Vendor ID")}</label>
              <input
                type="text"
                value={printer.vendorId || ""}
                onChange={(e) => handlePrinterChange("vendorId", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="0x04b8"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Product ID")}</label>
              <input
                type="text"
                value={printer.productId || ""}
                onChange={(e) => handlePrinterChange("productId", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="0x0e15"
              />
            </div>
          </div>
        )}

        {printer.interface === "serial" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("Port Path")}</label>
              <input
                type="text"
                value={printer.path || ""}
                onChange={(e) => handlePrinterChange("path", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="/dev/ttyUSB0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Baud Rate")}</label>
              <input
                type="number"
                value={printer.baudRate || 9600}
                onChange={(e) => handlePrinterChange("baudRate", Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                placeholder="9600"
              />
            </div>
          </div>
        )}

        {printer.interface === "bluetooth" && (
          <div>
            <label className="block text-sm font-medium mb-1">{t("Bluetooth Address")}</label>
            <input
              type="text"
              value={printer.address || ""}
              onChange={(e) => handlePrinterChange("address", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
              placeholder="01:23:45:67:89:ab"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">{t("Drawer Pin")}</label>
          <input
            type="number"
            value={printer.pin || 2}
            onChange={(e) => handlePrinterChange("pin", Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
            placeholder="2"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t("Most ESC/POS drawers use pin 2. Change only if your printer requires otherwise.")}
          </p>
        </div>

        {/* Test Drawer Button */}
        <div>
          <button
            onClick={handleTestDrawer}
            className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all"
          >
            🧾 {t("Test Drawer Open")}
          </button>
          <p className="text-xs text-gray-500 mt-1">
            {t("Click to verify cash drawer opens correctly with current settings.")}
          </p>
        </div>
      </div>
    </div>

    {/* Toggles */}
    <div className="space-y-5">
      {/* Require PIN */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Require PIN to open/close")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.requirePin}
            onChange={() =>
              setRegister((prev) => ({ ...prev, requirePin: !prev.requirePin }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Auto-Close */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Auto-close at midnight")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.autoClose}
            onChange={() =>
              setRegister((prev) => ({ ...prev, autoClose: !prev.autoClose }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Send Summary Email */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Send daily summary email")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.sendSummaryEmail}
            onChange={() =>
              setRegister((prev) => ({
                ...prev,
                sendSummaryEmail: !prev.sendSummaryEmail,
              }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>
    </div>

    {/* Save Button */}
    <div className="flex justify-end mt-10">
      <button
        onClick={handleSave}
        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white rounded-lg font-bold shadow transition-all"
      >
        💾 {t("Save Settings")}
      </button>
    </div>
  </div>
);

}
