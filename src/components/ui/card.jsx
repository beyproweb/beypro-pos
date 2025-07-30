// components/ui/card.js
export function Card({ children, className }) {
  return (
    <div className={`rounded-2xl shadow-md bg-white dark:bg-gray-900 ${className || ""}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }) {
  return <div className={className || ""}>{children}</div>;
}
