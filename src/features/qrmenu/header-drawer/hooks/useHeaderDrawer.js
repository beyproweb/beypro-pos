import { useCallback, useEffect, useState } from "react";

export default function useHeaderDrawer() {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const previousOverflow = document?.body?.style?.overflow;
    if (document?.body?.style) {
      document.body.style.overflow = "hidden";
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      if (document?.body?.style) {
        document.body.style.overflow = previousOverflow || "";
      }
    };
  }, [isOpen]);

  return {
    isOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}
