export function resolvePublicBookingIdentifier({ slug = "", id = "", search = "" } = {}) {
  const params = new URLSearchParams(String(search || ""));
  return String(
    params.get("identifier") ||
      params.get("tenant_id") ||
      params.get("tenant") ||
      params.get("restaurant_id") ||
      params.get("restaurant") ||
      slug ||
      id ||
      ""
  ).trim();
}

function appendIdentifierQuery(path, identifier = "") {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}identifier=${encodeURIComponent(normalizedIdentifier)}`;
}

export function buildPublicMenuPath({
  pathname = "",
  slug = "",
  id = "",
  search = "",
} = {}) {
  const normalizedPath = String(pathname || "").trim();
  const normalizedSlug = String(slug || "").trim();
  const normalizedId = String(id || "").trim();
  const identifier = resolvePublicBookingIdentifier({ slug, id, search });

  if (/^\/qr-menu\/[^/]+\/[^/]+/i.test(normalizedPath) && normalizedSlug && normalizedId) {
    return `/qr-menu/${encodeURIComponent(normalizedSlug)}/${encodeURIComponent(normalizedId)}`;
  }
  if (/^\/menu(?:\/|$)/i.test(normalizedPath)) {
    return appendIdentifierQuery("/menu", identifier);
  }
  if (/^\/qr(?:\/|$)/i.test(normalizedPath)) {
    return appendIdentifierQuery("/qr", identifier);
  }
  if (normalizedSlug) {
    return `/${encodeURIComponent(normalizedSlug)}`;
  }
  return appendIdentifierQuery("/qr", identifier);
}

export function buildReservationBookingPath(args = {}) {
  return `${buildPublicMenuPath(args).replace(/\/+$/, "")}/reserve`;
}

export function buildConcertBookingPath({ concertId, ...rest } = {}) {
  const normalizedConcertId = String(concertId || "").trim();
  if (!normalizedConcertId) {
    return buildReservationBookingPath(rest);
  }
  return `${buildPublicMenuPath(rest).replace(/\/+$/, "")}/concerts/${encodeURIComponent(
    normalizedConcertId
  )}/booking`;
}

export function appendPublicBookingSubPath(path, subPath = "") {
  const [pathname, rawSearch = ""] = String(path || "").split("?");
  const normalizedPath = String(pathname || "").replace(/\/+$/, "");
  const normalizedSubPath = String(subPath || "").replace(/^\/+|\/+$/g, "");
  const nextPath = normalizedSubPath ? `${normalizedPath}/${normalizedSubPath}` : normalizedPath;
  return rawSearch ? `${nextPath}?${rawSearch}` : nextPath;
}

export function buildReservationContactPath(args = {}) {
  return appendPublicBookingSubPath(buildReservationBookingPath(args), "contact");
}

export function buildConcertContactPath({ concertId, ...rest } = {}) {
  return appendPublicBookingSubPath(buildConcertBookingPath({ concertId, ...rest }), "contact");
}
