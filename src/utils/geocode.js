import secureFetch from "./secureFetch";

export async function geocodeAddress(address) {
  if (!address) return null;
  if (!window.geocodeCache) window.geocodeCache = {};
  if (window.geocodeCache[address]) return window.geocodeCache[address];

  const cleaned = cleanAddress(address);
  const cleanedNoNumber = stripHouseNumber(cleaned);
  const normalized = normalizeRegion(cleaned);
  const normalizedNoNumber = normalizeRegion(cleanedNoNumber);

  // Try multiple variants in order of specificity
  const variants = [
    normalizeRegion(address) + ", Turkey",     // Full address with house number
    normalized + ", Turkey",                   // Cleaned address with normalized region
    normalizedNoNumber + ", Turkey",           // Without house number
  ].filter(Boolean);

  for (const addr of variants) {
    console.log("[Geocode] Trying address:", addr);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(addr)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        const coords = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        window.geocodeCache[address] = coords;
        console.log("[Geocode] ✅ Found:", coords);
        return coords;
      }
    } catch (e) {
      console.warn("[Geocode] Fetch error for variant:", addr, e);
    }
  }

  // Fallback to backend geocoding (Google) if available
  try {
    const data = await secureFetch(`drivers/geocode?q=${encodeURIComponent(address)}`);
    if (data && typeof data.lat === "number" && typeof data.lng === "number") {
      const coords = { lat: data.lat, lng: data.lng };
      window.geocodeCache[address] = coords;
      console.log("[Geocode] ✅ Backend fallback:", coords);
      return coords;
    }
  } catch (e) {
    console.warn("[Geocode] Backend fallback failed:", e);
  }

  console.warn("Geocode completely failed for:", address);
  return null;
}


function cleanAddress(address) {
  if (!address) return "";
  return address
    .replace(/\//g, ", ")                   // Normalize region separator
    .replace(/\bCd\.?\b/gi, "Caddesi")      // Expand Cd. to Caddesi
    .replace(/\bCad\.?\b/gi, "Caddesi")     // Expand Cad. to Caddesi
    .replace(/\bBlv\.?\b/gi, "Bulvari")     // Expand Blv. to Bulvari
    .replace(/\bBulv\.?\b/gi, "Bulvari")    // Expand Bulv. to Bulvari
    .replace(/\bSk\.?\b/gi, "Sokak")        // Expand Sk. to Sokak
    .replace(/\bMah\.?\b/gi, "")            // Remove Mah. or Mah
    .replace(/Daire\s*\d+/gi, "")           // Remove Daire and number
    .replace(/\bNo:\s*/gi, "No ")           // Normalize house number prefix
    // Keep No and building number for distinction!
    .replace(/\b\d+\.?\s*sokak/gi, "")      // Remove numbered sokak
    .replace(/,+/g, ",")                    // Replace multiple commas with single
    .replace(/\s{2,}/g, " ")                // Remove double spaces
    .replace(/^\s*,|,\s*$/g, "")            // Trim commas at start/end
    .trim();
}

function stripHouseNumber(address) {
  if (!address) return "";
  return address
    .replace(/\bNo\b\s*\d+\b/gi, "")
    .replace(/\bNo:\s*\d+\b/gi, "")
    .replace(/\b\d{5}\b/gi, "")            // Remove postal code only
    .replace(/,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*,|,\s*$/g, "")
    .trim();
}

function normalizeRegion(address) {
  if (!address) return "";
  return address
    .replace(/\bTire\/?Izmir\b/gi, "Tire, Izmir")
    .replace(/\bIzmir\/?Tire\b/gi, "Tire, Izmir")
    .replace(/\bTire\s*\/\s*/gi, "Tire, ")
    .replace(/\bIzmir\b/gi, "Izmir");
}
