# Transaction Virtualization

## When To Enable
- Enable product virtualization when menu size is large (roughly 500+ visible products).
- Enable cart virtualization when orders have long histories and cart rendering becomes a bottleneck.

## Flags
These flags live in `transactions` settings with safe defaults OFF:
- `enableProductGridVirtualization` (default `false`)
- `enableCartVirtualization` (default `false`)
- `virtualizationProductOverscan` (default `6`)
- `virtualizationCartOverscan` (default `8`)

Env fallback is also supported in development/deploy configs:
- `VITE_TX_VIRTUALIZE_PRODUCTS=true`
- `VITE_TX_VIRTUALIZE_CART=true`

## Current Strategy
- Product grid: windowed rendering (progressive chunk loading while scrolling).
- Cart list: windowed rendering from latest items with progressive older-item loading.

## Safety Fallbacks
- If virtualization is enabled but the required scroll container ref is missing, rendering falls back to normal mode.
- Cart windowing auto-pauses when expanded cart rows are active (dynamic row heights).
- Fallback notices are DEV-only console warnings.

## Known Limitations
- Windowing is intentionally conservative and avoids layout/markup changes.
- Cart windowing focuses on keeping latest items responsive; older items are loaded progressively when scrolling upward.

## Verification
1. Enable flags in transaction settings.
2. Use React Profiler while switching categories, searching, and rapidly adding cart items.
3. Confirm UI and interactions match baseline behavior.
4. Check DOM node count in DevTools:
   - Product card node count should stay bounded while scrolling.
   - Cart item node count should stay bounded with long histories.
