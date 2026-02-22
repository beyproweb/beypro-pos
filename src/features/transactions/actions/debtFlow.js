export function createDebtFlow(deps) {
  const {
    order,
    orderId,
    tableId,
    isDebtEligible,
    txApiRequest,
    setDebtError,
    setDebtSearch,
    setDebtSearchResults,
    setDebtLookupLoading,
    setDebtForm,
    setShowDebtModal,
    isDebtSaving,
    discountedTotal,
    debtForm,
    identifier,
    setIsDebtSaving,
    setOrder,
    setCartItems,
    setReceiptItems,
    setSelectedCartItemIds,
    showToast,
    t,
    debugNavigate,
    setDebtSearchLoading,
  } = deps;

  async function handleOpenDebtModal() {
    if (!order?.id) {
      showToast(t("Select an order first"));
      return;
    }
    if (!isDebtEligible) {
      showToast(t("Order must be confirmed before adding debt"));
      return;
    }
    setDebtError("");
    setDebtSearch("");
    setDebtSearchResults([]);
    setDebtLookupLoading(true);

    let phone = (order.customer_phone || "").trim();
    let name = (order.customer_name || "").trim();

    if (phone) {
      try {
        const existingCustomer = await txApiRequest(`/customers/by-phone/${encodeURIComponent(phone)}`);
        if (existingCustomer) {
          if (!name && existingCustomer.name) name = existingCustomer.name;
          if (!phone && existingCustomer.phone) phone = existingCustomer.phone;
        }
      } catch (err) {
        console.warn("⚠️ Failed to fetch existing customer for debt:", err);
      }
    }

    setDebtForm({ name, phone });
    setDebtLookupLoading(false);
    setShowDebtModal(true);
  }

  async function handleDebtSearch(value) {
    const term = value.trim();
    setDebtSearch(value);
    if (!term) {
      setDebtSearchResults([]);
      return;
    }
    setDebtSearchLoading(true);
    try {
      const query = `/customers?search=${encodeURIComponent(term)}`;
      const results = await txApiRequest(query);
      setDebtSearchResults(Array.isArray(results) ? results.slice(0, 5) : []);
    } catch (err) {
      console.error("❌ Failed to search customers for debt:", err);
      setDebtSearchResults([]);
    } finally {
      setDebtSearchLoading(false);
    }
  }

  function handleSelectDebtCustomer(customer) {
    setDebtForm({
      name: customer?.name || "",
      phone: customer?.phone || "",
    });
    setDebtSearch(customer?.name || customer?.phone || "");
    setDebtSearchResults([]);
  }

  async function handleAddToDebt() {
    if (!order?.id) {
      showToast(t("Select an order first"));
      return;
    }
    if (isDebtSaving) return;

    const outstanding = Number(discountedTotal.toFixed(2));
    const fallbackOutstanding = Number(order?.total) || 0;
    const amountToStore = outstanding > 0 ? outstanding : fallbackOutstanding;
    if (amountToStore <= 0) {
      setDebtError(t("No unpaid items to add to debt"));
      return;
    }

    const name = debtForm.name?.trim();
    const phone = debtForm.phone?.trim();

    if (!phone) {
      setDebtError(t("Customer phone is required for debt"));
      return;
    }
    if (!name) {
      setDebtError(t("Customer name is required for debt"));
      return;
    }

    try {
      setIsDebtSaving(true);
      const response = await txApiRequest(`/orders/${order.id}/add-debt${identifier}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_phone: phone,
          amount: amountToStore,
        }),
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      const updatedOrder = response.order || response;
      setOrder(updatedOrder);
      setCartItems([]);
      setReceiptItems([]);
      setSelectedCartItemIds(new Set());
      showToast(t("Order added to customer debt"));
      setShowDebtModal(false);

      if (tableId) {
        debugNavigate("/tableoverview?tab=tables");
      } else if (orderId) {
        debugNavigate("/orders");
      }
    } catch (err) {
      console.error("❌ Failed to add debt:", err);
      setDebtError(err.message || t("Failed to add order debt"));
    } finally {
      setIsDebtSaving(false);
    }
  }

  return {
    handleOpenDebtModal,
    handleDebtSearch,
    handleSelectDebtCustomer,
    handleAddToDebt,
  };
}
