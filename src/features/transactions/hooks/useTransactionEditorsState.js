import { useRef, useState } from "react";

export function useTransactionEditorsState() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [editingCartItemIndex, setEditingCartItemIndex] = useState(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [activeSplitMethod, setActiveSplitMethod] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const extrasGroupsPromiseRef = useRef(null);
  const [note, setNote] = useState("");

  const [isDebtSaving, setIsDebtSaving] = useState(false);
  const [debtForm, setDebtForm] = useState({ name: "", phone: "" });
  const [debtError, setDebtError] = useState("");
  const [debtSearch, setDebtSearch] = useState("");
  const [debtSearchResults, setDebtSearchResults] = useState([]);
  const [debtSearchLoading, setDebtSearchLoading] = useState(false);
  const [debtLookupLoading, setDebtLookupLoading] = useState(false);

  return {
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    editingCartItemIndex,
    setEditingCartItemIndex,
    isSplitMode,
    setIsSplitMode,
    activeSplitMethod,
    setActiveSplitMethod,
    selectedProduct,
    setSelectedProduct,
    selectedExtras,
    setSelectedExtras,
    extrasGroups,
    setExtrasGroups,
    extrasGroupsPromiseRef,
    note,
    setNote,
    isDebtSaving,
    setIsDebtSaving,
    debtForm,
    setDebtForm,
    debtError,
    setDebtError,
    debtSearch,
    setDebtSearch,
    debtSearchResults,
    setDebtSearchResults,
    debtSearchLoading,
    setDebtSearchLoading,
    debtLookupLoading,
    setDebtLookupLoading,
  };
}

