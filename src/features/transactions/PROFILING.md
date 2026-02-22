# Transaction Screen Profiling Checklist

## React DevTools Profiler Workflow
1. Open React DevTools Profiler in development mode.
2. Start recording and run these flows in order:
   - Switch categories several times.
   - Type in product search input.
   - Add 10 items quickly to cart.
   - Toggle split payment mode on/off.
   - Open and close transaction modals (payment, discount, extras, reservation/cancel).
3. Stop recording and inspect flamegraph + ranked views.

## What To Inspect
- `ProductGridSection` render count and total commit time.
- `CartPanelContainer` render count and total commit time.
- `CategoryButton` rerenders during unrelated state updates (cart-only or modal-only changes).

## Acceptance Criteria
- Switching category does not force unnecessary rerenders across the full screen tree.
- Toggling modals does not heavily rerender `ProductGridSection`.
- Adding a cart item rerenders cart/totals paths, while product grid rerenders only when product/category/search inputs actually change.

## Quick Regression Checklist
- Add/remove items works.
- Confirm/pay flows work.
- Split payment flow works.
- Debt flow works.
- Reservation flow works.
- Cancel flow works.
- No stuck UI, stale totals, stale labels, or missed updates.
