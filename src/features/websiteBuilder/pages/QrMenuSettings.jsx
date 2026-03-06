import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import secureFetch from "../../../utils/secureFetch";
import { Eye, EyeOff, Search, Copy, Download, Printer, QrCode, Trash2, ChevronDown } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useTranslation } from "react-i18next";

const extractIdentifierFromQrUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = (url.pathname || "").split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const clean = raw.replace(/\/+$/, "");
    const parts = clean.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
};

const makeEmptyConcertAreaAllocation = () => ({
  area_name: "",
  allocation_type: "ticket",
  price: "",
  quantity_total: "",
});

const makeEmptyConcertTicketType = () => ({
  name: "",
  area_name: "",
  price: "",
  quantity_total: "",
  description: "",
  is_table_package: false,
});

const makeEmptyConcertForm = () => ({
  artist_name: "",
  event_title: "",
  event_date: "",
  event_time: "",
  description: "",
  event_image: "",
  ticket_price: "",
  total_ticket_quantity: "",
  total_table_quantity: "",
  reservation_payment_method: "bank_transfer",
  bank_transfer_instructions: "",
  status: "active",
  area_allocations: [makeEmptyConcertAreaAllocation()],
  ticket_types: [makeEmptyConcertTicketType()],
});

export default function QrMenuSettings() {
  const { t } = useTranslation();
  const [qrUrl, setQrUrl] = useState("");
  const [products, setProducts] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingLink, setLoadingLink] = useState(false);
  const qrRef = useRef();
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savingReservationTab, setSavingReservationTab] = useState(false);
  const [tables, setTables] = useState([]);
  const [tableQr, setTableQr] = useState({}); // { [tableNumber]: { url, loading } }
  const [tableCount, setTableCount] = useState("");
  const [savingTableCount, setSavingTableCount] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
  });
  const productImageInputRef = useRef(null);
  const [newProductImageFile, setNewProductImageFile] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState("");
  const [uploadingNewProductImage, setUploadingNewProductImage] = useState(false);

  const categoryImageInputRef = useRef(null);
  const [categoryImageFileName, setCategoryImageFileName] = useState("");
  const [categoryImagePreview, setCategoryImagePreview] = useState("");
  const [uploadingCategoryImage, setUploadingCategoryImage] = useState(false);

  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [shopHours, setShopHours] = useState({});
  const [loadingShopHours, setLoadingShopHours] = useState(true);
  const [savingShopHours, setSavingShopHours] = useState(false);
  const [shopHoursDirty, setShopHoursDirty] = useState(false);
  const [shopHoursSaveStatus, setShopHoursSaveStatus] = useState("idle");
  const [showShopHoursDropdown, setShowShopHoursDropdown] = useState(false);
  const shopHoursDropdownRef = useRef(null);
  const [uploadingStoryImages, setUploadingStoryImages] = useState(false);
  const [draggedStoryImageIndex, setDraggedStoryImageIndex] = useState(null);
  const [settings, setSettings] = useState({
  main_title: "",
  subtitle: "",
  tagline: "",
  phone: "",
  primary_color: "#4F46E5",
  // New customization defaults
  enable_popular: true,
  qr_theme: "auto", // auto | light | dark
  loyalty_enabled: false,
  loyalty_goal: 10,
  loyalty_reward_text: "Free Menu Item",
  loyalty_color: "#F59E0B",
  hero_slides: [],
  story_enabled: true,
  story_title: "",
  story_text: "",
  story_images: [],
  story_image: "",
  reviews: [],
  social_instagram: "",
  social_tiktok: "",
  social_website: "",
  delivery_enabled: true,
  reservation_tab_enabled: true,
  table_geo_enabled: false,
  table_geo_radius_meters: 150,
});
  const [concertEvents, setConcertEvents] = useState([]);
  const [concertAreas, setConcertAreas] = useState([]);
  const [loadingConcerts, setLoadingConcerts] = useState(false);
  const [savingConcert, setSavingConcert] = useState(false);
  const [deletingConcertId, setDeletingConcertId] = useState(null);
  const [editingConcertId, setEditingConcertId] = useState(null);
  const concertImageInputRef = useRef(null);
  const [uploadingConcertImage, setUploadingConcertImage] = useState(false);
  const [concertForm, setConcertForm] = useState(makeEmptyConcertForm());
  const [concertBookingsByEvent, setConcertBookingsByEvent] = useState({});
  const [loadingConcertBookingsEventId, setLoadingConcertBookingsEventId] = useState(null);
  const [updatingConcertBookingId, setUpdatingConcertBookingId] = useState(null);

  const uploadsBaseUrl =
    import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:5000";

  const resolveUploadSrc = (raw) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (value.startsWith("http")) return value;
    return `${uploadsBaseUrl}/uploads/${value.replace(/^\/?uploads\//, "")}`;
  };

  const normalizeStoryImages = (source) => {
    const ordered = Array.isArray(source?.story_images) ? source.story_images : [];
    const next = ordered
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    if (next.length > 0) return next;

    const legacy = String(source?.story_image || "").trim();
    return legacy ? [legacy] : [];
  };

  const updateStoryImages = (nextImages) => {
    const normalized = nextImages
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    setSettings((prev) => ({
      ...prev,
      story_images: normalized,
      story_image: normalized[0] || "",
    }));
  };

function updateField(key, value) {
  setSettings((prev) => ({ ...prev, [key]: value }));
}

function addHeroSlide() {
  setSettings((prev) => ({
    ...prev,
    hero_slides: [...prev.hero_slides, { title: "", subtitle: "", image: "" }],
  }));
}

function updateHeroSlide(index, key, value) {
  const updated = [...settings.hero_slides];
  updated[index][key] = value;
  setSettings((p) => ({ ...p, hero_slides: updated }));
}

async function uploadHeroImage(e, index) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const res = await secureFetch("/upload", {
    method: "POST",
    body: formData,
  });

  if (res.url) {
    updateHeroSlide(index, "image", res.url);
  }
}



async function uploadStoryImages(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  setUploadingStoryImages(true);

  try {
    const uploads = await Promise.allSettled(
      files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await secureFetch("/upload", {
          method: "POST",
          body: formData,
        });
        return res?.url || "";
      })
    );

    const uploadedImages = uploads
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter(Boolean);
    if (uploadedImages.length === 0) {
      toast.error(t("Upload failed"));
      return;
    }

    setSettings((prev) => {
      const nextImages = [
        ...normalizeStoryImages(prev),
        ...uploadedImages,
      ];
      return {
        ...prev,
        story_images: nextImages,
        story_image: nextImages[0] || "",
      };
    });
  } catch (err) {
    console.error("❌ Failed to upload story images:", err);
    toast.error(t("Upload failed"));
  } finally {
    setUploadingStoryImages(false);
    e.target.value = "";
  }
}

function removeStoryImage(index) {
  updateStoryImages(settings.story_images.filter((_, i) => i !== index));
}

function moveStoryImage(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= settings.story_images.length) return;

  const nextImages = [...settings.story_images];
  const [moved] = nextImages.splice(index, 1);
  nextImages.splice(targetIndex, 0, moved);
  updateStoryImages(nextImages);
}

function handleStoryImageDrop(dropIndex) {
  if (draggedStoryImageIndex == null || draggedStoryImageIndex === dropIndex) {
    setDraggedStoryImageIndex(null);
    return;
  }

  const nextImages = [...settings.story_images];
  const [moved] = nextImages.splice(draggedStoryImageIndex, 1);
  nextImages.splice(dropIndex, 0, moved);
  updateStoryImages(nextImages);
  setDraggedStoryImageIndex(null);
}

function updateReview(i, key, value) {
  const updated = [...settings.reviews];
  updated[i][key] = value;
  setSettings((p) => ({ ...p, reviews: updated }));
}

function addReview() {
  setSettings((prev) => ({
    ...prev,
    reviews: [...prev.reviews, { name: "", rating: 5, text: "" }],
  }));
}



async function saveAllCustomization() {
  try {
    const storyImages = normalizeStoryImages(settings);
    await secureFetch("/settings/qr-menu-customization", {
      method: "POST",
      body: JSON.stringify({
        ...settings,
        story_enabled: settings.story_enabled !== false,
        story_images: storyImages,
        story_image: storyImages[0] || "",
      }),
    });
    toast.success(t("Saved!"));
  } catch {
    toast.error(t("Save failed"));
  }
}

  // ✅ Load products and short QR link
  useEffect(() => {
  const loadData = async () => {
    try {
      // 1) Load products
      const prodData = await secureFetch("/products");
      setProducts(Array.isArray(prodData) ? prodData : prodData?.data || []);

      // 2) Load disabled products
      const disData = await secureFetch("/settings/qr-menu-disabled");
      if (Array.isArray(disData)) setDisabledIds(disData);
      else if (typeof disData === "object" && disData?.disabled)
        setDisabledIds(disData.disabled);

      // ✅ 3) LOAD QR MENU CUSTOMIZATION (THE FIX)
      const customRes = await secureFetch("/settings/qr-menu-customization");
      if (customRes?.success && customRes.customization) {
        const storyImages = normalizeStoryImages(customRes.customization);
        setSettings((prev) => ({
          ...prev,
          ...customRes.customization,
          story_enabled: customRes.customization.story_enabled !== false,
          story_images: storyImages,
          story_image: storyImages[0] || "",
        }));
      }

      // 4) Load short QR link
      setLoadingLink(true);
      const linkRes = await secureFetch("/settings/qr-link");
      if (linkRes?.success && linkRes.link) setQrUrl(linkRes.link);

      // 5) Load concert/event builder data
      await loadConcerts();

    } catch (err) {
      console.error("❌ Failed to load QR settings:", err);
      toast.error(t("Failed to load QR menu data"));
    } finally {
      setLoadingLink(false);
    }
  };

  loadData();
}, [t]);

  // Load tables for per-table QR codes
  useEffect(() => {
    const loadTables = async () => {
      try {
        const data = await secureFetch("/tables?active=true");
        const arr = Array.isArray(data) ? data : data?.data || [];
        setTables(arr);
        const activeTables = arr.filter((t) => t.active !== false);
        setTableCount(String(activeTables.length || 0));
      } catch (err) {
        console.error("❌ Failed to load tables for QR:", err);
      }
    };
    loadTables();
  }, []);

  const saveTableCount = async () => {
    const total = Number(tableCount);
    if (!Number.isFinite(total) || total < 0) {
      toast.error(t("Invalid table count"));
      return;
    }
    setSavingTableCount(true);
    try {
      await secureFetch("/tables/count", {
        method: "PUT",
        body: JSON.stringify({ total }),
      });
      toast.success(t("Saved successfully!"));
      const data = await secureFetch("/tables?active=true");
      const arr = Array.isArray(data) ? data : data?.data || [];
      setTables(arr);
      const activeTables = arr.filter((t) => t.active !== false);
      setTableCount(String(activeTables.length || total));
    } catch (err) {
      console.error("❌ Failed to save table count:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setSavingTableCount(false);
    }
  };

  const saveNewProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      toast.error(t("Please fill required fields"));
      return;
    }
    setSavingProduct(true);
    try {
      let imageUrl = "";
      if (newProductImageFile) {
        setUploadingNewProductImage(true);
        try {
          const formData = new FormData();
          formData.append("file", newProductImageFile);
          const res = await secureFetch("/upload", {
            method: "POST",
            body: formData,
          });
          if (!res?.url) {
            toast.error(t("Image upload failed!"));
            return;
          }
          imageUrl = res.url;
        } finally {
          setUploadingNewProductImage(false);
        }
      }

      await secureFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: newProduct.name,
          price: Number(newProduct.price) || 0,
          category: newProduct.category || "",
          description: newProduct.description || "",
          image: imageUrl || "",
          visible: true,
        }),
      });
      toast.success(t("Saved successfully!"));
      setNewProduct({ name: "", price: "", category: "", description: "" });
      setNewProductImageFile(null);
      setNewProductImagePreview("");
      setCategoryImageFileName("");
      setCategoryImagePreview("");
      const prodData = await secureFetch("/products");
      setProducts(Array.isArray(prodData) ? prodData : prodData?.data || []);
    } catch (err) {
      console.error("❌ Failed to add product:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setSavingProduct(false);
    }
  };

  useEffect(() => {
    if (!newProductImageFile) {
      setNewProductImagePreview("");
      return undefined;
    }
    const url = URL.createObjectURL(newProductImageFile);
    setNewProductImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newProductImageFile]);

  const uploadCategoryImage = async (file) => {
    const category = String(newProduct.category || "").trim();
    if (!category) {
      toast.error(t("Category required first!"));
      return;
    }
    setUploadingCategoryImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("category", category.toLowerCase());
      const res = await secureFetch("/category-images", { method: "POST", body: fd });
      if (!res || res?.error) {
        toast.error(t("Upload failed"));
        return;
      }
      toast.success(t("Category image uploaded!"));
      const data = await secureFetch(
        `/category-images?category=${encodeURIComponent(category.toLowerCase())}`
      );
      if (Array.isArray(data) && data.length > 0 && data[0]?.image) {
        setCategoryImagePreview(resolveUploadSrc(data[0].image));
      }
    } catch (err) {
      console.error("❌ Category upload failed:", err);
      toast.error(t("Category upload failed!"));
    } finally {
      setUploadingCategoryImage(false);
    }
  };


  const toggleDisable = async (productId) => {
    const updated = disabledIds.includes(productId)
      ? disabledIds.filter((id) => id !== productId)
      : [...disabledIds, productId];
    setDisabledIds(updated);
    try {
      await secureFetch(`/settings/qr-menu-disabled`, {
        method: "POST",
        body: JSON.stringify({ disabled: updated }),
      });
      toast.success(t("Saved successfully!"));
    } catch {
      toast.error(t("Failed to save changes"));
    }
  };

  const deleteProduct = async (product) => {
    const productId = product?.id;
    if (!productId) return;

    const label = String(product?.name || "").trim() || `#${productId}`;
    const ok = window.confirm(
      t("Delete product?") + `\n\n${label}\n\n` + t("This cannot be undone.")
    );
    if (!ok) return;

    setDeletingProductId(productId);
    try {
      await secureFetch(`/products/${productId}`, { method: "DELETE" });
      setProducts((prev) => (Array.isArray(prev) ? prev.filter((p) => p?.id !== productId) : prev));

      if (disabledIds.includes(productId)) {
        const updatedDisabled = disabledIds.filter((id) => id !== productId);
        setDisabledIds(updatedDisabled);
        try {
          await secureFetch(`/settings/qr-menu-disabled`, {
            method: "POST",
            body: JSON.stringify({ disabled: updatedDisabled }),
          });
        } catch {
          // ignore; list is already cleaned locally
        }
      }

      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to delete product:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setDeletingProductId(null);
    }
  };

  const toggleDelivery = async () => {
    const nextValue = !settings.delivery_enabled;
    updateField("delivery_enabled", nextValue);
    setSavingDelivery(true);
    try {
      await secureFetch("/settings/qr-menu-delivery", {
        method: "POST",
        body: JSON.stringify({ delivery_enabled: nextValue }),
      });
      toast.success(nextValue ? t("Delivery is open") : t("Delivery is closed"));
    } catch (err) {
      console.error("❌ Failed to toggle delivery:", err);
      toast.error(t("Failed to save delivery setting"));
      updateField("delivery_enabled", !nextValue);
    } finally {
      setSavingDelivery(false);
    }
  };

  const toggleReservationTab = async () => {
    const nextValue = !settings.reservation_tab_enabled;
    updateField("reservation_tab_enabled", nextValue);
    setSavingReservationTab(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ reservation_tab_enabled: nextValue }),
      });
      toast.success(
        nextValue ? t("Reservation tab is open") : t("Reservation tab is closed")
      );
    } catch (err) {
      console.error("❌ Failed to toggle reservation tab:", err);
      toast.error(t("Failed to save reservation tab setting"));
      updateField("reservation_tab_enabled", !nextValue);
    } finally {
      setSavingReservationTab(false);
    }
  };

  const resetConcertEditor = () => {
    setEditingConcertId(null);
    setConcertForm(makeEmptyConcertForm());
  };

  const toConcertPayload = (source) => ({
    artist_name: String(source?.artist_name || "").trim(),
    event_title: String(source?.event_title || "").trim(),
    event_date: String(source?.event_date || "").trim(),
    event_time: String(source?.event_time || "").trim(),
    description: String(source?.description || "").trim(),
    event_image: String(source?.event_image || "").trim(),
    ticket_price: Number(source?.ticket_price) || 0,
    total_ticket_quantity: Number(source?.total_ticket_quantity) || 0,
    total_table_quantity: Number(source?.total_table_quantity) || 0,
    reservation_payment_method: "bank_transfer",
    bank_transfer_instructions: String(source?.bank_transfer_instructions || "").trim(),
    status: String(source?.status || "active").toLowerCase(),
    area_allocations: (Array.isArray(source?.area_allocations) ? source.area_allocations : [])
      .map((row) => ({
        area_name: String(row?.area_name || "").trim(),
        allocation_type: String(row?.allocation_type || "ticket").toLowerCase() === "table" ? "table" : "ticket",
        price: Number(row?.price) || 0,
        quantity_total: Number(row?.quantity_total) || 0,
      }))
      .filter((row) => row.area_name),
    ticket_types: (Array.isArray(source?.ticket_types) ? source.ticket_types : [])
      .map((row) => ({
        name: String(row?.name || "").trim(),
        area_name: String(row?.area_name || "").trim(),
        price: Number(row?.price) || 0,
        quantity_total: Number(row?.quantity_total) || 0,
        description: String(row?.description || "").trim(),
        is_table_package: Boolean(row?.is_table_package),
      }))
      .filter((row) => row.name),
  });

  const loadConcerts = async () => {
    setLoadingConcerts(true);
    try {
      const [eventsRes, areasRes] = await Promise.all([
        secureFetch("/concerts/events?include_hidden=true"),
        secureFetch("/concerts/areas"),
      ]);
      setConcertEvents(Array.isArray(eventsRes?.events) ? eventsRes.events : []);
      setConcertAreas(Array.isArray(areasRes?.areas) ? areasRes.areas : []);
    } catch (err) {
      console.error("❌ Failed to load concert data:", err);
      setConcertEvents([]);
      setConcertAreas([]);
    } finally {
      setLoadingConcerts(false);
    }
  };

  const updateConcertFormField = (key, value) => {
    setConcertForm((prev) => ({ ...prev, [key]: value }));
  };

  const addConcertAreaAllocation = () => {
    setConcertForm((prev) => ({
      ...prev,
      area_allocations: [...(prev.area_allocations || []), makeEmptyConcertAreaAllocation()],
    }));
  };

  const removeConcertAreaAllocation = (index) => {
    setConcertForm((prev) => ({
      ...prev,
      area_allocations: (prev.area_allocations || []).filter((_, i) => i !== index),
    }));
  };

  const updateConcertAreaAllocationField = (index, key, value) => {
    setConcertForm((prev) => {
      const next = [...(prev.area_allocations || [])];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [key]: value };
      return { ...prev, area_allocations: next };
    });
  };

  const addConcertTicketType = () => {
    setConcertForm((prev) => ({
      ...prev,
      ticket_types: [...(prev.ticket_types || []), makeEmptyConcertTicketType()],
    }));
  };

  const removeConcertTicketType = (index) => {
    setConcertForm((prev) => ({
      ...prev,
      ticket_types: (prev.ticket_types || []).filter((_, i) => i !== index),
    }));
  };

  const updateConcertTicketTypeField = (index, key, value) => {
    setConcertForm((prev) => {
      const next = [...(prev.ticket_types || [])];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [key]: value };
      return { ...prev, ticket_types: next };
    });
  };

  const startEditConcert = (event) => {
    setEditingConcertId(event.id);
    setConcertForm({
      artist_name: event.artist_name || "",
      event_title: event.event_title || "",
      event_date: String(event.event_date || "").slice(0, 10),
      event_time: String(event.event_time || "").slice(0, 5),
      description: event.description || "",
      event_image: event.event_image || "",
      ticket_price: String(event.ticket_price ?? ""),
      total_ticket_quantity: String(event.total_ticket_quantity ?? ""),
      total_table_quantity: String(event.total_table_quantity ?? ""),
      reservation_payment_method: "bank_transfer",
      bank_transfer_instructions: event.bank_transfer_instructions || "",
      status: event.status || "active",
      area_allocations:
        Array.isArray(event.area_allocations) && event.area_allocations.length > 0
          ? event.area_allocations.map((row) => ({
              area_name: row.area_name || "",
              allocation_type: row.allocation_type || "ticket",
              price: String(row.price ?? ""),
              quantity_total: String(row.quantity_total ?? ""),
            }))
          : [makeEmptyConcertAreaAllocation()],
      ticket_types:
        Array.isArray(event.ticket_types) && event.ticket_types.length > 0
          ? event.ticket_types.map((row) => ({
              name: row.name || "",
              area_name: row.area_name || "",
              price: String(row.price ?? ""),
              quantity_total: String(row.quantity_total ?? ""),
              description: row.description || "",
              is_table_package: Boolean(row.is_table_package),
            }))
          : [makeEmptyConcertTicketType()],
    });
  };

  const uploadConcertImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingConcertImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await secureFetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!res?.url) {
        toast.error(t("Upload failed"));
        return;
      }
      updateConcertFormField("event_image", res.url);
    } catch (err) {
      console.error("❌ Failed to upload concert image:", err);
      toast.error(t("Upload failed"));
    } finally {
      setUploadingConcertImage(false);
      event.target.value = "";
    }
  };

  const saveConcert = async () => {
    const payload = toConcertPayload(concertForm);
    if (!payload.artist_name || !payload.event_date || !payload.event_time) {
      toast.error(t("Please fill required fields"));
      return;
    }
    setSavingConcert(true);
    try {
      const endpoint = editingConcertId
        ? `/concerts/events/${editingConcertId}`
        : "/concerts/events";
      const method = editingConcertId ? "PUT" : "POST";
      await secureFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      toast.success(t("Saved successfully!"));
      resetConcertEditor();
      await loadConcerts();
    } catch (err) {
      console.error("❌ Failed to save concert:", err);
      toast.error(err?.message || t("Failed to save changes"));
    } finally {
      setSavingConcert(false);
    }
  };

  const removeConcert = async (event) => {
    if (!event?.id) return;
    const ok = window.confirm(
      `${t("Delete")} ${event.event_title || event.artist_name || ""}?\n\n${t("This cannot be undone.")}`
    );
    if (!ok) return;
    setDeletingConcertId(event.id);
    try {
      await secureFetch(`/concerts/events/${event.id}`, { method: "DELETE" });
      toast.success(t("Saved successfully!"));
      if (editingConcertId === event.id) {
        resetConcertEditor();
      }
      await loadConcerts();
    } catch (err) {
      console.error("❌ Failed to delete concert:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setDeletingConcertId(null);
    }
  };

  const loadConcertBookings = async (eventId) => {
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    setLoadingConcertBookingsEventId(numericId);
    try {
      const res = await secureFetch(`/concerts/events/${numericId}/bookings`);
      setConcertBookingsByEvent((prev) => ({
        ...prev,
        [numericId]: Array.isArray(res?.bookings) ? res.bookings : [],
      }));
    } catch (err) {
      console.error("❌ Failed to load concert bookings:", err);
      toast.error(t("Failed to load settings"));
    } finally {
      setLoadingConcertBookingsEventId(null);
    }
  };

  const updateConcertBookingPayment = async (eventId, bookingId, paymentStatus) => {
    const numericBookingId = Number(bookingId);
    if (!Number.isFinite(numericBookingId) || numericBookingId <= 0) return;
    setUpdatingConcertBookingId(numericBookingId);
    try {
      await secureFetch(`/concerts/bookings/${numericBookingId}/payment-status`, {
        method: "PATCH",
        body: JSON.stringify({ payment_status: paymentStatus }),
      });
      toast.success(t("Saved successfully!"));
      await Promise.all([loadConcerts(), loadConcertBookings(eventId)]);
    } catch (err) {
      console.error("❌ Failed to update concert booking payment:", err);
      toast.error(err?.message || t("Failed to save changes"));
    } finally {
      setUpdatingConcertBookingId(null);
    }
  };

  const formatConcertDateTime = (event) => {
    const dateValue = String(event?.event_date || "").slice(0, 10);
    const timeValue = String(event?.event_time || "").slice(0, 5);
    return [dateValue, timeValue].filter(Boolean).join(" ");
  };

  const copyLink = () => {
    if (!qrUrl) return;
    navigator.clipboard.writeText(qrUrl);
    toast.info(t("QR link copied!"));
  };

  const downloadQR = () => {
    if (!qrUrl) return;
    const container = qrRef.current;
    if (!container) return;

    const triggerDownload = (href, filename) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    const exportFromCanvas = (sourceCanvas, filename) => {
      const size = 320;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(sourceCanvas, 0, 0, size, size);
      triggerDownload(exportCanvas.toDataURL("image/png"), filename);
    };

    const canvas = container.querySelector("canvas");
    if (canvas) {
      exportFromCanvas(canvas, "qr-menu.png");
      return;
    }

    const svg = container.querySelector("svg");
    if (!svg) {
      toast.error(t("QR code not ready yet"));
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new window.Image();
    img.onload = () => {
      const size = 320;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      triggerDownload(exportCanvas.toDataURL("image/png"), "qr-menu.png");
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printQR = () => {
    if (!qrUrl) return;
    const container = qrRef.current;
    if (!container) return;

    const canvas = container.querySelector("canvas");
    let imgSrc = "";
    if (canvas) {
      imgSrc = canvas.toDataURL("image/png");
    } else {
      const svg = container.querySelector("svg");
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        imgSrc = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      }
    }
    if (!imgSrc) {
      toast.error(t("QR code not ready yet"));
      return;
    }

    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>${t("Print QR Code")}</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <img src="${imgSrc}" style="margin-top:30px;width:260px;height:260px;" />
        <div style="margin-top:10px;font-size:16px">${qrUrl}</div>
        <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  const filteredProducts = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );
  const concertAreaOptions = Array.from(
    new Set([
      ...concertAreas,
      ...tables.map((tbl) => String(tbl?.area || "").trim()).filter(Boolean),
    ])
  );

  const loadTableQr = async (number) => {
    setTableQr((prev) => ({
      ...prev,
      [number]: { ...(prev[number] || {}), loading: true },
    }));
    try {
      const res = await secureFetch(`/tables/${number}/qr-token`);
      if (res?.url) {
        setTableQr((prev) => ({
          ...prev,
          [number]: { ...prev[number], url: res.url, loading: false },
        }));
      } else {
        setTableQr((prev) => ({
          ...prev,
          [number]: { ...(prev[number] || {}), loading: false },
        }));
        toast.error(t("Failed to generate table QR link"));
      }
    } catch (err) {
      console.error("❌ Failed to generate table QR:", err);
      setTableQr((prev) => ({
        ...prev,
        [number]: { ...(prev[number] || {}), loading: false },
      }));
      toast.error(t("Failed to generate table QR link"));
    }
  };

  const copyTableQr = (number) => {
    const url = tableQr[number]?.url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.info(t("QR link copied!"));
  };

  const printTableQr = (number, canvasId) => {
    const url = tableQr[number]?.url;
    if (!url) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const png = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>${t("Print QR Code")}</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <img src="${png}" style="margin-top:30px;width:260px;height:260px;" />
        <div style="margin-top:10px;font-size:16px">${url}</div>
        <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  useEffect(() => {
    let active = true;
    const identifier = extractIdentifierFromQrUrl(qrUrl);

    const loadShopHours = async ({ withSpinner = false, showToastOnError = false } = {}) => {
      if (withSpinner && active) setLoadingShopHours(true);
      try {
        let data = null;

        if (identifier) {
          try {
            data = await secureFetch(`/public/shop-hours/${encodeURIComponent(identifier)}`);
          } catch {
            data = null;
          }
        }

        if (!Array.isArray(data)) {
          data = await secureFetch("/settings/shop-hours/all");
        }

        if (!active) return;
        const hoursMap = {};
        days.forEach((day) => {
          hoursMap[day] = { open: "", close: "", enabled: false };
        });
        if (Array.isArray(data)) {
          data.forEach((row) => {
            hoursMap[row.day] = {
              open: row.open_time || "",
              close: row.close_time || "",
              enabled: Boolean(row.open_time && row.close_time),
            };
          });
        }
        setShopHours(hoursMap);
        setShopHoursDirty(false);
        setShopHoursSaveStatus("idle");
      } catch (err) {
        console.error("❌ Failed to load shop hours:", err);
        if (showToastOnError) {
          toast.error(t("Failed to load settings"));
        }
      } finally {
        if (withSpinner && active) setLoadingShopHours(false);
      }
    };

    loadShopHours({ withSpinner: true, showToastOnError: true });

    const pollId = window.setInterval(() => {
      loadShopHours({ withSpinner: false, showToastOnError: false });
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadShopHours({ withSpinner: false, showToastOnError: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [qrUrl, t]);

  const handleShopHoursChange = (day, field, value) => {
    setShopHours((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || {}),
        [field]: value,
        enabled: true,
      },
    }));
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleShopHoursDayToggle = (day) => {
    setShopHours((prev) => {
      const current = prev[day] || { open: "", close: "", enabled: false };
      const nextEnabled = !(current.enabled !== false);
      return {
        ...prev,
        [day]: {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        },
      };
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleMainShopToggle = () => {
    setShopHours((prev) => {
      const currentlyOpen = days.some((day) => prev[day]?.enabled !== false);
      const nextEnabled = !currentlyOpen;
      const updated = { ...prev };
      days.forEach((day) => {
        const current = updated[day] || { open: "", close: "", enabled: false };
        updated[day] = {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        };
      });
      return updated;
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const shopEnabled = days.some((day) => shopHours[day]?.enabled !== false);

  const saveShopHours = async ({ showToast = false } = {}) => {
    if (savingShopHours) return;
    setSavingShopHours(true);
    setShopHoursSaveStatus("saving");
    try {
      const payloadHours = {};
      for (const day of days) {
        const current = shopHours[day] || {};
        const enabled = current.enabled !== false;
        payloadHours[day] = {
          open: enabled ? current.open || "09:00" : null,
          close: enabled ? current.close || "22:00" : null,
        };
      }
      await secureFetch("/settings/shop-hours/all", {
        method: "POST",
        body: JSON.stringify({ hours: payloadHours }),
      });
      try {
        window.dispatchEvent(new Event("qr:shop-hours-updated"));
        localStorage.setItem("qr_shop_hours_updated_at", String(Date.now()));
      } catch {}
      setShopHoursDirty(false);
      setShopHoursSaveStatus("saved");
      if (showToast) {
        toast.success(t("✅ Shop hours saved successfully!"));
      }
    } catch (err) {
      console.error("❌ Save failed:", err);
      setShopHoursSaveStatus("error");
      toast.error(t("Save failed"));
    } finally {
      setSavingShopHours(false);
    }
  };

  useEffect(() => {
    if (loadingShopHours || savingShopHours || !shopHoursDirty) return;
    const timer = window.setTimeout(() => {
      saveShopHours({ showToast: false });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [loadingShopHours, savingShopHours, shopHoursDirty, shopHours]);

  const todayName = (() => {
    const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return map[new Date().getDay()];
  })();

  const parseTimeToMinutes = (value) => {
    const s = String(value || "").trim();
    if (!s) return null;
    const [hh, mm] = s.split(":").map((part) => Number(part));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const openStatus = (() => {
    const today = shopHours?.[todayName];
    if (today?.enabled === false) {
      return { isOpen: false, label: t("Closed"), source: "schedule" };
    }
    const openMin = parseTimeToMinutes(today?.open);
    const closeMin = parseTimeToMinutes(today?.close);
    if (openMin === null || closeMin === null) {
      return { isOpen: false, label: t("Closed"), source: "schedule" };
    }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    if (closeMin > openMin) {
      const isOpen = nowMin >= openMin && nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed"), source: "schedule" };
    }

    if (closeMin < openMin) {
      const isOpen = nowMin >= openMin || nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed"), source: "schedule" };
    }

    return { isOpen: false, label: t("Closed"), source: "schedule" };
  })();

  useEffect(() => {
    const onDown = (e) => {
      const el = shopHoursDropdownRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setShowShopHoursDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
 return (
  <div className="max-w-5xl mx-auto px-4 py-10">
    <h1 className="text-3xl font-extrabold mb-6 flex items-center gap-3 bg-gradient-to-r from-blue-600 via-fuchsia-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow">
      <QrCode className="w-9 h-9" />
      {t("QR Menu Settings")}
    </h1>

    {/* QR section */}
    <div className="flex flex-col md:flex-row items-center gap-8 mb-10 bg-gradient-to-br from-white/80 via-blue-50 to-indigo-100 dark:from-zinc-900/80 dark:via-blue-950/90 dark:to-indigo-950/90 rounded-3xl shadow-2xl p-7 border border-white/30 backdrop-blur-xl">
      <div
        ref={qrRef}
        className="bg-white dark:bg-zinc-950 rounded-2xl p-4 shadow-xl border border-blue-100 dark:border-blue-800 flex flex-col items-center"
      >
        {loadingLink ? (
          <div className="w-[180px] h-[180px] flex items-center justify-center text-gray-400">
            {t("Generating QR...")}
          </div>
        ) : (
          <QRCodeCanvas id="qrCanvas" value={qrUrl || ""} size={180} />
        )}
        <div className="mt-3 w-full flex items-center justify-center" ref={shopHoursDropdownRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShopHoursDropdown((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold shadow-sm transition ${
                openStatus.isOpen
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
              title={t("Shop Hours")}
            >
              <span>{openStatus.label}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showShopHoursDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {showShopHoursDropdown && (
              <div className="absolute left-1/2 top-[calc(100%+10px)] w-[320px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl p-3 z-10 dark:border-slate-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                  <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {t("Shop Hours")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShopHoursDropdown(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none"
                    aria-label={t("Close")}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {days.map((day) => {
                    const isToday = day === todayName;
                    const open = shopHours?.[day]?.open || "";
                    const close = shopHours?.[day]?.close || "";
                    const enabled = shopHours?.[day]?.enabled !== false;
                    const has = enabled && !!(open && close);
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                          isToday
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/30 dark:text-indigo-200"
                            : "bg-slate-50 text-slate-700 dark:bg-zinc-900/40 dark:text-slate-200"
                        }`}
                      >
                        <span className="font-semibold">{t(day)}</span>
                        <span className="font-mono text-xs">
                          {has ? `${open} - ${close}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="font-mono text-xs text-gray-500 mt-3 text-center break-all max-w-xs">
          {qrUrl || t("QR link not available yet")}
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full md:w-auto">
        <button
          onClick={copyLink}
          disabled={!qrUrl}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg hover:scale-105 transition"
        >
          <Copy className="w-4 h-4" /> {t("Copy Link")}
        </button>

        <button
          onClick={() => {
            if (!qrUrl) return;
            window.open(qrUrl, "_blank", "noopener,noreferrer");
          }}
          disabled={!qrUrl}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:scale-105 transition"
        >
          <Eye className="w-4 h-4" /> {t("Navigate")}
        </button>

        <button
          onClick={downloadQR}
          disabled={!qrUrl}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-lg hover:scale-105 transition"
        >
          <Download className="w-4 h-4" /> {t("Download QR")}
        </button>

        <button
          onClick={printQR}
          disabled={!qrUrl}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-slate-400 to-gray-700 text-white shadow-lg hover:scale-105 transition"
        >
          <Printer className="w-4 h-4" /> {t("Print QR")}
        </button>
      </div>
    </div>

    {/* Shop Hours */}
    <div className="mb-10 bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 overflow-hidden">
      <div className="p-5 border-b border-blue-100 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
            {t("Customize Shop Hours")}
          </h2>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span
              className={`text-sm font-bold ${
                shopEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {shopEnabled ? t("Shop Open") : t("Shop Closed")}
            </span>
            <span className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={shopEnabled}
                onChange={handleMainShopToggle}
                className="sr-only peer"
              />
              <span className="w-11 h-6 bg-gray-300 peer-checked:bg-emerald-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </span>
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("Set opening and closing times for each day.")}
        </p>
      </div>

      <div className="p-5">
        {loadingShopHours ? (
          <div className="text-slate-500 dark:text-slate-400">{t("Loading...")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {days.map((day) => {
              const enabled = shopHours[day]?.enabled !== false;
              return (
                <div
                  key={day}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-zinc-900/60 dark:to-zinc-950/40 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {t(day)}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => handleShopHoursDayToggle(day)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className={enabled ? "" : "opacity-50"}>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {t("Open Time")}
                    </label>
                    <input
                      type="time"
                      value={shopHours[day]?.open || ""}
                      disabled={!enabled}
                      onChange={(e) => handleShopHoursChange(day, "open", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition disabled:cursor-not-allowed"
                    />
                    <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {t("Close Time")}
                    </label>
                    <input
                      type="time"
                      value={shopHours[day]?.close || ""}
                      disabled={!enabled}
                      onChange={(e) => handleShopHoursChange(day, "close", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {shopHoursSaveStatus === "saving"
              ? t("Saving...")
              : shopHoursSaveStatus === "saved"
              ? t("Saved")
              : shopHoursSaveStatus === "error"
              ? t("Save failed")
              : t("Auto-save enabled")}
          </div>
        </div>
      </div>
    </div>

    {/* Products list */}
    <div className="bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-blue-100 dark:border-zinc-800">
        <Search className="w-5 h-5 text-blue-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search products...")}
          className="flex-1 px-4 py-2 rounded-xl border-2 border-blue-100 bg-white dark:bg-zinc-900 text-base focus:ring-2 focus:ring-blue-300 transition"
        />
      </div>

      <div className="max-h-[440px] overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-transparent bg-clip-text">
          {t("Products visible in QR Menu")}
        </h2>

        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-lg">
            {t("No products found.")}
          </div>
        ) : (
          <ul className="divide-y divide-blue-50 dark:divide-zinc-900">
	            {filteredProducts.map((p) => (
	              <li key={p.id} className="flex items-center justify-between py-2 px-1">
	                <span
	                  className={`flex items-center gap-2 font-medium ${
	                    disabledIds.includes(p.id)
	                      ? "line-through text-gray-400"
	                      : "text-blue-900 dark:text-blue-100"
	                  }`}
	                >
                  <img
                    src={
                      p.image
                        ? p.image.startsWith("http")
                          ? p.image
                          : `${window.location.origin.replace(":5173", ":5000")}/uploads/${p.image}`
                        : "/Productsfallback.jpg"
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/Productsfallback.jpg";
                    }}
                    alt={p.name}
                    className="w-7 h-7 rounded-lg object-cover border"
                    loading="lazy"
                  />
	                  {p.name}
	                </span>

	                <div className="ml-4 flex items-center gap-2">
	                  <button
	                    type="button"
	                    onClick={() => deleteProduct(p)}
	                    disabled={deletingProductId === p.id}
	                    className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
	                    title={t("Delete")}
	                  >
	                    <Trash2 className="w-4 h-4" />
	                  </button>

	                  <button
	                    type="button"
	                    className={`w-14 h-8 rounded-full flex items-center px-1 transition-all ${
	                      disabledIds.includes(p.id)
	                        ? "bg-gray-300"
	                        : "bg-gradient-to-r from-blue-400 to-indigo-500 shadow-lg"
	                    }`}
	                    onClick={() => toggleDisable(p.id)}
	                  >
	                    <span
	                      className={`w-6 h-6 rounded-full bg-white shadow transition-all flex items-center justify-center ${
	                        disabledIds.includes(p.id) ? "translate-x-6" : "translate-x-0"
	                      }`}
	                    >
	                      {disabledIds.includes(p.id) ? (
	                        <EyeOff className="w-4 h-4 text-gray-400" />
	                      ) : (
	                        <Eye className="w-4 h-4 text-blue-500" />
	                      )}
	                    </span>
	                  </button>
	                </div>
	              </li>
	            ))}
	          </ul>
	        )}
	      </div>

      {/* --------------------------------------------------------------------------------
         QR MENU WEBSITE BUILDER 
      -------------------------------------------------------------------------------- */}
      <div className="mt-12 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-3xl font-extrabold mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
          🛠️ {t("QR Menu Website Builder")}
        </h2>

        {/* Main Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="font-semibold">{t("Main Title")}</label>
            <input
              type="text"
              value={settings.main_title}
              onChange={(e) => updateField("main_title", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Subtitle")}</label>
            <input
              type="text"
              value={settings.subtitle}
              onChange={(e) => updateField("subtitle", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Tagline (small)")}</label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Phone Number")}</label>
            <input
              type="text"
              value={settings.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div className="md:col-span-2">
            <label className="font-semibold">{t("Delivery Ordering")}</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  settings.delivery_enabled
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-rose-100 text-rose-700 border border-rose-200"
                }`}
              >
                {settings.delivery_enabled
                  ? t("Delivery is open")
                  : t("Delivery is closed")}
              </span>
              <button
                className="px-5 py-2 rounded-full border border-blue-500 bg-blue-500/10 text-blue-600 font-semibold hover:bg-blue-500/20 transition disabled:opacity-50 disabled:hover:bg-blue-500/10"
                onClick={toggleDelivery}
                disabled={savingDelivery}
              >
                {settings.delivery_enabled
                  ? t("Close Delivery")
                  : t("Open Delivery")}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t(
                "Toggle whether delivery/online ordering appears in the QR menu order picker."
              )}
            </p>
            <div className="mt-4">
              <label className="font-semibold">{t("Reservation Header Tab")}</label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    settings.reservation_tab_enabled
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-rose-100 text-rose-700 border border-rose-200"
                  }`}
                >
                  {settings.reservation_tab_enabled
                    ? t("Reservation tab is open")
                    : t("Reservation tab is closed")}
                </span>
                <button
                  type="button"
                  className="px-5 py-2 rounded-full border border-blue-500 bg-blue-500/10 text-blue-600 font-semibold hover:bg-blue-500/20 transition disabled:opacity-50 disabled:hover:bg-blue-500/10"
                  onClick={toggleReservationTab}
                  disabled={savingReservationTab}
                >
                  {settings.reservation_tab_enabled
                    ? t("Close Reservation Tab")
                    : t("Open Reservation Tab")}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t(
                  "This only controls the Reservation tab in the QR header. Concert reservations stay active."
                )}
              </p>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="font-semibold">{t("Table Order Location Check")}</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  settings.table_geo_enabled
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-rose-100 text-rose-700 border border-rose-200"
                }`}
              >
                {settings.table_geo_enabled
                  ? t("Location check enabled")
                  : t("Location check disabled")}
              </span>
              <button
                type="button"
                className="px-5 py-2 rounded-full border border-blue-500 bg-blue-500/10 text-blue-600 font-semibold hover:bg-blue-500/20 transition"
                onClick={() => updateField("table_geo_enabled", !settings.table_geo_enabled)}
              >
                {settings.table_geo_enabled
                  ? t("Disable Location Check")
                  : t("Enable Location Check")}
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="25"
                  max="1000"
                  step="5"
                  value={settings.table_geo_radius_meters ?? 150}
                  onChange={(e) =>
                    updateField("table_geo_radius_meters", Number(e.target.value) || 0)
                  }
                  className="w-24 p-2 rounded-xl border bg-white dark:bg-zinc-800"
                />
                <span className="text-sm text-gray-600">{t("meters")}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t("Require table orders to be within this distance of the restaurant.")}
            </p>
          </div>

          <div>
            <label className="font-semibold">{t("Primary Accent Color")}</label>
            <input
              type="color"
              value={settings.primary_color || "#4F46E5"}
              onChange={(e) => updateField("primary_color", e.target.value)}
              className="w-20 h-12 p-1 rounded-xl border"
            />
          </div>
        </div>

        {/* HERO SLIDER */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Hero Slider")}</h3>

          {settings.hero_slides.map((slide, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-800 border rounded-2xl p-4 mb-4 shadow-md"
            >
              <label className="font-semibold">{t("Slide Image")}</label>
              <input type="file" onChange={(e) => uploadHeroImage(e, index)} className="w-full mt-1" />
              {slide.image ? (
                <div className="mt-2">
                  <img
                    src={resolveUploadSrc(slide.image)}
                    alt={`${t("Slide Image")} ${index + 1}`}
                    className="h-16 w-24 rounded-lg border object-cover"
                  />
                </div>
              ) : null}

              <label className="font-semibold mt-2 block">{t("Title")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.title}
                onChange={(e) => updateHeroSlide(index, "title", e.target.value)}
              />

              <label className="font-semibold mt-2 block">{t("Subtitle")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.subtitle}
                onChange={(e) => updateHeroSlide(index, "subtitle", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addHeroSlide}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Slide")}
          </button>
        </div>

        {/* POPULAR + THEME */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border">
            <label className="font-semibold block mb-2">{t("Popular This Week")}</label>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!settings.enable_popular}
                onChange={(e) => updateField("enable_popular", e.target.checked)}
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {t("Automatically shows trending products based on orders.")}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border">
            <label className="font-semibold block mb-2">{t("Theme")}</label>
            <select
              value={settings.qr_theme || "auto"}
              onChange={(e) => updateField("qr_theme", e.target.value)}
              className="w-full p-3 rounded-xl border bg-white dark:bg-zinc-900"
            >
              <option value="auto">{t("Auto")}</option>
              <option value="light">{t("Light")}</option>
              <option value="dark">{t("Dark")}</option>
            </select>
          </div>
        </div>

        {/* QUICK SETUP */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
            <h3 className="text-xl font-bold mb-3 text-indigo-600">
              {t("Tables")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {t("Set the total number of tables for QR codes.")}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                className="w-32 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={saveTableCount}
                disabled={savingTableCount}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {savingTableCount ? t("Please wait...") : t("Save")}
              </button>
            </div>
          </div>

	          <div className="bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
	            <h3 className="text-xl font-bold mb-3 text-indigo-600">
	              {t("Add Product")}
	            </h3>
	            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
	              <input
	                value={newProduct.name}
	                onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
	                placeholder={t("Product Name")}
	                className="p-3 rounded-xl border bg-white dark:bg-zinc-900"
	              />
	              <input
	                type="number"
	                min="0"
	                step="0.01"
	                value={newProduct.price}
	                onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
	                placeholder={t("Price")}
	                className="p-3 rounded-xl border bg-white dark:bg-zinc-900"
	              />
	              <input
	                value={newProduct.category}
	                onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))}
	                placeholder={t("Category")}
	                className="p-3 rounded-xl border bg-white dark:bg-zinc-900 sm:col-span-2"
	              />

	              {/* Category Image (same flow as ProductForm modal) */}
	              <div className="sm:col-span-2">
                <label className="font-semibold block mb-2">{t("Category Image")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={categoryImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setCategoryImageFileName(file?.name || "");
                      if (!file) return;
                      await uploadCategoryImage(file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => categoryImageInputRef.current?.click()}
                    disabled={uploadingCategoryImage}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingCategoryImage ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {categoryImageFileName ? categoryImageFileName : t("No file chosen")}
                  </span>
                </div>
                {categoryImagePreview ? (
	                  <div className="mt-2 flex items-center gap-3">
	                    <img
	                      src={categoryImagePreview}
	                      alt={t("Category")}
	                      className="w-16 h-16 rounded-xl object-cover border bg-white"
	                    />
	                    <span className="text-sm text-gray-500 dark:text-gray-300">
	                      {t("Category Preview")}
	                    </span>
	                  </div>
	                ) : null}
	              </div>

	              {/* Product Image (same flow as ProductForm modal) */}
	              <div className="sm:col-span-2">
                <label className="font-semibold block mb-2">{t("Product Image")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={productImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      setNewProductImageFile(file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => productImageInputRef.current?.click()}
                    disabled={uploadingNewProductImage}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingNewProductImage ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {newProductImageFile?.name ? newProductImageFile.name : t("No file chosen")}
                  </span>
                </div>
                {newProductImagePreview ? (
	                  <img
	                    src={newProductImagePreview}
	                    alt={t("Product Image")}
	                    className="mt-2 w-24 h-24 rounded-xl object-cover border bg-white"
	                  />
	                ) : null}
	              </div>

	              <textarea
	                value={newProduct.description}
	                onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
	                placeholder={t("Description")}
	                className="p-3 rounded-xl border bg-white dark:bg-zinc-900 sm:col-span-2"
	                rows={3}
	              />
	            </div>
	            <button
	              type="button"
	              onClick={saveNewProduct}
	              disabled={savingProduct || uploadingNewProductImage || uploadingCategoryImage}
	              className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
	            >
	              {savingProduct ? t("Please wait...") : t("Save")}
	            </button>
	          </div>
        </div>

        {/* TABLE-SPECIFIC QR CODES */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">
            {t("Table QR Codes")}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {t("Generate QR codes that open the menu directly for a specific table.")}
          </p>
          {tables.length === 0 ? (
            <div className="text-gray-400 text-sm">
              {t("No tables configured yet. Go to the Tables page to add tables.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto">
              {tables.map((tbl) => {
                const n = tbl.number || tbl.tableNumber;
                const key = String(n);
                const info = tableQr[key] || {};
                const canvasId = `table-qr-${key}`;
                return (
                  <div
                    key={key}
                    className="flex gap-4 items-center bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-blue-100 dark:border-zinc-700"
                  >
                    <div className="flex flex-col items-center">
                      {info.url ? (
                        <QRCodeCanvas
                          id={canvasId}
                          value={info.url}
                          size={110}
                        />
                      ) : (
                        <div className="w-[110px] h-[110px] flex items-center justify-center text-xs text-gray-400 border border-dashed rounded-xl">
                          {t("No QR yet")}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => (info.url ? printTableQr(key, canvasId) : loadTableQr(key))}
                        className="mt-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-60"
                        disabled={info.loading}
                      >
                        {info.loading
                          ? t("Please wait...")
                          : info.url
                          ? t("Print")
                          : t("Generate QR")}
                      </button>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {t("Table")} {n}
                        {tbl.label ? ` – ${tbl.label}` : ""}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 break-all">
                        {info.url || t("QR link will appear here")}
                      </div>
                      {info.url && (
                        <button
                          type="button"
                          onClick={() => copyTableQr(key)}
                          className="mt-2 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          {t("Copy link")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CONCERT TICKETS */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-indigo-600">{t("Concert Tickets")}</h3>
            <span className="text-xs px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
              {t("Payment Method")}: {t("Bank Transfer")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {t("Create events, ticket packages, and table reservations synced with QR table reservations.")}
          </p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Artist name")}</label>
              <input
                type="text"
                value={concertForm.artist_name}
                onChange={(e) => updateConcertFormField("artist_name", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Event title")}</label>
              <input
                type="text"
                value={concertForm.event_title}
                onChange={(e) => updateConcertFormField("event_title", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Concert date")}</label>
              <input
                type="date"
                value={concertForm.event_date}
                onChange={(e) => updateConcertFormField("event_date", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Concert time")}</label>
              <input
                type="time"
                value={concertForm.event_time}
                onChange={(e) => updateConcertFormField("event_time", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold">{t("Concert picture")}</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={concertForm.event_image}
                  onChange={(e) => updateConcertFormField("event_image", e.target.value)}
                  placeholder={t("Image URL or uploaded path")}
                  className="flex-1 min-w-[220px] p-3 rounded-xl border bg-white dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => concertImageInputRef.current?.click()}
                  disabled={uploadingConcertImage}
                  className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60"
                >
                  {uploadingConcertImage ? t("Please wait...") : t("Upload image")}
                </button>
                <input
                  ref={concertImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={uploadConcertImage}
                  className="hidden"
                />
              </div>
              {concertForm.event_image ? (
                <img
                  src={resolveUploadSrc(concertForm.event_image)}
                  alt={t("Concert preview")}
                  className="mt-2 w-full max-w-sm aspect-[16/9] rounded-xl object-cover border border-gray-200"
                />
              ) : null}
            </div>
            <div>
              <label className="font-semibold">{t("Ticket price")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={concertForm.ticket_price}
                onChange={(e) => updateConcertFormField("ticket_price", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Status")}</label>
              <select
                value={concertForm.status}
                onChange={(e) => updateConcertFormField("status", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              >
                <option value="active">{t("active")}</option>
                <option value="sold_out">{t("sold out")}</option>
                <option value="hidden">{t("hidden")}</option>
              </select>
            </div>
            <div>
              <label className="font-semibold">{t("Total ticket quantity available")}</label>
              <input
                type="number"
                min="0"
                value={concertForm.total_ticket_quantity}
                onChange={(e) => updateConcertFormField("total_ticket_quantity", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Total table quantity available")}</label>
              <input
                type="number"
                min="0"
                value={concertForm.total_table_quantity}
                onChange={(e) => updateConcertFormField("total_table_quantity", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="font-semibold">{t("Description")}</label>
            <textarea
              rows={3}
              value={concertForm.description}
              onChange={(e) => updateConcertFormField("description", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>
          <div className="mt-4">
            <label className="font-semibold">{t("Bank Transfer Instructions")}</label>
            <textarea
              rows={2}
              value={concertForm.bank_transfer_instructions}
              onChange={(e) => updateConcertFormField("bank_transfer_instructions", e.target.value)}
              placeholder={t("Share account details and transfer note here")}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Area-based allocation")}</h4>
              <button
                type="button"
                onClick={addConcertAreaAllocation}
                className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t("Add")}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {(concertForm.area_allocations || []).map((row, index) => (
                <div key={`alloc-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded-xl border bg-white dark:bg-zinc-900">
                  <div>
                    <label className="text-xs font-semibold">{t("Area")}</label>
                    <input
                      list="concert-area-options"
                      value={row.area_name}
                      onChange={(e) => updateConcertAreaAllocationField(index, "area_name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Type")}</label>
                    <select
                      value={row.allocation_type}
                      onChange={(e) => updateConcertAreaAllocationField(index, "allocation_type", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    >
                      <option value="ticket">{t("Ticket")}</option>
                      <option value="table">{t("Table")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Price")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateConcertAreaAllocationField(index, "price", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Quantity")}</label>
                    <input
                      type="number"
                      min="0"
                      value={row.quantity_total}
                      onChange={(e) => updateConcertAreaAllocationField(index, "quantity_total", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeConcertAreaAllocation(index)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Ticket Types / Packages")}</h4>
              <button
                type="button"
                onClick={addConcertTicketType}
                className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t("Add")}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {(concertForm.ticket_types || []).map((row, index) => (
                <div key={`ticket-type-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 rounded-xl border bg-white dark:bg-zinc-900">
                  <div>
                    <label className="text-xs font-semibold">{t("Name")}</label>
                    <input
                      value={row.name}
                      onChange={(e) => updateConcertTicketTypeField(index, "name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Area")}</label>
                    <input
                      list="concert-area-options"
                      value={row.area_name}
                      onChange={(e) => updateConcertTicketTypeField(index, "area_name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Price")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateConcertTicketTypeField(index, "price", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Quantity")}</label>
                    <input
                      type="number"
                      min="0"
                      value={row.quantity_total}
                      onChange={(e) => updateConcertTicketTypeField(index, "quantity_total", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id={`ticket-type-table-${index}`}
                      type="checkbox"
                      checked={Boolean(row.is_table_package)}
                      onChange={(e) => updateConcertTicketTypeField(index, "is_table_package", e.target.checked)}
                    />
                    <label htmlFor={`ticket-type-table-${index}`} className="text-xs font-semibold">
                      {t("Table Package")}
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeConcertTicketType(index)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-xs font-semibold">{t("Description")}</label>
                    <textarea
                      rows={2}
                      value={row.description}
                      onChange={(e) => updateConcertTicketTypeField(index, "description", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900 resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <datalist id="concert-area-options">
            {concertAreaOptions.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveConcert}
              disabled={savingConcert}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {savingConcert ? t("Please wait...") : editingConcertId ? t("Update") : t("Create")}
            </button>
            {editingConcertId ? (
              <button
                type="button"
                onClick={resetConcertEditor}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50"
              >
                {t("Cancel")}
              </button>
            ) : null}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Upcoming Concerts")}</h4>
              {loadingConcerts ? (
                <span className="text-xs text-gray-500">{t("Loading...")}</span>
              ) : null}
            </div>
            {concertEvents.length === 0 ? (
              <div className="mt-3 text-sm text-gray-500">{t("No concerts yet.")}</div>
            ) : (
              <div className="mt-3 space-y-4">
                {concertEvents.map((event) => {
                  const bookings = concertBookingsByEvent[event.id];
                  const isBookingOpen = Array.isArray(bookings);
                  const eventImage = resolveUploadSrc(event.event_image);
                  return (
                    <div key={event.id} className="rounded-2xl border border-gray-200 bg-white dark:bg-zinc-900 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {eventImage ? (
                            <img
                              src={eventImage}
                              alt={event.event_title || event.artist_name || "Concert"}
                              className="w-20 h-14 rounded-lg object-cover border border-gray-200"
                            />
                          ) : null}
                          <div>
                            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {event.event_title || event.artist_name}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                              {event.artist_name} • {formatConcertDateTime(event)}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {t("Tickets sold")}: {event.sold_ticket_count || 0} / {event.total_ticket_quantity || 0} • {t("Tables reserved")}: {event.sold_table_count || 0} / {event.total_table_quantity || 0}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            event.status === "sold_out"
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : event.status === "hidden"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}>
                            {event.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditConcert(event)}
                            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                          >
                            {t("Edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeConcert(event)}
                            disabled={deletingConcertId === event.id}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-60"
                          >
                            {deletingConcertId === event.id ? t("Please wait...") : t("Delete")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isBookingOpen) {
                                setConcertBookingsByEvent((prev) => {
                                  const next = { ...prev };
                                  delete next[event.id];
                                  return next;
                                });
                                return;
                              }
                              loadConcertBookings(event.id);
                            }}
                            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                          >
                            {isBookingOpen ? t("Hide bookings") : t("View bookings")}
                          </button>
                        </div>
                      </div>

                      {Array.isArray(event.ticket_types) && event.ticket_types.length > 0 ? (
                        <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                          {(event.ticket_types || []).map((ticketType) => (
                            <div key={ticketType.id} className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{ticketType.name}</span>
                              {ticketType.area_name ? <span>• {ticketType.area_name}</span> : null}
                              <span>• {ticketType.available_count}/{ticketType.quantity_total}</span>
                              <span>• {ticketType.price}</span>
                              {ticketType.is_table_package ? (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{t("Table Package")}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isBookingOpen ? (
                        <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
                          {loadingConcertBookingsEventId === event.id ? (
                            <div className="p-3 text-sm text-gray-500">{t("Loading...")}</div>
                          ) : bookings.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">{t("No bookings yet.")}</div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {bookings.map((booking) => (
                                <div key={booking.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <div>
                                    <div className="font-semibold">
                                      {booking.customer_name || "Guest"} {booking.customer_phone ? `• ${booking.customer_phone}` : ""}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {booking.booking_type} • {booking.quantity} • {booking.payment_status}
                                      {booking.ticket_type_name ? ` • ${booking.ticket_type_name}` : ""}
                                      {booking.reserved_table_number ? ` • ${t("Table")} ${booking.reserved_table_number}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateConcertBookingPayment(event.id, booking.id, "confirmed")}
                                      disabled={updatingConcertBookingId === booking.id || booking.payment_status === "confirmed"}
                                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50 disabled:opacity-60"
                                    >
                                      {t("Confirm")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateConcertBookingPayment(event.id, booking.id, "cancelled")}
                                      disabled={updatingConcertBookingId === booking.id || booking.payment_status === "cancelled"}
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs hover:bg-rose-50 disabled:opacity-60"
                                    >
                                      {t("Cancel")}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* LOYALTY PROGRAM */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Loyalty Program")}</h3>
          <div className="flex items-center gap-3 mb-4">
            <input
              id="loyalty_enabled"
              type="checkbox"
              checked={!!settings.loyalty_enabled}
              onChange={(e) => updateField("loyalty_enabled", e.target.checked)}
            />
            <label htmlFor="loyalty_enabled" className="font-medium">
              {t("Enable Loyalty")}
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold">{t("Stamps needed")}</label>
              <input
                type="number"
                min="1"
                value={settings.loyalty_goal || 10}
                onChange={(e) => updateField("loyalty_goal", Number(e.target.value))}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold">{t("Reward Description")}</label>
              <input
                type="text"
                value={settings.loyalty_reward_text || ""}
                onChange={(e) => updateField("loyalty_reward_text", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Loyalty Card Color")}</label>
              <input
                type="color"
                value={settings.loyalty_color || "#F59E0B"}
                onChange={(e) => updateField("loyalty_color", e.target.value)}
                className="w-20 h-12 p-1 rounded-xl border"
              />
            </div>
          </div>
        </div>

        {/* STORY */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-bold text-indigo-600">{t("Our Story Section")}</h3>
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={settings.story_enabled !== false}
                onChange={(e) => updateField("story_enabled", e.target.checked)}
              />
              <span>{t("Enable Story Section")}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Story Title")}</label>
              <input
                type="text"
                value={settings.story_title}
                onChange={(e) => updateField("story_title", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>

            <div>
              <label className="font-semibold">{t("Story Images")}</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={uploadStoryImages}
                className="w-full mt-1"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                {uploadingStoryImages
                  ? t("Uploading story images...")
                  : t("Upload multiple images. Drag thumbnails or use arrows to reorder them.")}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="font-semibold">{t("Story Text")}</label>
            <textarea
              rows="5"
              value={settings.story_text}
              onChange={(e) => updateField("story_text", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>

          {settings.story_images.length > 0 ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                  {t("Story Slide Order")}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {t("First image appears first in the slider.")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {settings.story_images.map((image, index) => (
                  <div
                    key={`${image}-${index}`}
                    draggable
                    onDragStart={() => setDraggedStoryImageIndex(index)}
                    onDragEnd={() => setDraggedStoryImageIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleStoryImageDrop(index)}
                    className={`rounded-2xl border bg-white dark:bg-zinc-900 overflow-hidden transition ${
                      draggedStoryImageIndex === index
                        ? "border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-900/40"
                        : "border-gray-200 dark:border-zinc-700"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-zinc-950">
                      <img
                        src={resolveUploadSrc(image)}
                        alt={`${t("Story Image")} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                          {t("Slide")} {index + 1}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                          {t("Drag to reorder")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveStoryImage(index, -1)}
                          disabled={index === 0}
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {t("Up")}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStoryImage(index, 1)}
                          disabled={index === settings.story_images.length - 1}
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {t("Down")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStoryImage(index)}
                          className="p-2 rounded-lg border text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                          aria-label={t("Remove Story Image")}
                          title={t("Remove Story Image")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-gray-500 dark:text-zinc-400">
              {t("No story images uploaded yet.")}
            </div>
          )}
        </div>

        {/* REVIEWS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Customer Reviews")}</h3>

          {settings.reviews.map((rev, index) => (
            <div key={index} className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-xl mb-3">
              <input
                type="text"
                className="w-full p-2 rounded-xl border"
                placeholder={t("Name")}
                value={rev.name}
                onChange={(e) => updateReview(index, "name", e.target.value)}
              />

              <input
                type="number"
                min="1"
                max="5"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Rating")}
                value={rev.rating}
                onChange={(e) => updateReview(index, "rating", e.target.value)}
              />

              <textarea
                rows="3"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Review text")}
                value={rev.text}
                onChange={(e) => updateReview(index, "text", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addReview}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Review")}
          </button>
        </div>

        {/* SOCIAL LINKS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Social Media")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder={t("Instagram URL")}
              value={settings.social_instagram}
              onChange={(e) => updateField("social_instagram", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder={t("TikTok URL")}
              value={settings.social_tiktok}
              onChange={(e) => updateField("social_tiktok", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder={t("Website URL")}
              value={settings.social_website}
              onChange={(e) => updateField("social_website", e.target.value)}
              className="p-3 rounded-xl border"
            />
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end mt-10">
          <button
            onClick={saveAllCustomization}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white rounded-xl shadow-lg font-bold"
          >
            💾 {t("Save All Changes")}
          </button>
        </div>
      </div>
    </div>
  </div>
);

}
