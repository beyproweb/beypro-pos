import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { getCheckoutPrefill, useCustomerAuth } from "../features/qrmenu/header-drawer";
import {
  getEffectiveBookingMaxDaysInAdvance,
  normalizeQrBookingSettings,
  normalizeReservationTimeSlotOptions,
} from "../utils/qrBooking";
import {
  buildReservationContactPath,
  buildPublicMenuPath,
  resolvePublicBookingIdentifier,
} from "../features/qrmenu/publicBookingRoutes";
import { mergeFloorPlanVisualStyles } from "../features/floorPlan/utils/floorPlan";
import BookingPageLayout from "../features/floorPlan/components/BookingPageLayout";
import BookingSection from "../features/floorPlan/components/BookingSection";
import BookingSummaryCard from "../features/floorPlan/components/BookingSummaryCard";
import FloorPlanPickerModal from "../features/floorPlan/components/FloorPlanPickerModal";
import RegisteredCustomerBadge from "../features/floorPlan/components/RegisteredCustomerBadge";
import {
  buildGuestComposition,
  buildGuestCountOptions,
  EMAIL_REGEX,
  formatQrPhoneForInput,
  getGuestCompositionValidationError,
  guestCompositionRuleRequiresInput,
  hasGuestCompositionValue,
  normalizeGuestCompositionFieldMode,
  normalizeGuestCompositionRestrictionRule,
  normalizeGuestCountSelection,
  normalizeQrPhone,
  parseGuestCompositionCount,
  QR_PHONE_REGEX,
  resolveGuestCompositionPolicyMessage,
} from "../features/floorPlan/utils/bookingRules";

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function formatTableLabel(tableLike, fallbackPrefix = "Table") {
  const number = Number(
    tableLike?.table_number ?? tableLike?.tableNumber ?? tableLike?.number ?? tableLike
  );
  if (!Number.isFinite(number) || number <= 0) return fallbackPrefix;
  const label = String(tableLike?.label || tableLike?.name || "").trim();
  return label || `${fallbackPrefix} ${String(number).padStart(2, "0")}`;
}

function getActiveTables(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.active !== false);
}

function buildReservationApiPath(identifier, pathname = "/orders/reservations") {
  const params = new URLSearchParams();
  if (identifier) {
    params.set("identifier", identifier);
  }
  return `${pathname}?${params.toString()}`;
}

function normalizeHexColor(value, fallback = "#111827") {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

export default function QrReservationBookingPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id } = useParams();
  const identifier = React.useMemo(
    () => resolvePublicBookingIdentifier({ slug, id, search: location.search }),
    [id, location.search, slug]
  );
  const menuPath = React.useMemo(
    () => buildPublicMenuPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const contactPath = React.useMemo(
    () => buildReservationContactPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const storage = React.useMemo(() => getStorage(), []);
  const { customer, isLoggedIn } = useCustomerAuth(storage);
  const customerPrefill = React.useMemo(() => getCheckoutPrefill(storage), [storage]);
  const customerEmailPrefill = React.useMemo(() => {
    const value = String(customerPrefill?.email || "").trim().toLowerCase();
    return !value || EMAIL_REGEX.test(value) ? value : "";
  }, [customerPrefill?.email]);

  const [settings, setSettings] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slots, setSlots] = React.useState([]);
  const [floorPlanLoading, setFloorPlanLoading] = React.useState(false);
  const [floorPlan, setFloorPlan] = React.useState(null);
  const [floorPlanSource, setFloorPlanSource] = React.useState("generated");
  const [tableStates, setTableStates] = React.useState([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const confirmationSectionRef = React.useRef(null);
  const previousConfirmedTableRef = React.useRef("");
  const [form, setForm] = React.useState({
    reservation_date: "",
    reservation_time: "",
    reservation_clients: "2",
    reservation_men: "",
    reservation_women: "",
    table_number: "",
    name: customerPrefill?.name || "",
    phone: formatQrPhoneForInput(customerPrefill?.phone || ""),
    email: customerEmailPrefill,
    notes: "",
  });

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || customerPrefill?.name || "",
      phone: prev.phone || formatQrPhoneForInput(customerPrefill?.phone || ""),
      email: prev.email || customerEmailPrefill,
    }));
  }, [customerEmailPrefill, customerPrefill]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!identifier) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [customizationRes, tablesRes] = await Promise.all([
          secureFetch(`/public/qr-menu-customization/${encodeURIComponent(identifier)}`),
          secureFetch(`/public/tables/${encodeURIComponent(identifier)}`),
        ]);
        if (cancelled) return;
        setSettings(
          customizationRes?.customization
            ? {
                ...customizationRes.customization,
                ...normalizeQrBookingSettings(customizationRes.customization),
              }
            : normalizeQrBookingSettings({})
        );
        setTables(getActiveTables(tablesRes));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation booking page:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [identifier]);

  const guestCompositionFieldMode = normalizeGuestCompositionFieldMode(
    settings?.reservation_guest_composition_field_mode,
    "hidden"
  );
  const guestCompositionRule = normalizeGuestCompositionRestrictionRule(
    settings?.reservation_guest_composition_restriction_rule,
    "no_restriction"
  );
  const selectedTableNumber = Number(form.table_number || 0);
  const guestCompositionDisabledTables = Array.isArray(
    settings?.reservation_guest_composition_disabled_tables
  )
    ? settings.reservation_guest_composition_disabled_tables
    : [];
  const guestCompositionEnabled =
    Boolean(settings?.reservation_guest_composition_enabled) &&
    !guestCompositionDisabledTables.includes(selectedTableNumber);
  const guestCompositionRequiresInput = guestCompositionRuleRequiresInput(guestCompositionRule);
  const guestCompositionEffectiveFieldMode = guestCompositionRequiresInput
    ? "required"
    : guestCompositionFieldMode;
  const guestCompositionVisible =
    guestCompositionEnabled && guestCompositionEffectiveFieldMode !== "hidden";
  const guestCountLimit = React.useMemo(() => {
    const fromTables = (Array.isArray(tables) ? tables : []).reduce((max, table) => {
      const seats = Number(table?.seats || 0);
      return Number.isFinite(seats) && seats > 0 ? Math.max(max, seats) : max;
    }, 0);
    return fromTables > 0 ? fromTables : 20;
  }, [tables]);
  const guestOptions = React.useMemo(
    () => buildGuestCountOptions(guestCountLimit, guestCompositionRule === "couple_only"),
    [guestCompositionRule, guestCountLimit]
  );
  const selectedGuestCount = Number(
    normalizeGuestCountSelection(form.reservation_clients, guestOptions) || 0
  );
  const menCount = parseGuestCompositionCount(form.reservation_men);
  const womenCount = parseGuestCompositionCount(form.reservation_women);
  const hasGuestCompositionInput =
    hasGuestCompositionValue(form.reservation_men) || hasGuestCompositionValue(form.reservation_women);
  const guestCompositionMessage =
    guestCompositionVisible && guestCompositionRule !== "no_restriction"
      ? resolveGuestCompositionPolicyMessage(
          settings?.reservation_guest_composition_validation_message,
          guestCompositionRule,
          t
        )
      : "";
  const guestCompositionError = getGuestCompositionValidationError({
    enabled: guestCompositionEnabled,
    fieldMode: guestCompositionEffectiveFieldMode,
    restrictionRule: guestCompositionRule,
    validationMessage: guestCompositionMessage,
    totalGuests: selectedGuestCount,
    menGuests: form.reservation_men,
    womenGuests: form.reservation_women,
    translate: t,
  });

  React.useEffect(() => {
    if (!guestCompositionVisible) {
      setForm((prev) =>
        !prev.reservation_men && !prev.reservation_women
          ? prev
          : { ...prev, reservation_men: "", reservation_women: "" }
      );
      return;
    }
    setForm((prev) => {
      const hasInput =
        hasGuestCompositionValue(prev.reservation_men) || hasGuestCompositionValue(prev.reservation_women);
      if (guestCompositionEffectiveFieldMode === "optional" && !hasInput) {
        return prev;
      }
      const nextComposition = buildGuestComposition(
        prev.reservation_clients,
        prev.reservation_men,
        prev.reservation_women,
        { menKey: "reservation_men", womenKey: "reservation_women" }
      );
      if (
        prev.reservation_men === nextComposition.reservation_men &&
        prev.reservation_women === nextComposition.reservation_women
      ) {
        return prev;
      }
      return { ...prev, ...nextComposition };
    });
  }, [form.reservation_clients, guestCompositionEffectiveFieldMode, guestCompositionVisible]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      if (!identifier || !form.reservation_date) {
        setSlots([]);
        return;
      }
      setSlotsLoading(true);
      try {
        const params = new URLSearchParams({
          date: form.reservation_date,
          slots: "1",
        });
        if (selectedGuestCount > 0) {
          params.set("guest_count", String(selectedGuestCount));
        }
        const response = await secureFetch(
          `/public/unavailable-tables/${encodeURIComponent(identifier)}?${params.toString()}`
        );
        if (cancelled) return;
        setSlots(normalizeReservationTimeSlotOptions(response?.time_slots || [], t));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation slots:", error);
          setSlots([]);
        }
      } finally {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      }
    }
    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [form.reservation_date, identifier, selectedGuestCount, t]);

  React.useEffect(() => {
    if (!form.reservation_time) return;
    const currentTime = String(form.reservation_time || "").slice(0, 5);
    const slotStillAvailable = slots.some((slot) => slot.time === currentTime && slot.isAvailable);
    if (!slotStillAvailable) {
      setForm((prev) => ({ ...prev, reservation_time: "" }));
    }
  }, [form.reservation_time, slots]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPlan() {
      if (!identifier) return;
      setFloorPlanLoading(true);
      try {
        const params = new URLSearchParams();
        if (form.reservation_date) params.set("date", form.reservation_date);
        if (form.reservation_time) params.set("time", form.reservation_time);
        if (selectedGuestCount > 0) params.set("guest_count", String(selectedGuestCount));
        if (hasGuestCompositionInput) {
          params.set("reservation_men", String(menCount));
          params.set("reservation_women", String(womenCount));
        }
        const query = params.toString();
        const response = await secureFetch(
          `/public/floor-plan/${encodeURIComponent(identifier)}${query ? `?${query}` : ""}`
        );
        if (cancelled) return;
        setFloorPlan(mergeFloorPlanVisualStyles(response?.layout || null, settings?.qr_floor_plan_layout));
        setFloorPlanSource(String(response?.source || "generated"));
        setTableStates(Array.isArray(response?.table_states) ? response.table_states : []);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation floor plan:", error);
          setFloorPlan(null);
          setTableStates([]);
        }
      } finally {
        if (!cancelled) {
          setFloorPlanLoading(false);
        }
      }
    }
    loadPlan();
    return () => {
      cancelled = true;
    };
  }, [
    form.reservation_date,
    form.reservation_time,
    hasGuestCompositionInput,
    identifier,
    menCount,
    settings,
    selectedGuestCount,
    womenCount,
  ]);

  const selectedTableState = React.useMemo(() => {
    return (
      (Array.isArray(tableStates) ? tableStates : []).find(
        (state) => Number(state?.table_number) === selectedTableNumber
      ) || null
    );
  }, [selectedTableNumber, tableStates]);
  const selectedTableRecord = React.useMemo(() => {
    return (
      (Array.isArray(tables) ? tables : []).find(
        (table) =>
          Number(table?.number ?? table?.tableNumber ?? table?.table_number) === selectedTableNumber
      ) || null
    );
  }, [selectedTableNumber, tables]);

  React.useEffect(() => {
    const selectedNumber = Number(form.table_number || 0);
    if (!selectedNumber) return;
    const currentState = (Array.isArray(tableStates) ? tableStates : []).find(
      (state) => Number(state?.table_number) === selectedNumber
    );
    if (!currentState || String(currentState.status || "").toLowerCase() !== "available") {
      setForm((prev) => ({ ...prev, table_number: "" }));
    }
  }, [form.table_number, tableStates]);

  const phoneValue = normalizeQrPhone(form.phone);
  const phoneValid = QR_PHONE_REGEX.test(phoneValue);
  const emailValid = !String(form.email || "").trim() || EMAIL_REGEX.test(String(form.email).trim());
  const hasRegisteredProfile = Boolean(isLoggedIn && form.name.trim() && phoneValid && emailValid);
  const hasConfirmedTable = Number(form.table_number || 0) > 0;
  const selectedTimeSlot = slots.find(
    (slot) => slot.time === String(form.reservation_time || "").slice(0, 5)
  );
  const formErrors = {
    name: form.name.trim() ? "" : t("Please enter your name."),
    phone: phoneValid ? "" : t("Please enter a valid phone number."),
    email: emailValid ? "" : t("Please enter a valid email address."),
  };
  const canSubmit =
    form.name.trim() &&
    phoneValid &&
    emailValid &&
    form.reservation_date &&
    form.reservation_time &&
    selectedTimeSlot?.isAvailable &&
    Number(form.table_number || 0) > 0 &&
    !guestCompositionError &&
    !submitting;

  const accentColor = normalizeHexColor(settings?.primary_color, "#111827");
  const summaryItems = [
    {
      label: t("Date"),
      value: form.reservation_date || "",
    },
    {
      label: t("Time"),
      value: form.reservation_time || "",
    },
    {
      label: t("Guests"),
      value: selectedGuestCount > 0 ? String(selectedGuestCount) : "",
    },
    {
      label: t("Table"),
      value: selectedTableRecord
        ? formatTableLabel(selectedTableRecord, t("Table"))
        : selectedTableState
          ? formatTableLabel(selectedTableState, t("Table"))
          : "",
    },
    {
      label: t("Layout"),
      value: floorPlanSource ? String(floorPlanSource).replace(/_/g, " ") : "",
    },
  ];

  React.useEffect(() => {
    if (!hasRegisteredProfile) {
      navigate(contactPath, { replace: true });
    }
  }, [contactPath, hasRegisteredProfile, navigate]);

  React.useEffect(() => {
    const nextConfirmedTable = String(form.table_number || "");
    if (
      nextConfirmedTable &&
      nextConfirmedTable !== previousConfirmedTableRef.current &&
      confirmationSectionRef.current
    ) {
      window.requestAnimationFrame(() => {
        confirmationSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
    previousConfirmedTableRef.current = nextConfirmedTable;
  }, [form.table_number]);

  const handleBack = React.useCallback(() => {
    navigate(menuPath);
  }, [menuPath, navigate]);
  const handleEditCustomer = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("edit", "1");
    navigate(params.toString() ? `${contactPath}?${params.toString()}` : contactPath);
  }, [contactPath, location.search, navigate]);

  const handleGuestCompositionDelta = React.useCallback((field, delta) => {
    setForm((prev) => {
      const totalGuests = parseGuestCompositionCount(prev.reservation_clients);
      if (totalGuests <= 0) return prev;
      const currentMen = hasGuestCompositionInput ? parseGuestCompositionCount(prev.reservation_men) : 0;
      const currentWomen = hasGuestCompositionInput ? parseGuestCompositionCount(prev.reservation_women) : 0;
      const nextValue = Math.min(
        totalGuests,
        Math.max(0, (field === "reservation_men" ? currentMen : currentWomen) + delta)
      );
      const nextMen = field === "reservation_men" ? nextValue : totalGuests - nextValue;
      const nextWomen = field === "reservation_women" ? nextValue : totalGuests - nextValue;
      return {
        ...prev,
        reservation_men: String(nextMen),
        reservation_women: String(nextWomen),
      };
    });
  }, [hasGuestCompositionInput]);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) {
      const firstError =
        formErrors.name ||
        formErrors.phone ||
        formErrors.email ||
        (!form.reservation_date ? t("Please select a date.") : "") ||
        (!form.reservation_time ? t("Please select a time.") : "") ||
        (!selectedTimeSlot?.isAvailable ? t("Please select an available time.") : "") ||
        (!Number(form.table_number || 0) ? t("Please select a table from the floor plan.") : "") ||
        guestCompositionError;
      if (firstError) {
        window.alert(firstError);
      }
      return;
    }

    setSubmitting(true);
    try {
      const response = await secureFetch(buildReservationApiPath(identifier), {
        method: "POST",
        body: JSON.stringify({
          table_number: Number(form.table_number || 0),
          reservation_date: form.reservation_date,
          reservation_time: form.reservation_time,
          reservation_clients: selectedGuestCount,
          reservation_men:
            guestCompositionVisible && hasGuestCompositionInput ? menCount : null,
          reservation_women:
            guestCompositionVisible && hasGuestCompositionInput ? womenCount : null,
          reservation_notes: form.notes || "",
          customer_name: form.name.trim(),
          customer_phone: phoneValue,
          customer_email: String(form.email || "").trim().toLowerCase() || null,
        }),
      });
      const reservationOrderId = Number(response?.reservation?.id || 0);
      const resolvedTableNumber = Number(response?.reservation?.table_number || form.table_number || 0);

      storage.setItem("qr_orderType", "table");
      storage.setItem("qr_table", String(resolvedTableNumber));
      storage.setItem("qr_show_status", "1");
      storage.setItem("qr_force_status_until_closed", "1");
      if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
        storage.setItem("qr_active_order_id", String(reservationOrderId));
        storage.setItem(
          "qr_active_order",
          JSON.stringify({
            orderId: reservationOrderId,
            orderType: "table",
            table: resolvedTableNumber,
          })
        );
      }
      navigate(menuPath);
    } catch (error) {
      window.alert(error?.message || t("Failed to save reservation"));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    form.email,
    form.name,
    form.notes,
    form.reservation_date,
    form.reservation_time,
    form.table_number,
    formErrors.email,
    formErrors.name,
    formErrors.phone,
    guestCompositionError,
    guestCompositionVisible,
    hasGuestCompositionInput,
    identifier,
    menuPath,
    menCount,
    navigate,
    phoneValue,
    selectedGuestCount,
    selectedTimeSlot?.isAvailable,
    storage,
    t,
    womenCount,
  ]);

  if (!hasRegisteredProfile) {
    return null;
  }

  const primaryActionLabel = hasConfirmedTable ? t("Reserve Now") : t("Choose Table");
  const primaryActionHelper = hasConfirmedTable
    ? selectedTableState?.capacity
      ? t("Selected table for {{count}} guests", { count: selectedTableState.capacity })
      : t("Secure your reservation in a few taps")
    : t("Pick your table from the live floor plan.");
  const primaryActionHandler = hasConfirmedTable ? handleSubmit : () => setPickerOpen(true);
  const primaryActionDisabled = hasConfirmedTable
    ? !canSubmit
    : !form.reservation_date || !form.reservation_time || pickerOpen;

  return (
    <BookingPageLayout
      title={t("Reserve Table")}
      subtitle={loading ? t("Loading booking page") : t("Step-by-step reservation flow")}
      onBack={handleBack}
      accentColor={accentColor}
      showHeaderIndicator={false}
      actionLabel={submitting && hasConfirmedTable ? t("Saving...") : primaryActionLabel}
      actionHelper={primaryActionHelper}
      onAction={primaryActionHandler}
      actionDisabled={primaryActionDisabled}
    >
      <BookingSection
        step={1}
        title={t("Select Date")}
        description={t("Choose the day you want to visit.")}
      >
        <input
          type="date"
          value={form.reservation_date}
          min={new Date().toISOString().slice(0, 10)}
          max={(() => {
            const next = new Date();
            next.setDate(next.getDate() + getEffectiveBookingMaxDaysInAdvance(settings));
            return next.toISOString().slice(0, 10);
          })()}
          onChange={(event) => setForm((prev) => ({ ...prev, reservation_date: event.target.value }))}
          className="w-full rounded-[24px] border border-neutral-200 bg-white px-4 py-4 text-base dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
        />
      </BookingSection>

      <BookingSection
        step={2}
        title={t("Select Time")}
        description={t("Available slots update live based on your guest count.")}
        rightSlot={
          slotsLoading ? (
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("Loading")}
            </span>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Array.isArray(slots) ? slots : []).map((slot) => {
            const selected = slot.time === form.reservation_time;
            return (
              <button
                key={slot.time}
                type="button"
                disabled={!slot.isAvailable}
                onClick={() => setForm((prev) => ({ ...prev, reservation_time: slot.time }))}
                className={[
                  "rounded-[22px] border px-3 py-3 text-left transition",
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : slot.isAvailable
                      ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                      : "border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">{slot.time}</div>
                <div className="mt-1 text-xs opacity-75">{slot.availabilityLabel}</div>
              </button>
            );
          })}
          {!slotsLoading && slots.length === 0 ? (
            <div className="col-span-full rounded-[22px] border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              {form.reservation_date
                ? t("No reservation slots available for this day.")
                : t("Select a date to load reservation slots.")}
            </div>
          ) : null}
        </div>
      </BookingSection>

      <BookingSection
        step={3}
        title=""
        description={t("Pick your table from the live floor plan.")}
        rightSlot={
          floorPlanLoading ? (
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("Syncing")}
            </span>
          ) : null
        }
      >
        <div className="rounded-[24px] border border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-sm font-semibold text-neutral-950 dark:text-white">
            {selectedTableRecord || selectedTableState
              ? formatTableLabel(selectedTableRecord || selectedTableState, t("Table"))
              : t("No table selected yet")}
          </div>
          <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {selectedTableState?.reason
              ? selectedTableState.reason
              : selectedTableState?.capacity
                ? t("Capacity {{count}} guests", { count: selectedTableState.capacity })
                : t("Use the footer button to open the floor plan.")}
          </div>
        </div>
      </BookingSection>

      {hasConfirmedTable ? (
        <div ref={confirmationSectionRef}>
          <BookingSection
            step={4}
            title={t("Notes & Confirmation")}
            description={t("Add a short note, then review the booking summary.")}
          >
            <RegisteredCustomerBadge
              customer={{
                username: customer?.username || form.name,
                phone: customer?.phone || phoneValue,
                email: customer?.email || form.email,
              }}
              accentColor={accentColor}
              onEdit={handleEditCustomer}
            />
            <label className="block">
              <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {t("Reservation Notes")}
              </div>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <div className="mt-4">
              <BookingSummaryCard items={summaryItems} accentColor={accentColor} />
            </div>
          </BookingSection>
        </div>
      ) : null}

      <FloorPlanPickerModal
        open={pickerOpen}
        title={t("Choose your table")}
        subtitle={t("Live availability for {{date}} {{time}}", {
          date: form.reservation_date || t("selected date"),
          time: form.reservation_time || t("selected time"),
        })}
        layout={floorPlan}
        tables={tables}
        tableStates={tableStates}
        selectedTableNumber={form.table_number}
        accentColor={accentColor}
        guestCompositionProps={{
          title: t("Guest Composition"),
          description: t("Some tables have guest restrictions."),
          guestOptions,
          selectedGuests: selectedGuestCount,
          onGuestCountChange: (option) =>
            setForm((prev) => ({
              ...prev,
              reservation_clients: String(option),
              table_number: "",
            })),
          guestsLabel: t("Guests"),
          menLabel: t("Men"),
          womenLabel: t("Women"),
          menCount: guestCompositionVisible ? menCount : undefined,
          womenCount: guestCompositionVisible ? womenCount : undefined,
          onMenChange: guestCompositionVisible
            ? (delta) => handleGuestCompositionDelta("reservation_men", delta)
            : undefined,
          onWomenChange: guestCompositionVisible
            ? (delta) => handleGuestCompositionDelta("reservation_women", delta)
            : undefined,
          locked: guestCompositionRule === "couple_only",
          error: guestCompositionError,
          policyMessage: guestCompositionMessage,
        }}
        onClose={() => setPickerOpen(false)}
        onConfirm={(node) => {
          setForm((prev) => ({ ...prev, table_number: String(node.table_number || "") }));
          setPickerOpen(false);
        }}
      />
    </BookingPageLayout>
  );
}
