# TableOverview.jsx - Code Analysis Report

## 🔍 Issues Found

### 🔴 CRITICAL Issues

#### 1. **Duplicate JSON Parsing Functions**

- **Lines**: 458 (`safeParseJson`) and 2313 (`safeParse`)
- **Issue**: Two functions doing the exact same thing with different names
- **Impact**: Code duplication, confusion about which to use
- **Fix**: Remove `safeParse` at line 2313, use `safeParseJson` consistently

```javascript
// Line 458 - KEEP THIS
const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Line 2313 - REMOVE THIS (duplicate)
function safeParse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
```

#### 2. **Unused State Variable: `kitchenOrders`**

- **Line**: 594
- **Issue**: State variable declared but never used (only `setKitchenOrders` is called once)
- **Impact**: Unnecessary state management, memory waste
- **Usage**:
  - Declared at line 594
  - Set at line 1771 via `fetchKitchenOrders()`
  - **NEVER READ** - the component uses `kitchenOpenOrders` instead
- **Fix**: Remove this state variable entirely

#### 3. **Unused State Variable: `phoneOrders`**

- **Line**: 599
- **Issue**: State variable declared but never actually rendered or used
- **Impact**: Unnecessary state management
- **Usage**:
  - Declared at line 599
  - Set at line 1802 via `fetchPhoneOrders()`
  - **NEVER RENDERED** - phone tab uses `<Orders />` component, not `phoneOrders`
- **Fix**: Remove if truly unused, or integrate into the phone tab UI

### 🟡 HIGH Priority Issues

#### 4. **Redundant Function: `fetchKitchenOrders`**

- **Lines**: 1702-1775
- **Issue**: Function `fetchKitchenOrders` exists but is only referenced in one place (line 2304 - within itself as a refetch)
- **Impact**: This function fetches kitchen orders but the data (`kitchenOrders`) is never displayed
- **Context**: The kitchen tab uses `kitchenOpenOrders` (from `fetchKitchenOpenOrders`), not `kitchenOrders`
- **Fix**: Either remove entirely or integrate with kitchen tab rendering

#### 5. **Inconsistent Naming Convention**

- **Issue**: Mix of snake_case (from backend) and camelCase (frontend)
- **Examples**:
  - `order_type` vs `orderType`
  - `table_number` vs `tableNumber`
  - `customer_name` vs `customerName`
- **Impact**: Makes code harder to read and maintain
- **Fix**: Normalize all backend data to camelCase on fetch

#### 6. **Missing Error Boundaries**

- **Issue**: No try-catch blocks around critical rendering logic
- **Location**: Table mapping (lines 2073+), order rendering
- **Impact**: One malformed order could crash entire page
- **Fix**: Add error boundaries around map operations

#### 7. **Potential Memory Leak in Socket Listeners**

- **Lines**: 2027-2040
- **Issue**: Socket event listeners added in useEffect, but cleanup may not remove all
- **Impact**: Multiple listeners could accumulate on hot reload
- **Fix**: Verify all event listeners are properly cleaned up

### 🟠 MEDIUM Priority Issues

#### 8. **Excessive State Variables** (30+ useState declarations)

- **Issue**: Component has 30+ individual state variables
- **Impact**:
  - Hard to maintain
  - Potential for stale closures
  - Performance issues with re-renders
- **Fix**: Group related state into objects using `useReducer` or context

#### 9. **Large Component Size** (3,554 lines)

- **Issue**: Component is massive and does too many things
- **Recommendation**: Split into smaller components:
  - `RegisterModal` component
  - `TableGrid` component
  - `KitchenOrders` component
  - `PhoneOrders` component
  - `TakeawayOrders` component

#### 10. **Repeated Order Status Checks**

- **Issue**: Same status normalization logic repeated throughout
- **Locations**: Lines 1095, 1145, 1173, 1197, 1374, etc.
- **Fix**: Create helper hooks or memoized utilities

#### 11. **Inconsistent Date Formatting**

- **Functions**: `formatLocalYmd`, `normalizeDateToYmd`, `parseLooseDateToMs`
- **Issue**: Multiple date parsing/formatting approaches
- **Impact**: Harder to debug date-related issues
- **Fix**: Standardize on one date library (date-fns or dayjs)

#### 12. **Magic Numbers**

- **Examples**:
  - `1` minute delay check (line 38)
  - `500` max table count (line 510)
  - `60000` ms in minute calculations
- **Fix**: Extract to named constants at top of file

#### 13. **Duplicate Logic in Fetch Functions**

- **Pattern**: All fetch functions follow similar pattern:
  ```javascript
  try {
    const data = await secureFetch(...);
    const filtered = data.filter(...);
    setState(filtered);
  } catch (err) {
    console.error(...);
  }
  ```
- **Fix**: Create generic `useFetchOrders` hook with options

### 🔵 LOW Priority Issues

#### 14. **Console Logs Should Use Logger**

- **Examples**: Lines 1773-1774, many error handlers
- **Fix**: Replace with proper logging utility

#### 15. **Missing TypeScript/PropTypes**

- **Issue**: No type checking for complex objects
- **Impact**: Runtime errors from malformed data
- **Fix**: Add PropTypes or migrate to TypeScript

#### 16. **Hard-coded Strings Should Use i18n**

- **Examples**: "Main Hall", "VIP", area labels
- **Impact**: Not fully internationalized
- **Fix**: Move all strings to translation files

#### 17. **Inline Styles in JSX**

- **Line**: 3072 - `style={{ boxShadow: ... }}`
- **Fix**: Extract to CSS modules or Tailwind classes

#### 18. **Complex Ternary Expressions**

- **Example**: Lines 2445-2460 (nested ternaries for card styling)
- **Fix**: Extract to helper functions for readability

## 📊 Summary Statistics

| Metric                     | Count   |
| -------------------------- | ------- |
| **Total Lines**            | 3,554   |
| **useState Declarations**  | 30+     |
| **useEffect Hooks**        | 15+     |
| **useCallback Hooks**      | 15+     |
| **Fetch Functions**        | 6       |
| **Helper Functions**       | 25+     |
| **Duplicate Functions**    | 2 pairs |
| **Unused State Variables** | 2       |

## 🎯 Recommended Action Plan

### Phase 1: Critical Fixes (Do First)

1. ✅ Remove duplicate `safeParse` function (use `safeParseJson`)
2. ✅ Remove unused `kitchenOrders` state
3. ✅ Remove unused `phoneOrders` state or integrate it
4. ✅ Remove unused `fetchKitchenOrders` function

### Phase 2: Code Quality

1. Group related state into objects/reducer
2. Add error boundaries around rendering
3. Standardize naming conventions
4. Extract magic numbers to constants

### Phase 3: Architecture

1. Split into smaller components
2. Create custom hooks for common patterns
3. Add TypeScript types
4. Optimize re-renders with React.memo

## 🔧 Immediate Fixes Available

The following can be fixed immediately without breaking changes:

1. **Remove duplicate `safeParse`** - safe to remove
2. **Remove `kitchenOrders` state** - not used anywhere
3. **Remove `phoneOrders` state** - phone tab doesn't use it
4. **Remove `fetchKitchenOrders`** - data never displayed

These 4 fixes will reduce code by ~100 lines and eliminate confusion.
