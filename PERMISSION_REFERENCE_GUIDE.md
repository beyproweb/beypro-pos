# Web Dashboard - Complete Permission Reference Guide

## Overview

This guide maps all **Pages (25)**, **UI Components (5)**, and **Modals (12)** to their corresponding permission keys for role-based access control.

---

## 🔑 PERMISSION KEYS STRUCTURE

### Format: `[category]-[feature]`

- **Pages**: `dashboard`, `table-overview`, `kitchen`, etc.
- **UI Components**: `staff-payroll`, `staff-checkin`, `staff-schedule`
- **Modals**: `modal-move-table`, `modal-payment`, `modal-phone-order`, etc.

---

## 📄 PAGES (25 Total)

| #   | Page File               | Permission Key          | Display Name             |
| --- | ----------------------- | ----------------------- | ------------------------ |
| 1   | Dashboard.jsx           | `dashboard`             | 📊 Dashboard             |
| 2   | TableOverview.jsx       | `table-overview`        | 🍽 Table Overview        |
| 3   | Orders.jsx              | `orders`                | 📋 Orders                |
| 4   | Kitchen.jsx             | `kitchen`               | 🍳 Kitchen               |
| 5   | Products.jsx            | `products`              | 🛍 Products              |
| 6   | Suppliers.jsx           | `suppliers`             | 🏪 Suppliers             |
| 7   | Stock.jsx               | `stock`                 | 📦 Stock                 |
| 8   | QrMenu.jsx              | `qr-menu`               | 🔗 QR Menu               |
| 9   | QrMenuSettings.jsx      | `qr-menu-settings`      | 🔗 QR Menu Settings      |
| 10  | Staff.jsx               | `staff`                 | 👥 Staff                 |
| 11  | Task.jsx                | `task`                  | ✅ Task Manager          |
| 12  | Reports.jsx             | `reports`               | 📈 Reports               |
| 13  | CashRegisterHistory.jsx | `cash-register`         | 💰 Cash Register History |
| 14  | IngredientPrices.jsx    | `ingredient-prices`     | 🥘 Ingredient Prices     |
| 15  | Integrations.jsx        | `integrations`          | 🔌 Integrations          |
| 16  | CustomerInsights.jsx    | `customer-insights`     | 👤 Customer Insights     |
| 17  | MarketingCampaigns.jsx  | `marketing-campaigns`   | 📢 Marketing Campaigns   |
| 18  | MaintenanceTracker.jsx  | `maintenance`           | 🔧 Maintenance Tracker   |
| 19  | TakeawayOverview.jsx    | `takeaway-overview`     | 🥡 Takeaway Overview     |
| 20  | PrintersPage.jsx        | `printers-page`         | 🖨 Printers Management   |
| 21  | TransactionScreen.jsx   | `transaction-screen`    | 💳 Transaction Screen    |
| 22  | UserManagementPage.jsx  | `user-management`       | 👨‍💼 User Management       |
| 23  | Home.jsx                | `home`                  | 🏠 Home                  |
| 24  | NotFound.jsx            | `not-found`             | ❌ Not Found             |
| 25  | CashRegisterHistory.jsx | `cash-register-history` | 💰 Cash Register History |

---

## 🎨 UI COMPONENTS (5 Total in `/src/components/ui/`)

| #   | Component File    | Permission Key   | Display Name                    |
| --- | ----------------- | ---------------- | ------------------------------- |
| 1   | Payroll.jsx       | `staff-payroll`  | 💼 Payroll (UI)                 |
| 2   | StaffCheckIn.jsx  | `staff-checkin`  | 🔐 Staff Check-In (UI)          |
| 3   | StaffSchedule.jsx | `staff-schedule` | 📅 Staff Schedule (UI)          |
| 4   | button.jsx        | -                | Reusable button (no permission) |
| 5   | card.jsx          | -                | Reusable card (no permission)   |

---

## 🔘 MODALS (12 Total in `/src/modals/`)

### Transaction & Table Operations

| #   | Modal File          | Permission Key      | Display Name         |
| --- | ------------------- | ------------------- | -------------------- |
| 1   | MoveTableModal.jsx  | `modal-move-table`  | 🔄 Move Table Modal  |
| 2   | MergeTableModal.jsx | `modal-merge-table` | 🔀 Merge Table Modal |

### Order & Cart Operations

| #   | Modal File            | Permission Key        | Display Name           |
| --- | --------------------- | --------------------- | ---------------------- |
| 3   | PhoneOrderModal.jsx   | `modal-phone-order`   | 📞 Phone Order Modal   |
| 4   | SupplierCartModal.jsx | `modal-supplier-cart` | 🛒 Supplier Cart Modal |

### Payment & Transactions

| #   | Modal File       | Permission Key  | Display Name     |
| --- | ---------------- | --------------- | ---------------- |
| 5   | PaymentModal.jsx | `modal-payment` | 💳 Payment Modal |

### Product & Inventory Management

| #   | Modal File            | Permission Key        | Display Name          |
| --- | --------------------- | --------------------- | --------------------- |
| 6   | DiscountModal.jsx     | `modal-discount`      | 🏷 Discount Modal     |
| 7   | ExtrasModal.jsx       | `modal-extras`        | ➕ Extras Modal       |
| 8   | RecipeModal.jsx       | `modal-recipe`        | 👨‍🍳 Recipe Modal       |
| 9   | StockConfirmModal.jsx | `modal-stock-confirm` | ✓ Stock Confirm Modal |

### Settings & Management

| #   | Modal File               | Permission Key           | Display Name              |
| --- | ------------------------ | ------------------------ | ------------------------- |
| 10  | ConfirmModal.jsx         | `modal-confirm`          | ❓ Confirm Modal          |
| 11  | KitchenSettingsModal.jsx | `modal-kitchen-settings` | ⚙️ Kitchen Settings Modal |
| 12  | RolePermissionModal.jsx  | `modal-role-permission`  | 🔐 Role Permission Modal  |

---

## 🔐 ROLE-BASED PERMISSION SETS

### Admin Role

- **Permissions**: `["all"]`
- **Access**: All pages, components, and modals

### Manager Role

- **Permissions**:
  - Pages: `dashboard`, `orders`, `kitchen`, `products`, `suppliers`, `staff`, `reports`, `transaction-screen`
  - Modals: `modal-payment`, `modal-move-table`, `modal-merge-table`, `modal-phone-order`, `modal-discount`

### Cashier Role

- **Permissions**:
  - Pages: `dashboard`, `orders`, `table-overview`, `transaction-screen`, `takeaway-overview`
  - Modals: `modal-payment`, `modal-move-table`, `modal-merge-table`, `modal-phone-order`
  - Components: `staff-payroll`, `staff-checkin`

### Driver Role

- **Permissions**:
  - Pages: `dashboard`, `orders`
  - Features: `delivery`, `packet-orders`

### Staff Role

- **Permissions**:
  - Pages: `dashboard`
  - Components: `staff-checkin`, `staff-schedule`, `staff-payroll`
  - Features: `phone-orders`, `packet-orders` (view only)

---

## 📊 Summary Statistics

| Category            | Count                                      |
| ------------------- | ------------------------------------------ |
| **Pages**           | 25                                         |
| **UI Components**   | 5                                          |
| **Modals**          | 12                                         |
| **Permission Keys** | 50+                                        |
| **Roles**           | 5 (Admin, Manager, Cashier, Driver, Staff) |

---

## 🎯 Usage Example

```javascript
// In RolePermissionModal.jsx
const PERMISSION_LABELS = {
  dashboard: "📊 Dashboard",
  "table-overview": "🍽 Table Overview",
  orders: "📋 Orders",
  kitchen: "🍳 Kitchen",
  products: "🛍 Products",

  // UI Components
  "staff-payroll": "💼 Payroll (UI)",
  "staff-checkin": "🔐 Staff Check-In (UI)",

  // Modals
  "modal-move-table": "🔄 Move Table Modal",
  "modal-payment": "💳 Payment Modal",
  "modal-phone-order": "📞 Phone Order Modal",
  // ... etc
};

// User permissions
const userPermissions = [
  "dashboard",
  "orders",
  "modal-payment",
  "staff-checkin",
];

// Check access
function hasAccess(permission) {
  return (
    userPermissions.includes(permission) || userPermissions.includes("all")
  );
}
```

---

## 🔄 Implementation Checklist

- [x] Map all 25 pages to permission keys
- [x] Map all 5 UI components to permission keys
- [x] Map all 12 modals to permission keys
- [x] Add emoji indicators for easy visual identification
- [x] Organize by category (pages, components, modals)
- [x] Create reference guide
- [ ] Update backend role definitions
- [ ] Add permission checks to page access guards
- [ ] Add permission checks to modal visibility
- [ ] Test all role-based access scenarios

---

**Last Updated**: December 8, 2025
