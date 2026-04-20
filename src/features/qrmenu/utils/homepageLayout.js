export const QR_MENU_HOMEPAGE_SECTIONS = [
  {
    id: "products_search_categories",
    label: "Product Images, Search & Categories",
  },
  {
    id: "concert_tickets_events",
    label: "Concert Tickets Events",
  },
  {
    id: "popular_this_week",
    label: "Popular This Week",
  },
  {
    id: "hero_slider",
    label: "Hero Slider",
  },
  {
    id: "loyalty_program",
    label: "Loyalty Program",
  },
  {
    id: "our_story_section",
    label: "Our Story Section",
  },
  {
    id: "story_images",
    label: "Story Images",
  },
  {
    id: "customer_reviews",
    label: "Customer Reviews",
  },
];

export const QR_MENU_DEFAULT_HOMEPAGE_SECTION_ORDER = QR_MENU_HOMEPAGE_SECTIONS.map(
  (section) => section.id
);

export function normalizeQrMenuHomepageSectionOrder(value) {
  const nextOrder = [];
  const seen = new Set();

  (Array.isArray(value) ? value : []).forEach((entry) => {
    const normalizedId = String(entry || "").trim();
    if (!normalizedId) return;
    if (!QR_MENU_DEFAULT_HOMEPAGE_SECTION_ORDER.includes(normalizedId)) return;
    if (seen.has(normalizedId)) return;
    seen.add(normalizedId);
    nextOrder.push(normalizedId);
  });

  QR_MENU_DEFAULT_HOMEPAGE_SECTION_ORDER.forEach((sectionId) => {
    if (seen.has(sectionId)) return;
    nextOrder.push(sectionId);
  });

  return nextOrder;
}
