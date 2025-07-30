import React from "react";

export default function SectionFadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div style={{ animationDelay: `${delay}ms` }} className="animate-fadeInUp">
      {children}
    </div>
  );
}
