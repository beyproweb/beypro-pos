// test/manual-receipt-customisation-check.md

# Manual Receipt Customisation Test

## Purpose

Verify that receipt customisations (header, footer, logo, alignment, etc.) are applied to printed receipts after saving changes in the Printer settings tab.

## Steps

1. Open the POS app in two browser tabs:
   - Tab 1: Go to Settings → Printers (PrinterTabModern)
   - Tab 2: Go to Sales/Orders/Transaction screen (where receipts are printed)

2. In Tab 1 (Settings):
   - Change the receipt header, footer, logo, or alignment.
   - Save the changes (wait for the "saved" message).

3. In Tab 2 (Sales/Orders):
   - Print a test receipt or complete a sale to trigger a real receipt print.

4. **Check the printed receipt:**
   - The header, footer, logo, and alignment should match the changes made in Tab 1.
   - The currency symbol should be correct (not a question mark).

5. **If changes do not appear:**
   - Reload Tab 2 and repeat the print.
   - If it works after reload, the sync is not working as intended.
   - If it still does not work, there may be a bug in the layout or currency sync logic.

## Expected Result

- Receipt customisations are reflected immediately after saving, without needing to reload the sales/print screen.
- Currency symbol is correct.

---

If this test fails, please report the following:

- What customisation did not apply?
- Did you see the correct preview in the settings tab?
- Did you try reloading the sales/print tab?
- Any errors in the browser console?
