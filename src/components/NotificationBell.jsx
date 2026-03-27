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
        "inline-flex h-[42px] w-[42px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/95 text-slate-600 shadow-sm transition",
        "hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
        "dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
      )}
      onClick={onClick}
      aria-label="Show Notifications"
      type="button"
    >
      <span className={clsx("relative", animate && "animate-bounce-slow")}>
        <Bell size={20} className="text-current" />
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
