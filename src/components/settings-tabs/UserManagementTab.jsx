import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { toast } from "react-toastify";
import { useSetting, saveSetting } from "../hooks/useSetting";
import RolePermissionModal from "../settings-tabs/RolePermissionModal";
import ConfirmModal from "../ui/ConfirmModal";
const API_URL = import.meta.env.VITE_API_URL || "";
export default function UserManagementTab() {
  const { t } = useTranslation();
 const [editingRole, setEditingRole] = useState(null);
const [newRoleName, setNewRoleName] = useState("");
const [copyFromRole, setCopyFromRole] = useState("");
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
  if (editingStaffId) {
    const user = staffList.find((u) => u.id === editingStaffId);
    setEditedStaff({
      name: user.name,
      email: user.email,
      role: user.role,
      pin: user.pin || "",
    });
  }
}, [editingStaffId]);

const paginatedStaff = staffList.slice(
  currentPage * STAFF_PER_PAGE,
  currentPage * STAFF_PER_PAGE + STAFF_PER_PAGE
);
const totalPages = Math.ceil(staffList.length / STAFF_PER_PAGE);

  const [usersConfig, setUsersConfig] = useState({
    roles: {
      Admin: ["all"],
      Cashier: ["orders", "payments"],
      Driver: ["delivery"],
    },
    pinRequired: true,
  });

  const [newUser, setNewUser] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    role: "Cashier",
    pin: "",
    salary: "",
     avatar: "",
  });


  const roles = Object.keys(usersConfig.roles);

  useSetting("users", setUsersConfig, {
    roles: {
      Admin: ["all"],
      Cashier: ["orders"],
      Driver: ["delivery"],
    },
    pinRequired: true,
  });
const handleCreateRole = async () => {
  const role = newRoleName.trim();
  if (!role) return toast.error("Role name is required");
  if (usersConfig.roles[role]) return toast.error("Role already exists");

  const newPermissions = copyFromRole ? usersConfig.roles[copyFromRole] : [];

  // Save role to settings
  const updated = {
    ...usersConfig,
    roles: {
      ...usersConfig.roles,
      [role]: newPermissions,
    },
  };

  setUsersConfig(updated);
  await saveSetting("users", updated);
  toast.success(`✅ Role '${role}' created`);

  // Optionally assign to staff
  if (selectedStaffId) {
    await axios.put(`${API_URL}/api/staff/${selectedStaffId}/role`, { role });
    toast.success(`👤 Assigned ${role} to staff ID ${selectedStaffId}`);
    fetchStaff();
  }

  // Reset form
  setNewRoleName("");
  setCopyFromRole("");
  setSelectedStaffId("");
};

  const fetchStaff = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/staff`);
      setStaffList(response.data);
    } catch (err) {
      console.error("Error fetching staff:", err);
      toast.error("Error fetching staff list.");
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleSaveSettings = async () => {
    await saveSetting("users", usersConfig);
    toast.success("✅ Role settings saved!");
  };

  const handleAddUser = async () => {
   const { id, name, role, phone, address, email, pin, salary, avatar } = newUser;


    if (!id || !name || !email || !phone || !address || !role || !pin || !salary) {
      toast.error("❌ All fields are required");
      return;
    }

    try {
      await axios.post(`${API_URL}/api/staff`, {
        id: parseInt(id),
        name,
        email,
        phone,
        address,
        role,
        pin,
        salary: parseFloat(salary),
        avatar: newUser.avatar,
        salary_model: "fixed",
        payment_type: "monthly",
        monthly_salary: parseFloat(salary),
      });

      toast.success("✅ Staff member added!");
      fetchStaff();

      setNewUser({
        id: "",
        name: "",
        email: "",
        phone: "",
        address: "",
        role: "Cashier",
        pin: "",
        salary: "",
        avatar: ""
      });
    } catch (err) {
      console.error("❌ Error adding user:", err);
      toast.error("Error adding user. Check inputs.");
    }
  };

  const handleDeleteStaff = async () => {
  if (!selectedStaffId) return;
  const confirmDelete = window.confirm("Are you sure?");
  if (!confirmDelete) return;

  try {
    await axios.delete(`${API_URL}/api/staff/${selectedStaffId}`);
    toast.success("🗑️ Staff deleted");
    fetchStaff();
    setSelectedStaffId("");
  } catch (err) {
    console.error("❌ Error deleting staff:", err);
    toast.error("Failed to delete staff");
  }
};


 return (
  <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 max-w-6xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
    <h2 className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-300 mb-10">
      👥 {t("User Management")}
    </h2>

    {/* Require PIN */}
    <div className="flex items-center justify-between mb-12 border-b pb-6 border-indigo-100 dark:border-indigo-800">
      <span className="text-lg font-medium text-gray-800 dark:text-white">
        {t("Require PIN to Login or Close Register")}
      </span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={usersConfig.pinRequired}
          onChange={() =>
            setUsersConfig((prev) => ({ ...prev, pinRequired: !prev.pinRequired }))
          }
          className="sr-only peer"
        />
        <div className="w-12 h-7 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
      </label>
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
              await axios.put(`${API_URL}/api/staff/${selectedStaffId}/role`, { role: copyFromRole });
              toast.success(`✅ Assigned ${copyFromRole} to staff ID ${selectedStaffId}`);
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
  <img
  src={staff.avatar || '/default-avatar.png'}
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
              <button
                onClick={() => setEditingStaffId(staff.id)}
                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
             <input
  type="file"
  accept="image/*"
  onChange={async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API_URL}/api/upload`, formData);
      setEditedStaff((prev) => ({ ...prev, avatar: res.data.url })); // ✅ correct
    } catch (err) {
      toast.error("❌ Image upload failed");
    }
  }}
  className="p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
/>



                ✏️ {t("Edit")}
              </button>
            </div>
          </div>

          {editingStaffId === staff.id && (
            <div className="mt-4 grid sm:grid-cols-3 gap-3 border-t pt-4 dark:border-gray-600">
              {[
                { key: "name", placeholder: "Full Name" },
                { key: "email", placeholder: "Email" },
                { key: "phone", placeholder: "Phone" },
                { key: "address", placeholder: "Address" },
                { key: "salary", placeholder: "Salary (₺)" },
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
                      await axios.put(`${API_URL}/api/staff/${staff.id}`, editedStaff);
                      toast.success("✅ Staff updated");
                      fetchStaff();
                      setEditingStaffId(null);
                    } catch {
                      toast.error("❌ Failed to update staff");
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
            <button
              onClick={() => setEditingRole(role)}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              ⚙️ {t("Set Permissions")}
            </button>
          </div>
        ))}
      </div>

      <RolePermissionModal
        role={editingRole}
        isOpen={!!editingRole}
        initialPermissions={usersConfig.roles?.[editingRole] || []}
        onClose={() => setEditingRole(null)}
        onSave={async (perms) => {
  const updated = {
    ...usersConfig,
    roles: { ...usersConfig.roles, [editingRole]: perms },
  };
  setUsersConfig(updated);
  await saveSetting("users", updated); // ← this saves to backend!
  toast.success("✅ Role permissions updated!");
}}

      />
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
          placeholder={t("Salary (₺)")}
          value={newUser.salary}
          onChange={(e) => setNewUser({ ...newUser, salary: e.target.value })}
        />
      </div>
      <button
        onClick={handleAddUser}
        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition"
      >
     <input
  type="file"
  accept="image/*"
  onChange={async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API_URL}/api/upload`, formData);
      setNewUser((prev) => ({ ...prev, avatar: res.data.url }));
    } catch (err) {
      toast.error("❌ Image upload failed");
    }
  }}
  className="p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
/>


        ➕ {t("Add User")}
      </button>
    </div>

    {/* Save Button */}
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
      title="Delete Staff Member"
      message="Are you sure you want to delete this staff member? This cannot be undone."
      onCancel={() => setShowConfirm(false)}
      onConfirm={async () => {
        try {
          await axios.delete(`${API_URL}/api/staff/${selectedStaffId}`);
          toast.success("🗑️ Staff deleted");
          fetchStaff();
          setSelectedStaffId("");
        } catch (err) {
          console.error("❌ Delete failed:", err);
          toast.error("Failed to delete staff");
        } finally {
          setShowConfirm(false);
        }
      }}
    />
  </div>
);




}
