export const QR_BOOKING_DEFAULTS = Object.freeze({
  reservation_default_duration_minutes: 120,
  reservation_buffer_minutes: 0,
  reservation_max_per_table_per_day: "",
  reservation_allow_while_occupied_now: false,
  reservation_early_checkin_window_minutes: 15,
  reservation_late_arrival_grace_minutes: 15,
  reservation_auto_cancel_no_show_after_minutes: 0,
  concert_event_duration_minutes: 150,
  concert_event_end_time: "",
  concert_early_entry_window_minutes: 30,
  concert_late_entry_cutoff_minutes: 30,
  concert_allow_reentry: false,
  booking_time_interval_minutes: 30,
  booking_max_days_in_advance: 30,
});

function asPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function normalizeQrBookingSettings(raw = {}) {
  return {
    ...QR_BOOKING_DEFAULTS,
    reservation_default_duration_minutes: Math.max(
      15,
      asPositiveInt(
        raw.reservation_default_duration_minutes,
        QR_BOOKING_DEFAULTS.reservation_default_duration_minutes
      )
    ),
    reservation_buffer_minutes: Math.max(
      0,
      asPositiveInt(raw.reservation_buffer_minutes, QR_BOOKING_DEFAULTS.reservation_buffer_minutes) ||
        0
    ),
    reservation_max_per_table_per_day:
      raw.reservation_max_per_table_per_day === null ||
      raw.reservation_max_per_table_per_day === undefined ||
      raw.reservation_max_per_table_per_day === ""
        ? ""
        : Math.max(1, asPositiveInt(raw.reservation_max_per_table_per_day, 1)),
    reservation_allow_while_occupied_now:
      raw.reservation_allow_while_occupied_now === true ||
      String(raw.reservation_allow_while_occupied_now || "").toLowerCase() === "true",
    reservation_early_checkin_window_minutes: Math.max(
      0,
      asPositiveInt(
        raw.reservation_early_checkin_window_minutes,
        QR_BOOKING_DEFAULTS.reservation_early_checkin_window_minutes
      ) || 0
    ),
    reservation_late_arrival_grace_minutes: Math.max(
      0,
      asPositiveInt(
        raw.reservation_late_arrival_grace_minutes,
        QR_BOOKING_DEFAULTS.reservation_late_arrival_grace_minutes
      ) || 0
    ),
    reservation_auto_cancel_no_show_after_minutes: Math.max(
      0,
      asPositiveInt(
        raw.reservation_auto_cancel_no_show_after_minutes,
        QR_BOOKING_DEFAULTS.reservation_auto_cancel_no_show_after_minutes
      ) || 0
    ),
    concert_event_duration_minutes: Math.max(
      15,
      asPositiveInt(
        raw.concert_event_duration_minutes,
        QR_BOOKING_DEFAULTS.concert_event_duration_minutes
      )
    ),
    concert_event_end_time: String(raw.concert_event_end_time || "").trim(),
    concert_early_entry_window_minutes: Math.max(
      0,
      asPositiveInt(
        raw.concert_early_entry_window_minutes,
        QR_BOOKING_DEFAULTS.concert_early_entry_window_minutes
      ) || 0
    ),
    concert_late_entry_cutoff_minutes: Math.max(
      0,
      asPositiveInt(
        raw.concert_late_entry_cutoff_minutes,
        QR_BOOKING_DEFAULTS.concert_late_entry_cutoff_minutes
      ) || 0
    ),
    concert_allow_reentry:
      raw.concert_allow_reentry === true ||
      String(raw.concert_allow_reentry || "").toLowerCase() === "true",
    booking_time_interval_minutes: Math.max(
      5,
      Math.min(
        180,
        asPositiveInt(
          raw.booking_time_interval_minutes,
          QR_BOOKING_DEFAULTS.booking_time_interval_minutes
        )
      )
    ),
    booking_max_days_in_advance: Math.max(
      1,
      Math.min(
        365,
        asPositiveInt(raw.booking_max_days_in_advance, QR_BOOKING_DEFAULTS.booking_max_days_in_advance)
      )
    ),
  };
}

export function normalizeYmd(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

export function normalizeTimeInput(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return "";
  return raw.length === 5 ? `${raw}:00` : raw;
}

export function parseLocalDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const candidate = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

export function formatLocalDateTime(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function addMinutesToDateTime(value, minutes) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return "";
  parsed.setMinutes(parsed.getMinutes() + (Number(minutes) || 0));
  return formatLocalDateTime(parsed);
}

export function computeReservationSlot({ reservationDate, reservationTime, settings }) {
  const normalizedSettings = normalizeQrBookingSettings(settings);
  const ymd = normalizeYmd(reservationDate);
  const time = normalizeTimeInput(reservationTime);
  if (!ymd || !time) return null;
  const slotStart = `${ymd} ${time}`;
  const slotEnd = addMinutesToDateTime(
    slotStart,
    normalizedSettings.reservation_default_duration_minutes
  );
  return {
    slot_start_datetime: slotStart,
    slot_end_datetime: slotEnd,
    reservation_duration_minutes: normalizedSettings.reservation_default_duration_minutes,
    reservation_buffer_minutes: normalizedSettings.reservation_buffer_minutes,
  };
}

export function computeConcertSlot({ eventDate, eventTime, settings }) {
  const normalizedSettings = normalizeQrBookingSettings(settings);
  const ymd = normalizeYmd(eventDate);
  const time = normalizeTimeInput(eventTime);
  if (!ymd || !time) return null;
  const slotStart = `${ymd} ${time}`;
  let slotEnd = "";
  if (normalizedSettings.concert_event_end_time) {
    const endDateTime = `${ymd} ${normalizeTimeInput(normalizedSettings.concert_event_end_time)}`;
    const startDate = parseLocalDateTime(slotStart);
    const endDate = parseLocalDateTime(endDateTime);
    if (startDate && endDate && endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
      slotEnd = formatLocalDateTime(endDate);
    } else {
      slotEnd = endDateTime;
    }
  }
  if (!slotEnd) {
    slotEnd = addMinutesToDateTime(slotStart, normalizedSettings.concert_event_duration_minutes);
  }
  return {
    slot_start_datetime: slotStart,
    slot_end_datetime: slotEnd,
    entry_open_datetime: addMinutesToDateTime(
      slotStart,
      normalizedSettings.concert_early_entry_window_minutes * -1
    ),
    entry_close_datetime: addMinutesToDateTime(
      slotStart,
      normalizedSettings.concert_late_entry_cutoff_minutes
    ),
  };
}

export function buildTimeSlotsForDay({
  dateValue,
  openTime,
  closeTime,
  stepMinutes,
  minDateTime = "",
}) {
  const ymd = normalizeYmd(dateValue);
  const open = normalizeTimeInput(openTime);
  const close = normalizeTimeInput(closeTime);
  if (!ymd || !open || !close) return [];

  const safeStep = Math.max(5, asPositiveInt(stepMinutes, 30));
  const start = parseLocalDateTime(`${ymd} ${open}`);
  const end = parseLocalDateTime(`${ymd} ${close}`);
  if (!start || !end) return [];
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  const minDate = parseLocalDateTime(minDateTime);
  const slots = [];
  const cursor = new Date(start.getTime());
  while (cursor < end) {
    if (!minDate || cursor >= minDate) {
      slots.push(formatLocalDateTime(cursor).slice(11, 16));
    }
    cursor.setMinutes(cursor.getMinutes() + safeStep);
  }
  return slots;
}

export function getReservationSlotAvailabilityLabel(status, translate = (value) => value) {
  const t = typeof translate === "function" ? translate : (value) => value;
  switch (String(status || "").trim().toLowerCase()) {
    case "limited":
      return t("Limited Availability");
    case "fully_booked":
      return t("Fully Booked");
    case "available":
    default:
      return t("Available");
  }
}

export function normalizeReservationTimeSlotOptions(rawSlots = [], translate = (value) => value) {
  return (Array.isArray(rawSlots) ? rawSlots : [])
    .map((row) => {
      const time = String(row?.time || "").slice(0, 5);
      if (!time) return null;
      const availabilityStatus = String(row?.availability_status || "available")
        .trim()
        .toLowerCase();
      const isAvailable = row?.is_available !== false && availabilityStatus !== "fully_booked";
      const availabilityLabel = getReservationSlotAvailabilityLabel(availabilityStatus, translate);
      return {
        ...row,
        time,
        isAvailable,
        availabilityStatus,
        availabilityLabel,
        label: `${time} (${availabilityLabel})`,
      };
    })
    .filter(Boolean);
}
