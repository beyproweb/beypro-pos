import React from "react";

export function WaiterHeadIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="24" cy="24" r="21" fill="url(#waiterFaceBg)" />
      <path d="M11 19c1-5.5 6.2-10 13-10s12 4.5 13 10" fill="#1f2937" />
      <path d="M16 20.5c0-4.4 3.6-8 8-8s8 3.6 8 8v3.2a8 8 0 0 1-16 0v-3.2Z" fill="#f8d8be" />
      <circle cx="20.5" cy="23.6" r="1.1" fill="#111827" />
      <circle cx="27.5" cy="23.6" r="1.1" fill="#111827" />
      <path
        d="M20.7 27.3c1.5 1.4 5.1 1.4 6.6 0"
        stroke="#b45309"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M14.8 35.2c1.8-4 5.2-6 9.2-6 4 0 7.4 2 9.2 6" fill="#f3f4f6" />
      <path d="m24 30.8-3 3.3 3 1.5 3-1.5-3-3.3Z" fill="#0f172a" />
      <path d="M18.1 13.5h11.8l-1.1 2.3H19.2l-1.1-2.3Z" fill="#e5e7eb" />
      <defs>
        <linearGradient id="waiterFaceBg" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dbeafe" />
          <stop offset="1" stopColor="#f0f9ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function WaiterMicIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="24" cy="24" r="21" fill="url(#waiterMicBg)" />
      <rect x="19.5" y="11.5" width="9" height="16" rx="4.5" fill="#0f172a" />
      <path
        d="M15.5 23.5c0 4.7 3.8 8.5 8.5 8.5s8.5-3.8 8.5-8.5"
        stroke="#0f172a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M24 32v4.2" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      <path d="M19 38h10" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      <path d="M36.6 13.4v2.8M35.2 14.8H38" stroke="#f59e0b" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M10 31.2v2.2M8.8 32.3h2.4" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="waiterMicBg" x1="9" y1="9" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef3c7" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
    </svg>
  );
}
