import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "react-i18next";
import { useSwipeable } from "react-swipeable";

// Business constants
const paymentMethods = ["Cash", "Credit Card", "Sodexo", "Multinet"];

export default function useTransactionScreenLogic() {
  // Routing, translation, params
  const { tableId, orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // State
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(true);
  const [selectedForPayment, setSelectedForPayment] = useState([]);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState("percent"); // "percent" or "fixed"
  const [discountValue, setDiscountValue] = useState(10);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods[0]);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [subOrders, setSubOrders] = useState([]);
  const [activeSplitMethod, setActiveSplitMethod] = useState(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const orderType = orderId ? "phone" : "table";
  const [excludedItems, setExcludedItems] = useState([]);
  const [excludedCategories, setExcludedCategories] = useState([]);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [categoryImages, setCategoryImages] = useState({});
  const [splits, setSplits] = useState({
    Cash: 0,
    "Credit Card": 0,
    Sodexo: 0,
    Multinet: 0,
  });

  // Category helpers
  const categories = [...new Set(products.map((p) => p.category))].filter(Boolean);
  const activeCategory = categories[currentCategoryIndex] || "";
  const hasExtras = (item) => Array.isArray(item.extras) && item.extras.length > 0;

  // Extras price calculations
  const validExtras = selectedExtras.filter(ex => ex.quantity > 0);
  const extrasPricePerProduct = validExtras.reduce(
    (sum, ex) => sum + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)), 0
  );
  const basePrice = selectedProduct ? parseFloat(selectedProduct.price) || 0 : 0;
  const quantity = selectedProduct ? selectedProduct.quantity || 1 : 1;
  const perItemTotal = basePrice + extrasPricePerProduct;
  const fullTotal = perItemTotal * quantity;

  // Effects
  useEffect(() => {
    fetch("/api/category-images")
      .then(res => res.json())
      .then(data => {
        const dict = {};
        data.forEach(({ category, image }) => {
          dict[category.trim().toLowerCase()] = `/uploads/${image}`;
        });
        setCategoryImages(dict);
      });
  }, []);

  useEffect(() => {
    fetch("/api/kitchen/compile-settings")
      .then(res => res.json())
      .then(data => {
        setExcludedItems(data.excludedItems || []);
        setExcludedCategories(data.excludedCategories || []);
      });
  }, []);

  useEffect(() => {
    if (!window.socket) return;
    window.socket.on("item_paid", () => {
      if (window && typeof window.playPaidSound === "function") window.playPaidSound();
    });
    return () => {
      if (!window.socket) return;
      window.socket.off("item_paid");
    };
  }, []);

  useEffect(() => {
    fetch("/api/extras-groups")
      .then(res => res.json())
      .then(data => {
        setExtrasGroups(data.map(g => ({
          groupName: g.groupName || g.group_name,
          items: typeof g.items === "string" ? JSON.parse(g.items) : g.items || []
        })));
      })
      .catch(err => console.error("❌ Failed to load extras:", err));
  }, []);

  useEffect(() => {
    let url = window.location.hostname === "localhost"
      ? "/api/products"
      : `${window.location.origin}/api/products`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))].filter(Boolean);
        if (cats.length > 0) setCurrentCategoryIndex(0);
      })
      .catch(error => console.error("Error fetching products:", error));
  }, []);

  useEffect(() => {
    setDiscountValue(0);
    setDiscountType("percent");
  }, [tableId, orderId]);

  // Order/item fetchers
  const safeParseExtras = (extras) => {
    try {
      if (Array.isArray(extras)) return extras;
      if (typeof extras === "string" && extras.trim() !== "") {
        const parsed = JSON.parse(extras);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (err) {
      console.error("❌ Error parsing extras:", err);
      return [];
    }
  };

  useEffect(() => {
    const fetchPhoneOrder = async (orderId) => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) throw new Error("Failed to fetch phone order");
        const newOrder = await res.json();

        const itemsRes = await fetch(`/api/orders/${newOrder.id}/items`);
        const items = await itemsRes.json();

        const parsedItems = items.map(item => ({
          id: item.product_id,
          name: item.name,
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients
            : (typeof item.ingredients === "string"
              ? JSON.parse(item.ingredients || "[]")
              : []),
          extras: safeParseExtras(item.extras),
          unique_id: item.unique_id || `${item.product_id}-${JSON.stringify(item.extras)}`,
          confirmed: item.confirmed ?? false,
          paid: !!item.paid_at,
          payment_method: item.payment_method ?? "Unknown",
          receipt_id: item.receipt_id || "❌ NO RECEIPT",
          note: item.note || "",
          kitchen_status: item.kitchen_status || ""
        }));

        setCartItems(parsedItems); // Show all items, paid and unpaid
        setReceiptItems(parsedItems.filter(i => i.paid && i.receipt_id));

        let correctedStatus = newOrder.status;
        if (parsedItems.some(i => !i.confirmed)) {
          correctedStatus = "confirmed";
        } else if (parsedItems.some(i => i.confirmed && !i.paid)) {
          correctedStatus = "confirmed";
        } else if (parsedItems.every(i => i.confirmed && i.paid)) {
          correctedStatus = "paid";
        }
        setOrder({ ...newOrder, status: correctedStatus });
      } catch (error) {
        console.error("❌ Error fetching phone order:", error);
      } finally {
        setLoading(false);
      }
    };

    const createOrFetchTableOrder = async (tableId) => {
      try {
        let newOrder;
        const res = await fetch(`/api/orders?table_number=${tableId}`);
        if (!res.ok) throw new Error("Failed to fetch order");
        const data = await res.json();

        if (data.length > 0) {
          newOrder = data[0];
        } else {
          const createRes = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table_number: tableId, total: 0 }),
          });
          if (!createRes.ok) throw new Error("Failed to create order");
          newOrder = await createRes.json();
        }

        const itemsRes = await fetch(`/api/orders/${newOrder.id}/items`);
        const items = await itemsRes.json();

        const parsedItems = items.map(item => ({
          id: item.product_id,
          name: item.name,
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients
            : (typeof item.ingredients === "string"
              ? JSON.parse(item.ingredients || "[]")
              : []),
          extras: safeParseExtras(item.extras),
          unique_id: item.unique_id || `${item.product_id}-${JSON.stringify(item.extras)}`,
          confirmed: item.confirmed ?? false,
          paid: !!item.paid_at,
          payment_method: item.payment_method ?? "Unknown",
          receipt_id: item.receipt_id || "❌ NO RECEIPT",
          note: item.note || "",
          kitchen_status: item.kitchen_status || ""
        }));

        setCartItems(parsedItems);
        setReceiptItems(parsedItems.filter(i => i.paid && i.receipt_id));

        let correctedStatus = newOrder.status;
        if (parsedItems.some(i => !i.confirmed)) {
          correctedStatus = "confirmed";
        } else if (parsedItems.some(i => i.confirmed && !i.paid)) {
          correctedStatus = "confirmed";
        } else if (parsedItems.every(i => i.confirmed && i.paid)) {
          correctedStatus = "paid";
        }
        setOrder({ ...newOrder, status: correctedStatus });
      } catch (error) {
        console.error("❌ Error creating or fetching order:", error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchPhoneOrder(orderId);
    } else if (tableId) {
      createOrFetchTableOrder(tableId);
    }
  }, [tableId, orderId]);

  // --- Handler functions ---
  const addToCart = (product) => {
    if (!order) return;
    if (product?.selectedExtrasGroup?.length) {
      setNote("");
      setSelectedProduct(product);
      setSelectedExtras([]);
      setShowExtrasModal(true);
      return;
    }
    const uniqueId = `${product.id}-NO_EXTRAS`;
    const existingItem = cartItems.find(
      (item) =>
        item.unique_id === uniqueId &&
        (item.confirmed === false || item.confirmed === undefined) &&
        !item.paid
    );
    if (existingItem) {
      setCartItems((prev) =>
        prev.map((item) =>
          item.unique_id === uniqueId &&
          (item.confirmed === false || item.confirmed === undefined) &&
          !item.paid
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      const hasOld = cartItems.some(
        (item) =>
          item.unique_id === uniqueId &&
          (item.confirmed === true || item.paid)
      );
      const finalUniqueId = hasOld ? `${product.id}-NO_EXTRAS-${uuidv4()}` : uniqueId;
      setCartItems((prev) => [
        ...prev,
        {
          id: product.id,
          name: product.name,
          note: "",
          price: parseFloat(product.price),
          quantity: 1,
          ingredients: product.ingredients || [],
          extras: [],
          unique_id: finalUniqueId,
          confirmed: false,
          paid: false,
        },
      ]);
    }
    setOrder((prev) => ({ ...prev, status: "confirmed" }));
  };

  const incrementCartItem = (uniqueId) => {
    setCartItems(prev =>
      prev.map(item =>
        item.unique_id === uniqueId &&
        !item.paid &&
        (!item.confirmed && (!item.extras || item.extras.length === 0))
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const decrementCartItem = (uniqueId) => {
    setCartItems(prev =>
      prev.map(item =>
        item.unique_id === uniqueId &&
        !item.paid &&
        (!item.confirmed && (!item.extras || item.extras.length === 0))
          ? { ...item, quantity: Math.max(item.quantity - 1, 1) }
          : item
      )
    );
  };

  const removeItem = (uniqueId) => {
    setCartItems((prev) =>
      prev.filter((item) => item.unique_id !== uniqueId || item.confirmed)
    );
  };

  const clearUnconfirmedCartItems = () => {
    setCartItems((prev) => prev.filter((item) => item.confirmed));
  };

  // Discounted total calculation
  function calculateDiscountedTotal() {
    const subtotal = cartItems.filter(i => !i.paid).reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (discountType === "percent") {
      return subtotal - (subtotal * (discountValue / 100));
    }
    if (discountType === "fixed") {
      return Math.max(0, subtotal - discountValue);
    }
    return subtotal;
  }

  // Add all other handlers and functions from your original code as needed...

  // Return all needed logic
  return {
    t,
    tableId, orderId, orderType, navigate, location,
    products, setProducts,
    cartItems, setCartItems,
    receiptItems, setReceiptItems,
    order, setOrder,
    loading, setLoading,
    selectedForPayment, setSelectedForPayment,
    showDiscountModal, setShowDiscountModal,
    discountType, setDiscountType,
    discountValue, setDiscountValue,
    selectedPaymentMethod, setSelectedPaymentMethod,
    editingCartItemIndex, setEditingCartItemIndex,
    isSplitMode, setIsSplitMode,
    showExtrasModal, setShowExtrasModal,
    selectedProduct, setSelectedProduct,
    selectedExtras, setSelectedExtras,
    extrasGroups, setExtrasGroups,
    showPaymentModal, setShowPaymentModal,
    subOrders, setSubOrders,
    activeSplitMethod, setActiveSplitMethod,
    note, setNote,
    toast, setToast,
    excludedItems, setExcludedItems,
    excludedCategories, setExcludedCategories,
    currentCategoryIndex, setCurrentCategoryIndex,
    categoryImages, setCategoryImages,
    splits, setSplits,
    categories,
    activeCategory,
    hasExtras,
    validExtras,
    extrasPricePerProduct,
    basePrice,
    quantity,
    perItemTotal,
    fullTotal,
    addToCart,
    incrementCartItem,
    decrementCartItem,
    removeItem,
    clearUnconfirmedCartItems,
    calculateDiscountedTotal,

    // ...add any other logic/handlers you need
  };
}
