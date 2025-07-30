// src/components/NotificationBell.jsx

import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import clsx from "clsx";

export default function NotificationBell({ unread = 0, onClick }) {
  const [animate, setAnimate] = useState(false);
  const prevUnread = useRef(unread);

  // Animate bell if new notification arrives
  useEffect(() => {
    if (unread > prevUnread.current) {
      setAnimate(true);
      setTimeout(() => setAnimate(false), 1000);
    }
    prevUnread.current = unread;
  }, [unread]);

  return (
    <button
      className={clsx(
        "flex items-center justify-center",
        "bg-gradient-to-br from-white to-indigo-100 dark:from-indigo-800 dark:to-gray-900",
        "rounded-full shadow-2xl hover:scale-105 transition-all",
        "w-10 h-10 md:w-9 md:h-9 ring-2 ring-indigo-400/10"
      )}
      style={{ boxShadow: "0 8px 30px rgba(85,80,255,0.14)" }}
      onClick={onClick}
      aria-label="Show Notifications"
      type="button"
    >
      <span className={clsx("relative", animate && "animate-bounce-slow")}>
        <Bell size={28} className="text-indigo-600 dark:text-indigo-300" />
        {/* Badge */}
        {unread > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold border-2 border-white shadow">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {unread === 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        )}
      </span>
    </button>
  );
}
