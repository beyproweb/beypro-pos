import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { getCheckoutPrefill, useCustomerAuth } from "../features/qrmenu/header-drawer";
import {
  buildConcertContactPath,
  buildPublicMenuPath,
  resolvePublicBookingIdentifier,
} from "../features/qrmenu/publicBookingRoutes";
import BookingPageLayout from "../features/floorPlan/components/BookingPageLayout";
import BookingSection from "../features/floorPlan/components/BookingSection";
import BookingSummaryCard from "../features/floorPlan/components/BookingSummaryCard";
import FloorPlanPickerModal from "../features/floorPlan/components/FloorPlanPickerModal";
import QuantityStepperCard from "../features/floorPlan/components/QuantityStepperCard";
import RegisteredCustomerBadge from "../features/floorPlan/components/RegisteredCustomerBadge";
import { mergeFloorPlanVisualStyles } from "../features/floorPlan/utils/floorPlan";
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

export default function QrConcertBookingPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id, concertId } = useParams();
  const identifier = React.useMemo(
    () => resolvePublicBookingIdentifier({ slug, id, search: location.search }),
    [id, location.search, slug]
  );
  const menuPath = React.useMemo(
    () => buildPublicMenuPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const contactPath = React.useMemo(
    () =>
      buildConcertContactPath({
        pathname: location.pathname,
        slug,
        id,
        search: location.search,
        concertId,
      }),
    [concertId, id, location.pathname, location.search, slug]
  );
  const routeBookingDefaults = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const requestedTicketTypeId = Number(params.get("ticket_type_id") || 0);
    const requestedBookingType = String(params.get("booking_type") || "").trim().toLowerCase();
    return {
      requestedTicketTypeId:
        Number.isFinite(requestedTicketTypeId) && requestedTicketTypeId > 0
          ? requestedTicketTypeId
          : null,
      requestedBookingType,
    };
  }, [location.search]);
  const storage = React.useMemo(() => getStorage(), []);
  const { customer, isLoggedIn } = useCustomerAuth(storage);
  const customerPrefill = React.useMemo(() => getCheckoutPrefill(storage), [storage]);
  const customerEmailPrefill = React.useMemo(() => {
    const value = String(customerPrefill?.email || "").trim().toLowerCase();
    return !value || EMAIL_REGEX.test(value) ? value : "";
  }, [customerPrefill?.email]);

  const [branding, setBranding] = React.useState(null);
  const [event, setEvent] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [floorPlanLoading, setFloorPlanLoading] = React.useState(false);
  const [floorPlan, setFloorPlan] = React.useState(null);
  const [tableStates, setTableStates] = React.useState([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [invalidField, setInvalidField] = React.useState("");
  const fieldRefs = React.useRef({});
  const confirmationSectionRef = React.useRef(null);
  const previousConfirmedTableRef = React.useRef("");
  const [form, setForm] = React.useState({
    ticket_type_id: "",
    quantity: "1",
    guests_count: "2",
    male_guests_count: "",
    female_guests_count: "",
    table_number: "",
    customer_name: customerPrefill?.name || "",
    customer_phone: formatQrPhoneForInput(customerPrefill?.phone || ""),
    customer_email: customerEmailPrefill,
    customer_note: "",
    bank_reference: customerPrefill?.bank_reference || "",
  });

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      customer_name: prev.customer_name || customerPrefill?.name || "",
      customer_phone: prev.customer_phone || formatQrPhoneForInput(customerPrefill?.phone || ""),
      customer_email: prev.customer_email || customerEmailPrefill,
      bank_reference: prev.bank_reference || customerPrefill?.bank_reference || "",
    }));
  }, [customerEmailPrefill, customerPrefill]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!identifier || !concertId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [brandingRes, eventRes, tablesRes] = await Promise.all([
          secureFetch(`/public/qr-menu-customization/${encodeURIComponent(identifier)}`),
          secureFetch(
            `/public/concerts/${encodeURIComponent(identifier)}/events/${encodeURIComponent(concertId)}`
          ),
          secureFetch(`/public/tables/${encodeURIComponent(identifier)}`),
        ]);
        if (cancelled) return;
        const nextEvent = eventRes?.event || null;
        const ticketTypes = Array.isArray(nextEvent?.ticket_types) ? nextEvent.ticket_types : [];
        const availableTicketTypes = ticketTypes.filter((row) => Number(row?.available_count || 0) > 0);
        const defaultTicketType = routeBookingDefaults.requestedTicketTypeId
          ? availableTicketTypes.find(
              (row) => Number(row?.id) === routeBookingDefaults.requestedTicketTypeId
            ) ||
            ticketTypes.find((row) => Number(row?.id) === routeBookingDefaults.requestedTicketTypeId) ||
            null
          : routeBookingDefaults.requestedBookingType === "table"
            ? availableTicketTypes.find((row) => row?.is_table_package) ||
              availableTicketTypes.find((row) => !row?.is_table_package) ||
              ticketTypes.find((row) => row?.is_table_package) ||
              ticketTypes[0] ||
              null
            : availableTicketTypes.find((row) => !row?.is_table_package) ||
              availableTicketTypes.find((row) => row?.is_table_package) ||
              ticketTypes[0] ||
              null;
        setBranding(brandingRes?.customization || {});
        setEvent(nextEvent);
        setTables(getActiveTables(tablesRes));
        setForm((prev) => ({
          ...prev,
          ticket_type_id: prev.ticket_type_id || (defaultTicketType ? String(defaultTicketType.id) : ""),
        }));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load concert booking page:", error);
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
  }, [concertId, identifier, routeBookingDefaults.requestedBookingType, routeBookingDefaults.requestedTicketTypeId]);

  const ticketTypes = Array.isArray(event?.ticket_types) ? event.ticket_types : [];
  const selectedTicketType = React.useMemo(() => {
    const selectedId = Number(form.ticket_type_id || 0);
    return ticketTypes.find((row) => Number(row?.id) === selectedId) || null;
  }, [form.ticket_type_id, ticketTypes]);
  const isTableBooking = Boolean(selectedTicketType?.is_table_package);
  const showGuestStep = !isTableBooking;
  const isFreeConcert = Boolean(event?.free_concert);
  const bypassTicketTypeStep =
    isFreeConcert ||
    (routeBookingDefaults.requestedBookingType === "table" && Boolean(selectedTicketType?.is_table_package));
  const guestStepNumber = bypassTicketTypeStep ? 2 : 3;
  const tableStepNumber = isTableBooking ? (bypassTicketTypeStep ? 2 : 3) : null;
  const confirmationStepNumber = isTableBooking ? tableStepNumber + 1 : guestStepNumber + 1;
  const accentColor = String(branding?.concert_reservation_button_color || branding?.primary_color || "#111827");
  const baseUnitPrice = Number(selectedTicketType?.price ?? event?.ticket_price ?? 0) || 0;
  const maxGuestsForTable = React.useMemo(() => {
    const byTable = (Array.isArray(tables) ? tables : []).reduce((max, table) => {
      const seats = Number(table?.seats || 0);
      return Number.isFinite(seats) && seats > 0 ? Math.max(max, seats) : max;
    }, 0);
    const packageLimit = Number(selectedTicketType?.available_count || 0);
    if (isTableBooking && packageLimit > 0 && byTable > 0) {
      return Math.min(byTable, packageLimit);
    }
    return byTable > 0 ? byTable : 20;
  }, [isTableBooking, selectedTicketType?.available_count, tables]);
  const guestCompositionFieldMode = normalizeGuestCompositionFieldMode(
    event?.guest_composition_field_mode,
    "hidden"
  );
  const guestCompositionRule = normalizeGuestCompositionRestrictionRule(
    event?.guest_composition_restriction_rule,
    "no_restriction"
  );
  const selectedTableNumber = Number(form.table_number || 0);
  const guestCompositionDisabledTables = Array.isArray(event?.guest_composition_disabled_tables)
    ? event.guest_composition_disabled_tables
    : [];
  const guestCompositionEnabled =
    isTableBooking &&
    Boolean(event?.guest_composition_enabled) &&
    !guestCompositionDisabledTables.includes(selectedTableNumber);
  const guestCompositionRequiresInput = guestCompositionRuleRequiresInput(guestCompositionRule);
  const guestCompositionEffectiveFieldMode = guestCompositionRequiresInput
    ? "required"
    : guestCompositionFieldMode;
  const guestCompositionVisible =
    guestCompositionEnabled && guestCompositionEffectiveFieldMode !== "hidden";
  const guestOptions = React.useMemo(
    () => buildGuestCountOptions(maxGuestsForTable, guestCompositionRule === "couple_only"),
    [guestCompositionRule, maxGuestsForTable]
  );
  const selectedGuests = Number(normalizeGuestCountSelection(form.guests_count, guestOptions) || 0);
  const menCount = parseGuestCompositionCount(form.male_guests_count);
  const womenCount = parseGuestCompositionCount(form.female_guests_count);
  const hasGuestCompositionInput =
    hasGuestCompositionValue(form.male_guests_count) ||
    hasGuestCompositionValue(form.female_guests_count);
  const guestCompositionMessage =
    guestCompositionVisible && guestCompositionRule !== "no_restriction"
      ? resolveGuestCompositionPolicyMessage(
          event?.guest_composition_validation_message,
          guestCompositionRule,
          t
        )
      : "";
  const guestCompositionError = getGuestCompositionValidationError({
    enabled: guestCompositionEnabled,
    fieldMode: guestCompositionEffectiveFieldMode,
    restrictionRule: guestCompositionRule,
    validationMessage: guestCompositionMessage,
    totalGuests: selectedGuests,
    menGuests: form.male_guests_count,
    womenGuests: form.female_guests_count,
    translate: t,
  });

  React.useEffect(() => {
    if (!guestCompositionVisible) {
      setForm((prev) =>
        !prev.male_guests_count && !prev.female_guests_count
          ? prev
          : { ...prev, male_guests_count: "", female_guests_count: "" }
      );
      return;
    }
    setForm((prev) => {
      const hasInput =
        hasGuestCompositionValue(prev.male_guests_count) ||
        hasGuestCompositionValue(prev.female_guests_count);
      if (guestCompositionEffectiveFieldMode === "optional" && !hasInput) {
        return prev;
      }
      const nextComposition = buildGuestComposition(
        prev.guests_count,
        prev.male_guests_count,
        prev.female_guests_count,
        { menKey: "male_guests_count", womenKey: "female_guests_count" }
      );
      if (
        prev.male_guests_count === nextComposition.male_guests_count &&
        prev.female_guests_count === nextComposition.female_guests_count
      ) {
        return prev;
      }
      return { ...prev, ...nextComposition };
    });
  }, [form.guests_count, guestCompositionEffectiveFieldMode, guestCompositionVisible]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPlan() {
      if (!identifier || !concertId || !isTableBooking) {
        setFloorPlan(null);
        setTableStates([]);
        return;
      }
      setFloorPlanLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedTicketType?.id) params.set("ticket_type_id", String(selectedTicketType.id));
        if (selectedTicketType?.area_name) params.set("area_name", String(selectedTicketType.area_name));
        if (selectedGuests > 0) params.set("guest_count", String(selectedGuests));
        if (hasGuestCompositionInput) {
          params.set("male_guests_count", String(menCount));
          params.set("female_guests_count", String(womenCount));
        }
        const response = await secureFetch(
          `/public/concerts/${encodeURIComponent(identifier)}/events/${encodeURIComponent(
            concertId
          )}/floor-plan?${params.toString()}`
        );
        if (cancelled) return;
        setFloorPlan(mergeFloorPlanVisualStyles(response?.layout || null, branding?.qr_floor_plan_layout));
        setTableStates(Array.isArray(response?.table_states) ? response.table_states : []);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load concert floor plan:", error);
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
    branding,
    concertId,
    hasGuestCompositionInput,
    identifier,
    isTableBooking,
    menCount,
    selectedGuests,
    selectedTicketType?.area_name,
    selectedTicketType?.id,
    womenCount,
  ]);

  React.useEffect(() => {
    if (!isTableBooking) {
      setForm((prev) => (prev.table_number ? { ...prev, table_number: "" } : prev));
      return;
    }
    const selectedNumber = Number(form.table_number || 0);
    if (!selectedNumber) return;
    const state = (Array.isArray(tableStates) ? tableStates : []).find(
      (item) => Number(item?.table_number) === selectedNumber
    );
    if (!state || String(state.status || "").toLowerCase() !== "available") {
      setForm((prev) => ({ ...prev, table_number: "" }));
    }
  }, [form.table_number, isTableBooking, tableStates]);

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

  const normalizedPhone = normalizeQrPhone(form.customer_phone);
  const phoneValid = QR_PHONE_REGEX.test(normalizedPhone);
  const emailValid =
    !String(form.customer_email || "").trim() ||
    EMAIL_REGEX.test(String(form.customer_email).trim().toLowerCase());
  const hasRegisteredProfile = Boolean(
    isLoggedIn && form.customer_name.trim() && phoneValid && emailValid
  );
  const quantity = isTableBooking ? selectedGuests : Math.max(1, Number(form.quantity) || 1);
  const availableTicketsRaw = Number(
    selectedTicketType?.available_count ?? event?.available_ticket_count ?? NaN
  );
  const availableTickets =
    Number.isFinite(availableTicketsRaw) && availableTicketsRaw >= 0 ? availableTicketsRaw : null;
  const total = baseUnitPrice * quantity;
  const hasConfirmedTable = !isTableBooking || Number(form.table_number || 0) > 0;
  const ticketQuantityMax =
    Number.isFinite(availableTickets) && availableTickets > 0
      ? Math.min(20, availableTickets)
      : 20;
  const selectedTicketQuantity = Math.max(1, Number(form.quantity) || 1);
  const formErrors = {
    name: form.customer_name.trim() ? "" : t("Please enter your name."),
    phone: phoneValid ? "" : t("Please enter a valid phone number."),
    email: emailValid ? "" : t("Please enter a valid email address."),
  };
  const canSubmit =
    form.customer_name.trim() &&
    phoneValid &&
    emailValid &&
    selectedTicketType &&
    quantity > 0 &&
    (!isTableBooking || Number(form.table_number || 0) > 0) &&
    (!isTableBooking || !guestCompositionError) &&
    (availableTickets == null || (availableTickets > 0 && quantity <= availableTickets)) &&
    !submitting;

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
      const totalGuests = parseGuestCompositionCount(prev.guests_count);
      if (totalGuests <= 0) return prev;
      const currentMen = parseGuestCompositionCount(prev.male_guests_count);
      const currentWomen = parseGuestCompositionCount(prev.female_guests_count);
      const nextValue = Math.min(
        totalGuests,
        Math.max(0, (field === "male_guests_count" ? currentMen : currentWomen) + delta)
      );
      const nextMen = field === "male_guests_count" ? nextValue : totalGuests - nextValue;
      const nextWomen = field === "female_guests_count" ? nextValue : totalGuests - nextValue;
      return {
        ...prev,
        male_guests_count: String(nextMen),
        female_guests_count: String(nextWomen),
      };
    });
  }, []);

  const setFieldRef = React.useCallback(
    (key) => (node) => {
      if (node) {
        fieldRefs.current[key] = node;
      }
    },
    []
  );

  const focusInvalidField = React.useCallback(
    (key) => {
      setInvalidField(key);
      const node = fieldRefs.current[key];
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof node.animate === "function") {
        node.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-8px)" },
            { transform: "translateX(8px)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 360, easing: "ease-in-out" }
        );
      }
    },
    []
  );

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit || !identifier || !concertId || !selectedTicketType) {
      const firstInvalidKey =
        formErrors.name
          ? "name"
          : formErrors.phone
            ? "phone"
            : formErrors.email
              ? "email"
              : !selectedTicketType
                ? "ticket_type"
                : isTableBooking && !Number(form.table_number || 0)
                  ? "table_number"
                  : guestCompositionError
                    ? "table_number"
                    : "";
      if (firstInvalidKey) focusInvalidField(firstInvalidKey);
      return;
    }

    setInvalidField("");
    setSubmitting(true);
    try {
      const response = await secureFetch(
        `/public/concerts/${encodeURIComponent(identifier)}/events/${encodeURIComponent(concertId)}/bookings`,
        {
          method: "POST",
          body: JSON.stringify({
            booking_type: isTableBooking ? "table" : "ticket",
            ticket_type_id: Number(selectedTicketType.id),
            requested_table_number: isTableBooking ? Number(form.table_number || 0) : null,
            quantity,
            guests_count: isTableBooking ? selectedGuests : null,
            male_guests_count:
              isTableBooking && guestCompositionVisible && hasGuestCompositionInput ? menCount : null,
            female_guests_count:
              isTableBooking && guestCompositionVisible && hasGuestCompositionInput ? womenCount : null,
            customer_name: form.customer_name.trim(),
            customer_phone: normalizedPhone,
            customer_email: String(form.customer_email || "").trim().toLowerCase() || null,
            customer_note: form.customer_note.trim(),
            bank_reference: form.bank_reference.trim(),
            area_name: selectedTicketType.area_name || null,
          }),
        }
      );

      const linkedOrderId = Number(
        response?.booking?.reservation_order_id ||
          response?.linked_order?.id ||
          response?.reservation?.id ||
          0
      );
      const paymentStatus = String(response?.booking?.payment_status || "pending_bank_transfer")
        .trim()
        .toLowerCase();

      if (isTableBooking) {
        const reservedTableNumber = Number(
          response?.booking?.reserved_table_number || form.table_number || 0
        );
        storage.setItem("qr_orderType", "table");
        storage.setItem("qr_table", String(reservedTableNumber));
        storage.setItem("qr_show_status", "1");
        storage.setItem("qr_force_status_until_closed", "1");
        if (linkedOrderId > 0) {
          storage.setItem("qr_active_order_id", String(linkedOrderId));
          storage.setItem(
            "qr_active_order",
            JSON.stringify({
              orderId: linkedOrderId,
              orderType: "table",
              table: reservedTableNumber,
            })
          );
        }
      } else {
        storage.setItem("qr_orderType", "takeaway");
        storage.removeItem("qr_table");
        storage.setItem("qr_show_status", "1");
        storage.removeItem("qr_force_status_until_closed");
        if (linkedOrderId > 0) {
          storage.setItem("qr_active_order_id", String(linkedOrderId));
          storage.setItem(
            "qr_active_order",
            JSON.stringify({
              orderId: linkedOrderId,
              orderType: "takeaway",
              table: null,
              paymentStatus,
            })
          );
        }
      }
      navigate(menuPath);
    } catch (error) {
      window.alert(error?.message || t("Failed to save booking"));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    concertId,
    form.bank_reference,
    form.customer_email,
    form.customer_name,
    form.customer_note,
    form.table_number,
    formErrors.email,
    formErrors.name,
    formErrors.phone,
    guestCompositionError,
    guestCompositionVisible,
    hasGuestCompositionInput,
    identifier,
    isTableBooking,
    menCount,
    menuPath,
    navigate,
    normalizedPhone,
    quantity,
    selectedGuests,
    selectedTicketType,
    storage,
    t,
    womenCount,
    focusInvalidField,
  ]);

  const summaryItems = [
    {
      label: t("Event"),
      value: event?.event_title || event?.artist_name || "",
    },
    {
      label: t("Package"),
      value: selectedTicketType?.name || "",
    },
    {
      label: isTableBooking ? t("Guests") : t("Quantity"),
      value: String(quantity || ""),
    },
    {
      label: t("Table"),
      value:
        isTableBooking && (selectedTableRecord || selectedTableState)
          ? formatTableLabel(selectedTableRecord || selectedTableState, t("Table"))
          : "",
    },
    {
      label: t("Total"),
      value: quantity > 0 ? formatCurrency(total) : "",
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
      isTableBooking &&
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
  }, [form.table_number, isTableBooking]);

  if (!hasRegisteredProfile) {
    return null;
  }

  const primaryActionLabel = isTableBooking && !hasConfirmedTable
    ? t("Choose Table")
    : submitting
      ? t("Saving...")
      : isTableBooking
        ? t("Reserve Now")
        : t("Buy Ticket");
  const primaryActionHelper = isTableBooking && !hasConfirmedTable
    ? t("Pick your table from the live floor plan.")
    : quantity > 0
      ? `${t("Total")}: ${formatCurrency(total)}`
      : "";
  const primaryActionHandler = isTableBooking && !hasConfirmedTable
    ? () => setPickerOpen(true)
    : handleSubmit;
  const primaryActionDisabled = isTableBooking && !hasConfirmedTable
    ? !selectedTicketType || pickerOpen
    : !canSubmit;

  return (
    <BookingPageLayout
      title={t("Concert Booking")}
      subtitle={loading ? t("Loading event") : t("Premium event checkout flow")}
      onBack={handleBack}
      accentColor={accentColor}
      showHeaderIndicator={false}
      actionLabel={primaryActionLabel}
      actionHelper={primaryActionHelper}
      onAction={primaryActionHandler}
      actionDisabled={primaryActionDisabled}
    >
      <BookingSection
        step={1}
        title={t("Event Info")}
        description={t("Review the event details before choosing a package.")}
      >
        <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {event?.event_image ? (
            <img
              src={String(event.event_image).startsWith("http") ? event.event_image : `/uploads/${String(event.event_image).replace(/^\/?uploads\//, "")}`}
              alt={event?.event_title || event?.artist_name || t("Concert")}
              className="h-48 w-full object-cover"
            />
          ) : null}
          <div className="space-y-2 p-4">
            <div className="text-lg font-semibold text-neutral-950 dark:text-white">
              {event?.event_title || event?.artist_name || t("Concert")}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              {[event?.artist_name, event?.event_date, event?.event_time].filter(Boolean).join(" • ")}
            </div>
            {event?.description ? (
              <div className="text-sm text-neutral-700 dark:text-neutral-300">{event.description}</div>
            ) : null}
          </div>
        </div>
      </BookingSection>

      {bypassTicketTypeStep ? null : (
        <BookingSection
          step={2}
          title={t("Ticket Type")}
          description={t("Choose the package or ticket you want to book.")}
        >
          <div
            ref={setFieldRef("ticket_type")}
            className={[
              "space-y-2 rounded-[24px] transition",
              invalidField === "ticket_type" ? "border border-rose-300 bg-rose-50/70 p-2 dark:border-rose-900/40 dark:bg-rose-950/20" : "",
            ].join(" ")}
          >
            {ticketTypes.map((ticketType) => {
              const selected = Number(form.ticket_type_id || 0) === Number(ticketType.id);
              const soldOut = Number(ticketType.available_count || 0) <= 0;
              return (
                <button
                  key={ticketType.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      ticket_type_id: String(ticketType.id),
                      table_number: "",
                    }))
                  }
                  className={[
                    "w-full rounded-[24px] border px-4 py-4 text-left transition",
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50",
                    soldOut ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{ticketType.name}</div>
                      <div className="mt-1 text-xs opacity-80">
                        {[ticketType.area_name, ticketType.is_table_package ? t("Table package") : t("Ticket")]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{formatCurrency(ticketType.price || 0)}</div>
                      <div className="mt-1 text-xs opacity-80">
                        {soldOut
                          ? t("Sold out")
                          : t("{{count}} left", { count: Number(ticketType.available_count || 0) })}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </BookingSection>
      )}

      {showGuestStep ? (
        <BookingSection
          step={guestStepNumber}
          title={t("Quantity")}
          description={t("Choose how many tickets you want to buy.")}
        >
          <QuantityStepperCard
            label={t("Quantity")}
            value={selectedTicketQuantity}
            onDecrease={() =>
              setForm((prev) => ({
                ...prev,
                quantity: String(Math.max(1, (Number(prev.quantity) || 1) - 1)),
              }))
            }
            onIncrease={() =>
              setForm((prev) => ({
                ...prev,
                quantity: String(Math.min(ticketQuantityMax, Math.max(1, Number(prev.quantity) || 1) + 1)),
              }))
            }
            decreaseDisabled={selectedTicketQuantity <= 1}
            increaseDisabled={selectedTicketQuantity >= ticketQuantityMax}
            helperText={t("Up to {{count}} tickets", { count: ticketQuantityMax })}
          />
        </BookingSection>
      ) : null}

      {isTableBooking ? (
        <BookingSection
          step={tableStepNumber}
          title=""
          description=""
          rightSlot={
            floorPlanLoading ? (
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("Syncing")}
              </span>
            ) : null
          }
        >
          <div
            ref={setFieldRef("table_number")}
            className={invalidField === "table_number" ? "rounded-[28px] border border-rose-400 bg-rose-50/70 p-2 ring-4 ring-rose-100 dark:border-rose-500 dark:bg-rose-950/20 dark:ring-rose-950/40" : ""}
          >
            <div className="rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="font-semibold text-neutral-950 dark:text-white">
                {selectedTableRecord || selectedTableState
                  ? formatTableLabel(selectedTableRecord || selectedTableState, t("Table"))
                  : t("No table selected yet")}
              </div>
              <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                {selectedTableState?.reason
                  ? selectedTableState.reason
                  : selectedTableState?.capacity
                    ? t("Capacity {{count}} guests", { count: selectedTableState.capacity })
                    : t("Use the footer button to open the floor plan.")}
              </div>
            </div>
          </div>
        </BookingSection>
      ) : null}

      {hasConfirmedTable ? (
        <div ref={confirmationSectionRef}>
          <BookingSection
            step={confirmationStepNumber}
            title={t("Confirmation")}
            description={t("Review the final summary before placing the booking.")}
          >
            <RegisteredCustomerBadge
              customer={{
                username: customer?.username || form.customer_name,
                phone: customer?.phone || normalizedPhone,
                email: customer?.email || form.customer_email,
              }}
              accentColor={accentColor}
              onEdit={handleEditCustomer}
            />
            <label className="block">
              <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {t("Booking Note")}
              </div>
              <textarea
                rows={4}
                value={form.customer_note}
                onChange={(event) => setForm((prev) => ({ ...prev, customer_note: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <BookingSummaryCard items={summaryItems} accentColor={accentColor} />
            {event?.bank_transfer_instructions ? (
              <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-100">
                <div className="font-semibold">{t("Payment Instructions")}</div>
                <div className="mt-1 whitespace-pre-wrap">{event.bank_transfer_instructions}</div>
              </div>
            ) : null}
          </BookingSection>
        </div>
      ) : null}

      <FloorPlanPickerModal
        open={pickerOpen}
        title={t("Choose concert table")}
        subtitle={selectedTicketType?.name || t("Table package")}
        layout={floorPlan}
        tables={tables}
        tableStates={tableStates}
        selectedTableNumber={form.table_number}
        accentColor={accentColor}
        guestCompositionProps={{
          title: t("Guest Split"),
          description: t("Match the package to the group arriving at the venue."),
          guestOptions,
          selectedGuests,
          onGuestCountChange: (option) =>
            setForm((prev) => ({
              ...prev,
              guests_count: String(option),
              table_number: "",
            })),
          guestsLabel: t("Guests"),
          menLabel: t("Men"),
          womenLabel: t("Women"),
          menCount: guestCompositionVisible ? menCount : undefined,
          womenCount: guestCompositionVisible ? womenCount : undefined,
          onMenChange: guestCompositionVisible
            ? (delta) => handleGuestCompositionDelta("male_guests_count", delta)
            : undefined,
          onWomenChange: guestCompositionVisible
            ? (delta) => handleGuestCompositionDelta("female_guests_count", delta)
            : undefined,
          locked: guestCompositionRule === "couple_only",
          error: guestCompositionError,
          policyMessage: guestCompositionMessage,
        }}
        onClose={() => setPickerOpen(false)}
        onConfirm={(node) => {
          setForm((prev) => ({ ...prev, table_number: String(node.table_number || "") }));
          setInvalidField("");
          setPickerOpen(false);
        }}
      />
    </BookingPageLayout>
  );
}
