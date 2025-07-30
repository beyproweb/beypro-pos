export async function geocodeAddress(address) {
  if (!address) return null;
  if (!window.geocodeCache) window.geocodeCache = {};
  if (window.geocodeCache[address]) return window.geocodeCache[address];

  const cleaned = cleanAddress(address);
  const variants = [
    cleaned + ", Turkey",
    cleaned.replace(/\d+.*$/, "") + ", Turkey", // Remove house number and after
    "Tire, Izmir, Turkey"
  ];

  for (let addr of variants) {
    console.log("[Geocode] Trying address:", addr);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data.length) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      window.geocodeCache[address] = coords;
      return coords;
    }
  }
  console.warn("Geocode completely failed for:", address);
  return null;
}


function cleanAddress(address) {
  if (!address) return "";
  return address
    .replace(/Cad\./gi, "Caddesi")          // Expand Cad. to Caddesi
    .replace(/Mah\.?/gi, "")                // Remove Mah. or Mah
    .replace(/Daire\s*[\d]+/gi, "")         // Remove Daire and number
    .replace(/No:\s*\d+/gi, "")             // Remove No: and number
    .replace(/[\d]+\.? sokak/gi, "")        // Remove numbered sokak
    .replace(/,+/g, ",")                    // Replace multiple commas with single
    .replace(/\s{2,}/g, " ")                // Remove double spaces
    .replace(/^\s*,|,\s*$/g, "")            // Trim commas at start/end
    .trim();
}
