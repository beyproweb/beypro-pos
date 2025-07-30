// src/components/ModernHeader.jsx

import React from "react";

export default function ModernHeader({
  title = "",
  subtitle,
  notificationBell,
  onSidebarToggle,
  userName = "Manager",
  onThemeToggle,
  tableNav,
  theme = "light",
  hasNotification = false,
  onBellClick,
  rightContent,
}) {
  return (
    <header className="sticky top-0 z-40 w-full px-6 h-16 flex items-center bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl shadow-2xl border-b border-blue-100 dark:border-zinc-800">
      {/* Left: Logo */}

      <div className="flex items-center min-w-0 flex-shrink-0">
        <span
          className="text-2xl font-extrabold tracking-tight flex items-center gap-1 select-none bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent drop-shadow-lg"
          style={{ letterSpacing: "0.03em" }}
        >
          Beypro

        </span>


      </div>

      {/* Center: Subtitle */}
  {/* Center: Welcome and Subtitle */}
<div className="flex-1 flex flex-col items-center justify-center min-w-0 px-4 gap-1">
  {userName && (
    <span className="text-lg font-bold text-blue-700 dark:text-blue-200 bg-white/70 dark:bg-zinc-800/50 rounded-xl px-4 py-1 shadow">
      👋 Welcome, {userName}
    </span>
  )}
  {subtitle && (
    <span className="text-base font-semibold text-blue-700 dark:text-blue-200 opacity-90 truncate max-w-[400px] text-center">
      {subtitle}
    </span>
  )}

</div>


      {/* Right: Title + Bell + other right content */}
      <div className="flex items-center gap-4 min-w-0 flex-shrink-0">
        {title && (
          <span className="text-xl md:text-2xl font-bold tracking-tight text-indigo-700 dark:text-violet-300 drop-shadow mr-1">
            {title}
          </span>
        )}

        {tableNav && <div className="ml-2">{tableNav}</div>}
   {rightContent && rightContent}
        {notificationBell}
      </div>
    </header>
  );
}
