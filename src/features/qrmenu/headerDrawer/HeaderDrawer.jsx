import React from "react";

function HeaderDrawer({ isOpen, onClose, side = "left" }) {
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  const isLeft = side === "left";
  const sidePosition = isLeft ? "left-0" : "right-0";
  const borderSide = isLeft
    ? "border-r border-gray-200 dark:border-neutral-800"
    : "border-l border-gray-200 dark:border-neutral-800";
  const translateClass = isLeft
    ? isOpen
      ? "translate-x-0 pointer-events-auto"
      : "-translate-x-full pointer-events-none"
    : isOpen
      ? "translate-x-0 pointer-events-auto"
      : "translate-x-full pointer-events-none";

  return (
    <>
      <div
        onClick={handleBackdropClick}
        className={`fixed inset-0 z-[120] bg-black/20 transition-opacity duration-200 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 ${sidePosition} z-[121] h-full w-[min(92vw,360px)] ${borderSide} bg-white dark:bg-neutral-900 shadow-xl transition-transform duration-200 will-change-transform ${translateClass}`}
        role="dialog"
        aria-modal="true"
        aria-label="Header drawer"
      >
        <div className="h-16 border-b border-gray-100 dark:border-neutral-800 px-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="w-9 h-9 rounded-full text-gray-500 dark:text-neutral-300 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 transition"
          >
            ×
          </button>
        </div>
      </aside>
    </>
  );
}

export default React.memo(HeaderDrawer);
