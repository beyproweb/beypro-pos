// src/components/UserManagementTab.jsx
import React, { useState, useEffect } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import RolePermissionModal from "../../modals/RolePermissionModal";
import ConfirmModal from "../../modals/ConfirmModal";
import secureFetch from "../../utils/secureFetch";

export default function UserManagementTab() {
  const { t } = useTranslation();
  const [editingRole, setEditingRole] = useState(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [copyFromRole, setCopyFromRole] = useState("");
  const [roleToDelete, setRoleToDelete] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editedStaff, setEditedStaff] = useState({
    name: "",
    email: "",
    role: "",
    pin: "",
    phone: "",
    address: "",
    salary: "",
    avatar: "",
  });

  const [currentPage, setCurrentPage] = useState(0);
  const STAFF_PER_PAGE = 5;
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await secureFetch("/settings/users");
        if (res) {
          setUsersConfig((prev) => ({
            ...prev,
            ...res,
            roles: res.roles || prev.roles,
            pinRequired:
              typeof res.pinRequired === "boolean" ? res.pinRequired : prev.pinRequired,
            allowedWifiIps: Array.isArray(res.allowedWifiIps)
              ? res.allowedWifiIps
              : prev.allowedWifiIps,
            staffCheckinGeoEnabled:
              typeof res.staffCheckinGeoEnabled === "boolean"
                ? res.staffCheckinGeoEnabled
                : prev.staffCheckinGeoEnabled,
            staffCheckinGeoRadiusMeters:
              typeof res.staffCheckinGeoRadiusMeters === "number"
                ? res.staffCheckinGeoRadiusMeters
                : prev.staffCheckinGeoRadiusMeters,
          }));

          if (res.roles) {
            console.log("✅ Loaded roles from DB:", Object.keys(res.roles));
          } else {
            console.warn("⚠️ Loaded users settings but no roles were returned.");
          }
        }
      } catch (err) {
        console.error("❌ Failed to fetch roles:", err);
      }
    };

    fetchRoles();
  }, []);

  useEffect(() => {
    if (editingStaffId) {
      const user = staffList.find((u) => u.id === editingStaffId);
      if (user) {
        setEditedStaff({
          name: user.name,
          email: user.email,
          role: user.role,
          pin: user.pin || "",
          phone: user.phone || "",
          address: user.address || "",
          salary: user.salary || "",
          avatar: user.avatar || "",
        });
      }
    }
  }, [editingStaffId, staffList]);

  const paginatedStaff = staffList.slice(
    currentPage * STAFF_PER_PAGE,
    currentPage * STAFF_PER_PAGE + STAFF_PER_PAGE
  );
  const totalPages = Math.ceil(staffList.length / STAFF_PER_PAGE);

  const [usersConfig, setUsersConfig] = useState({
    roles: {
      admin: ["all"],
      cashier: ["orders", "payments"],
      driver: ["delivery"],
    },
    pinRequired: true,
    allowedWifiIps: [],
    staffCheckinGeoEnabled: false,
    staffCheckinGeoRadiusMeters: 150,
  });
  const [allowedIpInput, setAllowedIpInput] = useState("");
  const [newAvatarFileName, setNewAvatarFileName] = useState("");
  const [editedAvatarFileName, setEditedAvatarFileName] = useState("");

  const [newUser, setNewUser] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    role: "cashier",
    pin: "",
    salary: "",
    avatar: "",
  });
  const [qrStaffId, setQrStaffId] = useState("");

  const roles = Object.keys(usersConfig.roles).map((r) => r.toLowerCase());
  const deletableRoles = roles.filter((role) => role !== "admin");
  const allowedIps = Array.isArray(usersConfig.allowedWifiIps)
    ? usersConfig.allowedWifiIps
    : [];
  const staffCheckinGeoEnabled = usersConfig.staffCheckinGeoEnabled === true;
  const staffCheckinGeoRadiusMeters =
    Number(usersConfig.staffCheckinGeoRadiusMeters) || 150;

  const DEFAULT_AVATAR =
    "https://www.pngkey.com/png/full/115-1150152_default-profile-picture-avatar-png-green.png";

  const getAvatar = (url) => {
    if (!url) return DEFAULT_AVATAR;
    if (url.startsWith("http://localhost") || url.startsWith("/uploads/"))
      return DEFAULT_AVATAR;
    if (url.startsWith("http")) return url;
    return DEFAULT_AVATAR;
  };

  const isValidIp = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return false;

    const ipv4 =
      /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
    const ipv6 = /^[0-9a-fA-F:.]+$/;
    return ipv4.test(trimmed) || ipv6.test(trimmed);
  };

  const fetchStaff = async () => {
    try {
      const data = await secureFetch("/staff");
      setStaffList(data);
    } catch (err) {
      console.error("Error fetching staff:", err);
      toast.error(t("Error fetching staff list."));
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  // ✅ FIXED: Save to /settings/users instead of user_settings
  const saveRolesToSettings = async (data) => {
    try {
      await secureFetch("/settings/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return true;
    } catch (err) {
      console.error("❌ Failed to save roles:", err);
      toast.error(t("Failed to save roles to settings."));
      return false;
    }
  };

  const handleCreateRole = async () => {
    const role = newRoleName.trim().toLowerCase();
    if (usersConfig.roles[role]) return toast.error(t("Role already exists"));

    const newPermissions = copyFromRole
      ? usersConfig.roles[copyFromRole]
      : [];

    const updated = {
      ...usersConfig,
      roles: {
        ...usersConfig.roles,
        [role]: newPermissions,
      },
    };

    setUsersConfig(updated);
    await saveRolesToSettings(updated);
    toast.success(`✅ ${t("Role created: {{role}}", { role })}`);

    if (selectedStaffId) {
      await secureFetch(`/staff/${selectedStaffId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      toast.success(`👤 ${t("Assigned {{role}} to staff ID {{id}}", { role, id: selectedStaffId })}`);
      fetchStaff();
    }

    setNewRoleName("");
    setCopyFromRole("");
    setSelectedStaffId("");
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) {
      toast.error(t("Please select a role to delete."));
      return;
    }

    if (roleToDelete === "admin") {
      toast.error(t("Default roles cannot be deleted."));
      return;
    }

    const isAssigned = staffList.some(
      (staff) => staff.role?.toLowerCase() === roleToDelete
    );

    if (isAssigned) {
      toast.error(t("Role is assigned to staff members. Reassign before deleting."));
      return;
    }

    const updatedRoles = { ...usersConfig.roles };
    delete updatedRoles[roleToDelete];

    const updated = { ...usersConfig, roles: updatedRoles };

    setUsersConfig(updated);
    await saveRolesToSettings(updated);
    toast.success(t("Role deleted successfully."));
    setRoleToDelete("");
  };

  const handleSaveSettings = async () => {
    await saveRolesToSettings(usersConfig);
    toast.success(`✅ ${t("Role settings saved!")}`);
  };

  const handleAddAllowedIp = async () => {
    const trimmed = allowedIpInput.trim();
    if (!trimmed) {
      toast.error(t("Please enter an IP address."));
      return;
    }

    if (!isValidIp(trimmed)) {
      toast.error(t("Enter a valid IPv4 or IPv6 address."));
      return;
    }

    if (allowedIps.includes(trimmed)) {
      toast.info(t("This IP address is already whitelisted."));
      return;
    }

    const updated = {
      ...usersConfig,
      allowedWifiIps: [...allowedIps, trimmed],
    };

    setUsersConfig(updated);
    const saved = await saveRolesToSettings(updated);
    if (saved) {
      toast.success(t("Wi-Fi IP whitelist updated."));
      setAllowedIpInput("");
    }
  };

  const handleRemoveAllowedIp = async (ipToRemove) => {
    const updatedIps = allowedIps.filter((entry) => entry !== ipToRemove);
    const updated = { ...usersConfig, allowedWifiIps: updatedIps };

    setUsersConfig(updated);
    const saved = await saveRolesToSettings(updated);
    if (saved) {
      toast.success(t("Wi-Fi IP removed from whitelist."));
    }
  };

  const handleAddUser = async () => {
    const { id, name, role, phone, address, email, pin, salary, avatar } =
      newUser;

    if (!id || !name || !email || !phone || !address || !role || !pin || !salary) {
      toast.error(`❌ ${t("All fields are required")}`);
      return;
    }

    try {
      await secureFetch("/staff", {
        method: "POST",
        body: JSON.stringify({
          id: parseInt(id),
          name,
          email,
          phone,
          address,
          role,
          pin,
          salary: parseFloat(salary),
          avatar,
          salary_model: "fixed",
          payment_type: "monthly",
          monthly_salary: parseFloat(salary),
        }),
      });

      toast.success(`✅ ${t("Staff member added!")}`);
      fetchStaff();

      setNewUser({
        id: "",
        name: "",
        email: "",
        phone: "",
        address: "",
        role: "cashier",
        pin: "",
        salary: "",
        avatar: "",
      });
    } catch (err) {
      console.error("❌ Error adding user:", err);
      toast.error(t("Error adding user. Check inputs."));
    }
  };

  const handleDeleteStaffRecord = async (staffIdToDelete) => {
    const targetId = staffIdToDelete || selectedStaffId;
    if (!targetId) return;

    const confirmDelete = window.confirm(
      t("Are you sure you want to delete this staff member? This cannot be undone.")
    );
    if (!confirmDelete) return;

    try {
      await secureFetch(`/staff/${targetId}`, { method: "DELETE" });
      toast.success(`🗑️ ${t("Staff deleted")}`);
      fetchStaff();
      if (targetId === selectedStaffId) {
        setSelectedStaffId("");
      }
      if (targetId === qrStaffId) {
        setQrStaffId("");
      }
    } catch (err) {
      console.error("❌ Error deleting staff:", err);
      toast.error(t("Failed to delete staff"));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-6xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
      <h2 className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-300 mb-10">
        👥 {t("User Management")}
      </h2>

      {/* PIN toggle */}
      <div className="flex items-center justify-between mb-12 border-b pb-6 border-indigo-100 dark:border-indigo-800">
        <span className="text-lg font-medium text-gray-800 dark:text-white">
          {t("Require PIN to Login or Close Register")}
        </span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={usersConfig.pinRequired}
            onChange={() =>
              setUsersConfig((prev) => ({
                ...prev,
                pinRequired: !prev.pinRequired,
              }))
            }
            className="sr-only peer"
          />
          <div className="w-12 h-7 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>

      <div className="mb-12 border-b pb-6 border-indigo-100 dark:border-indigo-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            {t("Restrict QR check-ins to a Wi-Fi IP")}
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {allowedIps.length
              ? `${allowedIps.length} ${t("IPs configured")}`
              : t("No restriction")}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t(
            "Enter the public IP address of your restaurant Wi-Fi so staff QR check-ins/check-outs only work when they are connected to that network."
          )}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="sr-only">{t("Allowed Wi-Fi IP")}</label>
            <input
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              placeholder={t("e.g. 203.0.113.45")}
              value={allowedIpInput}
              onChange={(e) => setAllowedIpInput(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleAddAllowedIp}
            className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition"
          >
            {t("Add IP")}
          </button>
        </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {allowedIps.length ? (
          allowedIps.map((ip) => (
            <span
              key={ip}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-sm"
            >
              <span>{ip}</span>
              <button
                  type="button"
                  onClick={() => handleRemoveAllowedIp(ip)}
                  className="ml-1 text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-100"
                  aria-label={`Remove ${ip}`}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("No Wi-Fi IP restrictions are currently configured.")}
            </p>
          )}
        </div>
      </div>

      <div className="mb-12 border-b pb-6 border-indigo-100 dark:border-indigo-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            {t("Restrict QR check-ins to a distance")}
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {staffCheckinGeoEnabled ? t("Enabled") : t("Disabled")}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("Require staff to be within a radius of the restaurant to check in/out.")}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={staffCheckinGeoEnabled}
              onChange={() =>
                setUsersConfig((prev) => ({
                  ...prev,
                  staffCheckinGeoEnabled: !prev.staffCheckinGeoEnabled,
                }))
              }
              className="h-5 w-5 accent-indigo-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t("Enable distance check")}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="25"
              max="2000"
              step="5"
              value={staffCheckinGeoRadiusMeters}
              onChange={(e) =>
                setUsersConfig((prev) => ({
                  ...prev,
                  staffCheckinGeoRadiusMeters: Number(e.target.value) || 0,
                }))
              }
              className="w-28 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {t("meters")}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition"
          >
            {t("Save")}
          </button>
        </div>
      </div>

      <div className="mb-10">
        <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-gray-900 shadow-sm p-6">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-3">
            {t("Generate QR Code / View Profile")}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t("Choose a staff member to preview their QR code and profile quickly.")}
          </p>
          <select
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
            value={qrStaffId}
            onChange={(e) => setQrStaffId(e.target.value)}
          >
            <option value="">{t("Select Staff")}</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.role}
              </option>
            ))}
          </select>
          {qrStaffId ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <QRCodeCanvas
                value={String(qrStaffId)}
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
                includeMargin
              />
              <p className="text-lg font-medium text-gray-800 dark:text-white">
                {t("QR Code for Staff ID")}: {qrStaffId}
              </p>
              <button
                type="button"
                onClick={() => handleDeleteStaffRecord(qrStaffId)}
                className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition"
              >
                {t("Delete Staff")}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              {t("Select a staff member to generate their QR code.")}
            </p>
          )}
        </div>
      </div>

      {/* Add New Staff */}
      <div className="mb-14">
        <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-4">
          ➕ {t("Add New Staff User")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { key: "id", label: t("ID") },
          { key: "name", label: t("Full Name") },
          { key: "email", label: t("Email") },
          { key: "phone", label: t("Phone") },
          { key: "address", label: t("Address") },
        ].map(({ key, label }) => (
          <input
            key={key}
            className="p-3 border rounded-xl dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder={label}
            value={newUser[key]}
            onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
          />
        ))}
        <select
          className="p-3 border rounded-xl dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          className="p-3 border rounded-xl dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          type="password"
          placeholder={t("PIN")}
          value={newUser.pin}
          onChange={(e) => setNewUser({ ...newUser, pin: e.target.value })}
        />
        <input
          className="p-3 border rounded-xl dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          placeholder={t("Salary")}
          value={newUser.salary}
          onChange={(e) => setNewUser({ ...newUser, salary: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-3 sm:max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
            {t("Upload Avatar")}
          </label>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  setNewAvatarFileName(file?.name || "");
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    const res = await secureFetch("/upload", {
                      method: "POST",
                      body: formData,
                    });
                    setNewUser((prev) => ({ ...prev, avatar: res.url }));
                    toast.success(t("Avatar uploaded successfully"));
                  } catch (err) {
                    toast.error(`❌ ${t("Image upload failed!")}`);
                  }
                }}
              />
              {t("Choose file")}
            </label>
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {newAvatarFileName || t("No file chosen")}
            </span>
          </div>
        </div>

        <button
          onClick={handleAddUser}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition self-start"
        >
          ➕ {t("Add User")}
        </button>
      </div>
    </div>

    {/* Role Creation */}
    <div className="mb-10">
      <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-4">➕ {t("Create New Role")}</h3>
      <div className="sm:max-w-md flex flex-col gap-3">
        <input
          type="text"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          placeholder={t("Role name (e.g. Kitchen, Inventory)")}
          className="p-3 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={handleCreateRole}
          className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition"
        >
          {t("Create Role")}
        </button>
      </div>
    </div>

    {/* Delete Role */}
    <div className="mb-10">
      <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-4">
        🗑️ {t("Delete Role")}
      </h3>
      {deletableRoles.length ? (
        <div className="sm:max-w-md flex flex-col sm:flex-row gap-3">
          <select
            value={roleToDelete}
            onChange={(e) => setRoleToDelete(e.target.value)}
            className="p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white rounded-xl shadow-sm"
          >
            <option value="">{t("Select Role to Delete")}</option>
            {deletableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            onClick={handleDeleteRole}
            disabled={!roleToDelete}
            className="px-5 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-bold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("Delete Role")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("No deletable roles available.")}
        </p>
      )}
    </div>

    {/* Staff Role Assignment */}
    <div className="mb-14">
      <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-4">👥 {t("Assign Role to Staff")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <select
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
          className="p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-xl shadow-sm"
        >
          <option value="">{t("Select Staff")}</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.role})
            </option>
          ))}
        </select>

        <select
          value={copyFromRole}
          onChange={(e) => setCopyFromRole(e.target.value)}
          className="p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-xl shadow-sm"
        >
          <option value="">{t("Select Role")}</option>
          {roles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            disabled={!selectedStaffId || !copyFromRole}
       onClick={async () => {
  await secureFetch(`/staff/${selectedStaffId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role: copyFromRole }),
  });
  toast.success(`✅ ${t("Assigned {{role}} to staff ID {{id}}", { role: copyFromRole, id: selectedStaffId })}`);
  fetchStaff();
  setSelectedStaffId("");
  setCopyFromRole("");
}}

            className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition"
          >
            {t("Assign")}
          </button>
          <button
            disabled={!selectedStaffId}
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            {t("Delete")}
          </button>
        </div>
      </div>

      {/* Inline Staff Editing */}
      {paginatedStaff.map((staff) => (
        <div key={staff.id} className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-600 rounded-xl p-4 mb-4 shadow-sm hover:shadow-md transition">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
  <img src={getAvatar(staff.avatar)}
  alt={staff.name}
  className="w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 shadow-sm"
/>

  <div>
    <p className="font-semibold text-gray-900 dark:text-white">{staff.name}</p>
    <p className="text-sm text-gray-600 dark:text-gray-400">{staff.email}</p>
  </div>
</div>

            <div className="flex items-center gap-3">
              <span className="text-sm bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 px-3 py-1 rounded-full">
                {staff.role}
              </span>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-200 cursor-pointer inline-flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setEditedAvatarFileName(file?.name || "");
                      if (!file) return;
                      const formData = new FormData();
                      formData.append("file", file);
                      try {
                        const res = await secureFetch("/upload", {
                          method: "POST",
                          body: formData,
                        });
                        setEditedStaff((prev) => ({ ...prev, avatar: res.url }));
                        setStaffList((list) =>
                          list.map((s) => (s.id === editingStaffId ? { ...s, avatar: res.url } : s))
                        );
                        toast.success(t("Avatar uploaded successfully"));
                      } catch (err) {
                        toast.error(`❌ ${t("Image upload failed!")}`);
                      }
                    }}
                  />
                  📎 {t("Choose file")}
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[180px] truncate">
                  {editedAvatarFileName || t("No file chosen")}
                </span>
                <button
                  onClick={() => setEditingStaffId(staff.id)}
                  className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  ✏️ {t("Edit")}
                </button>
              </div>
            </div>
          </div>

          {editingStaffId === staff.id && (
            <div className="mt-4 grid sm:grid-cols-3 gap-3 border-t pt-4 dark:border-gray-600">
              {[
                { key: "name", placeholder: "Full Name" },
                { key: "email", placeholder: "Email" },
                { key: "phone", placeholder: "Phone" },
                { key: "address", placeholder: "Address" },
                { key: "salary", placeholder: "Salary" },
              ].map(({ key, placeholder }) => (
                <input
                  key={key}
                  className="p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  placeholder={t(placeholder)}
                  value={editedStaff[key]}
                  onChange={(e) =>
                    setEditedStaff((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              ))}
              <select
                className="p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                value={editedStaff.role}
                onChange={(e) =>
                  setEditedStaff((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <input
                className="p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                placeholder={t("PIN")}
                value={editedStaff.pin}
                onChange={(e) =>
                  setEditedStaff((prev) => ({ ...prev, pin: e.target.value }))
                }
              />
              <div className="col-span-3 flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setEditingStaffId(null)}
                  className="text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white"
                >
                  {t("Cancel")}
                </button>
<button
  onClick={async () => {
    try {
     await secureFetch(`/staff/${parseInt(staff.id)}`, {
  method: "PUT",
  body: JSON.stringify({
    ...editedStaff,
    id: undefined, // prevent sending wrong id field
  }),
});

      toast.success(`✅ ${t("Staff updated")}`);
      fetchStaff();
      setEditingStaffId(null);
    } catch (err) {
      console.error("❌ Update failed:", err);
      toast.error(`❌ ${t("Failed to update staff")}`);
    }
  }}
  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold"
>
  {t("Save")}
</button>

              </div>
            </div>
          )}
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPage(idx)}
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                currentPage === idx
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-gray-700 dark:text-white"
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Role Permissions */}
    <div className="mb-12">
      <h3 className="text-2xl font-semibold text-gray-700 dark:text-indigo-200 mb-4">
        🔐 {t("Roles & Permissions")}
      </h3>
      <div className="space-y-3">
{Object.entries(usersConfig.roles).map(([role, permissions]) => (
  <div
    key={role}
    className="bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-3 flex justify-between items-center hover:shadow transition"
  >
    <div>
      <p className="font-semibold text-indigo-700 dark:text-indigo-300">{role}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {permissions.join(", ") || t("No permissions set")}
      </p>
    </div>
    <div className="flex gap-3">
      <button
        onClick={() => setEditingRole(role)}
        className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        ⚙️ {t("Set Permissions")}
      </button>
      <button
        onClick={async () => {
          if (!window.confirm(t("Are you sure you want to delete role '{{role}}'?", { role }))) return;
try {
  await secureFetch(`/settings/roles/${role.toLowerCase()}`, {
    method: "DELETE",
  });
  const updated = { ...usersConfig };
  delete updated.roles[role.toLowerCase()];
  setUsersConfig(updated);
  toast.success(`🗑️ ${t("Role deleted: {{role}}", { role })}`);
}
 catch (err) {
            toast.error(`❌ ${t("Failed to delete role")}`);
            console.error(err);
          }
        }}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        🗑️ {t("Delete")}
      </button>
    </div>
  </div>
))}

      </div>

      <RolePermissionModal
        role={editingRole}
        isOpen={!!editingRole}
        initialPermissions={usersConfig.roles?.[editingRole] || []}
        onClose={() => setEditingRole(null)}
        onSave={async (perms, roleKey) => {
   const updated = {
     ...usersConfig,
     roles: { 
       ...usersConfig.roles,
       [roleKey]: perms, // ✅ always lowercase role
     },
   };
   setUsersConfig(updated);
   await saveSetting("users", updated);
	   toast.success(`✅ ${t("Permissions updated for {{role}}", { role: roleKey })}`);
}}

      />
    </div>

  


    {/* Permissions modal */}
      <RolePermissionModal
        role={editingRole}
        isOpen={!!editingRole}
        initialPermissions={usersConfig.roles?.[editingRole] || []}
        onClose={() => setEditingRole(null)}
        onSave={async (perms, roleKey) => {
          const updated = {
            ...usersConfig,
            roles: {
              ...usersConfig.roles,
              [roleKey]: perms,
            },
          };
          setUsersConfig(updated);
          await saveRolesToSettings(updated);
	          toast.success(`✅ ${t("Permissions updated for {{role}}", { role: roleKey })}`);
	        }}
      />

      {/* Save button */}
      <div className="flex justify-end mt-8">
        <button
          onClick={handleSaveSettings}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold shadow hover:brightness-110 transition"
        >
          💾 {t("Save Role Settings")}
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title={t("Delete Staff Member")}
        message={t("Are you sure you want to delete this staff member? This cannot be undone.")}
        onCancel={() => setShowConfirm(false)}
        onConfirm={async () => {
          try {
            await secureFetch(`/staff/${selectedStaffId}`, { method: "DELETE" });
            toast.success(`🗑️ ${t("Staff deleted")}`);
            fetchStaff();
            setSelectedStaffId("");
          } catch (err) {
            console.error("❌ Delete failed:", err);
            toast.error(t("Failed to delete staff"));
          } finally {
            setShowConfirm(false);
          }
        }}
      />
    </div>
  );
}
