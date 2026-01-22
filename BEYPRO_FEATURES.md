# Beypro – Feature Overview

This document lists the features currently available in the Beypro dashboard app (availability depends on your role permissions, enabled modules, and plan).

## Platforms

- Web dashboard (works in modern browsers on Windows/macOS)
- Desktop support via Beypro Bridge binaries (Windows/macOS/Linux downloads exposed by the backend) for printer/bridge workflows
- Customer-facing QR Menu + instant restaurant website (public routes like `/:slug`, `/qr`, `/menu`) for ordering from home or scanning at the table
- Mobile-ready flows (QR Menu for customers; staff/admin workflows designed to run on mobile browsers and companion mobile builds where used)

## Core POS & Orders

- Table overview with tabs (Tables, Pre Order/Takeaway, Kitchen, History, Packet, Phone, Register)
- Table orders workflow (open table, add items, discounts, payments, close table)
- Packet/Delivery and Phone order flows
- Transaction screen for table/phone orders (review, update, payment, close)
- Order printing utilities (receipt formatting, bridge printing)
- Customer database + customer addresses (stored addresses used by delivery/phone orders)
- Drinks module (drinks list / drink-specific flows exist in backend)
- Tables management data (table list/areas/labels supported)

## Register & Cash Management

- Register open/close state, opening cash, end-of-day workflows
- Cash register history / logs
- Expenses tracking (including register checks/guards when required)
- Cash drawer support (via configured printer/drawer settings)
- Subscription/billing support (backend includes subscription endpoints and billing-cycle data)

## Kitchen Operations

- Kitchen order view and status updates (preparing/ready/delivered flows)
- Kitchen settings modal (category/product selection patterns exist in codebase)
- Kitchen timers / scheduler job (backend job runner for kitchen timing logic)

## Products, Stock, Suppliers

- Products management (create/update products and categories)
- Stock management and low-stock alerting
- Ingredient prices tracking
- Suppliers management (supplier list, cart flow, purchasing receipts, price tracking, profile/balance, transactions)
- Supplier Cart auto-ordering (scheduled supplier cart emails with repeat rules + auto-send option)
  - Schedule date/time + repeat (weekly/biweekly/monthly)
  - Auto-send by schedule, with “pending scheduled orders” list and cancel
  - Auto-add low stock items to cart (backend route exists for auto supplier orders)
- Category images support (used by the QR menu and category display)

## Staff Management

- Staff check-in (QR-based check-in/out with optional geo restrictions)
- Staff scheduling
- Payroll and staff payments management
- Role/permission-gated staff features (check-in, schedule, payroll, send shift, add staff, payments)

## Reports & Analytics

- Reports page with exports and selectable sections
- Customer insights page

## Tasks & Maintenance

- Task tracking page
- Maintenance tracker page

## Marketing

- Marketing campaigns page (WhatsApp campaign workflows exist in the codebase)
- WhatsApp webhook integration (backend webhook endpoint exists)

## Integrations

- Integrations settings page
- Platform integrations support (Yemeksepeti, Getir, Trendyol, Migros)
  - Enable/disable per platform
  - Credentials / identifiers per platform (where applicable)
  - Menu sync toggle (where supported)
  - Auto-confirm orders toggle
  - Yemeksepeti mapping tools (unmatched items, mapping management)
- WhatsApp auto order message integration toggle
- Payment gateway integration (Iyzico routes are mounted when configured)

## QR Menu

- Public QR/menu entry routes (`/qr`, `/menu`, `/:slug`, and legacy `/qr-menu/:slug/:id`) that act as an instant restaurant website
- Customers can browse the menu and place orders from home (via the public site) or scan from the table
- Public QR endpoints support:
  - Restaurant info + QR link generation
  - Products, tables, extras groups, category images
  - QR menu customization (branding/theme, story, gallery, social links, delivery/pickup toggles, table geo restriction options)
  - “Popular this week” products
  - Loyalty points system (QR loyalty card backend)
- QR menu settings page (protected, admin-facing)

## Printers & Cameras

- Printers management pages (default printers, test prints, LAN scan, bridge printing)
- Cameras page (live camera views/config patterns)

## App Settings (Settings Page Tabs)

- Shop hours
- Localization (language/currency support patterns)
- Notifications (toast + sound settings, event sounds)
- Subscription
- Payment methods
- Register settings
- Users / user management
- Integrations (settings tab)
- Inventory/logs (log files tab)
- Appearance (theme)
- Printers (modern printer tab)
- Cameras
- Tables settings (table label text, show areas)
- Transactions settings (auto-close options, disable auto-print options, UI toggles)

## Security & Access Control

- Role-based permissions across pages and settings tabs
- Module gating via plan/module configuration (dashboard shortcuts and sidebar items)
- Auth + public endpoints separation (protected `/api/*` and public `/api/public/*` patterns)
