# Web & Mobile Permission Mapping

## Web Dashboard (25 Pages)

- Dashboard → `dashboard`
- Table Overview → `table-overview`
- Orders → `orders` + `orders.tables|takeaway|packet|kitchen|history|phone`
- Kitchen → `kitchen`
- Products → `products`
- Suppliers → `suppliers`
- Stock → `stock`
- QR Menu → `qr-menu`
- QR Menu Settings → `qr-menu-settings`
- Staff → `staff`
- Task → `task`
- Reports → `reports`
- Cash Register History → `cash-register`
- Ingredient Prices → `ingredient-prices`
- Integrations → `integrations`
- Customer Insights → `customer-insights`
- Marketing Campaigns → `marketing-campaigns`
- Maintenance → `maintenance`
- Takeaway Overview → `takeaway-overview`
- Printers Page → `printers-page`
- Transaction Screen → `transaction-screen`
- User Management → `user-management`
- Expenses → `expenses`
- Production → `production`

## Web UI Components (5 Total)

- Payroll.jsx → `staff-payroll`
- StaffCheckIn.jsx → `staff-checkin`
- StaffSchedule.jsx → `staff-schedule`
- button.jsx → (utility, no permission needed)
- card.jsx → (utility, no permission needed)

## Web Modals (12 Total)

- MoveTableModal → `modal-move-table`
- MergeTableModal → `modal-merge-table`
- PaymentModal → `modal-payment`
- PhoneOrderModal → `modal-phone-order`
- SupplierCartModal → `modal-supplier-cart`
- DiscountModal → `modal-discount`
- ExtrasModal → `modal-extras`
- RecipeModal → `modal-recipe`
- StockConfirmModal → `modal-stock-confirm`
- ConfirmModal → `modal-confirm`
- KitchenSettingsModal → `modal-kitchen-settings`
- RolePermissionModal → `modal-role-permission`

## Mobile App Routes (Beypro Admin Mobile)

### Main Navigation

- `/` (Dashboard) → `dashboard`
- `/orders` → `orders`
- `/kitchen` → `kitchen`
- `/products` → `products`
- `/suppliers` → `suppliers`
- `/stock` → `stock`
- `/staff` → `staff`
- `/tasks` → `task`
- `/reports` → `reports`
- `/settings` → `settings`

### Sub-Routes

- `/finance` → `payments|expenses`
- `/ingredients` → `ingredient-prices`
- `/integrations` → `integrations`
- `/insights` → `customer-insights`
- `/maintenance` → `maintenance`
- `/marketing` → `marketing-campaigns`
- `/menu` → `qr-menu`
- `/notifications` → `notifications`
- `/production` → `production`
- `/qr-menu` → `qr-menu`
- `/user-management` → `user-management`

### Staff Sub-Routes

- `/staff/attendance` → `staff.checkin`
- `/staff/payroll` → `staff.payroll`
- `/staff/schedule` → `staff.schedule`

### Order Sub-Routes

- `/orders/tables` → `orders.tables`
- `/orders/takeaway` → `orders.takeaway`
- `/orders/packet` → `orders.packet`
- `/orders/kitchen` → `orders.kitchen`
- `/orders/history` → `orders.history`
- `/orders/phone` → `orders.phone`

## Role Definitions

### Admin Role

- Permissions: `["all"]` (full access to everything)

### Cashier Role

- `orders`
- `orders.tables`
- `orders.takeaway`
- `orders.packet`
- `orders.kitchen`
- `orders.history`
- `orders.phone`
- `payments`
- `modal-payment`
- `modal-phone-order`
- `modal-discount`
- `transaction-screen`

### Driver Role

- `delivery`
- `orders.packet`
- `orders.history`

### Staff Role

- `dashboard`
- `staff.checkin`
- `staff.payroll`
- `orders.packet`
- `staff-checkin` (UI component)
- `staff-payroll` (UI component)

### Manager Role (Suggested)

- All of Cashier +
- `kitchen`
- `products`
- `stock`
- `reports`
- `staff`
- `task`

## Permission Grouping Strategy

### By Feature Type

1. **Navigation Permissions** (Pages)
   - dashboard, orders, kitchen, products, etc.

2. **Order Sub-Permissions** (Granular)
   - orders.tables, orders.takeaway, orders.packet, etc.

3. **UI Component Permissions** (Reusable Components)
   - staff-checkin, staff-payroll, staff-schedule

4. **Modal Permissions** (Dialog/Popup Modals)
   - modal-\* prefix for all modal permissions

5. **Settings Sub-Permissions** (Configuration)
   - settings-\* prefix for setting pages

## Implementation Notes

- All permission keys are **lowercase**
- Use **dot notation** for hierarchical permissions (e.g., `orders.tables`)
- Use **modal-** prefix for modal dialog permissions
- Use **settings-** prefix for settings sub-pages
- Use **staff.** prefix for staff management sub-features
- Mobile and Web share the same permission system
- Backend validates permissions at API endpoint level
