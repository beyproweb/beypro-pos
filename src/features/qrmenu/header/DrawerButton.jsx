import React from "react";
import { Menu } from "lucide-react";

function DrawerButton({ onClick, isDark = false, isOpen = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation drawer"
      aria-expanded={isOpen}
      className={`h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-xl border flex items-center justify-center transition-all duration-200 ${
        isDark
          ? "bg-white/[0.06] text-white/90 border-white/12 hover:bg-white/[0.12]"
          : "bg-white/95 text-gray-700 border-gray-200 hover:bg-white hover:text-gray-900"
      }`}
    >
      <Menu className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
    </button>
  );
}

export default React.memo(DrawerButton);
