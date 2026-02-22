import { memo } from "react";

const OrdersModalsHost = memo(function OrdersModalsHost({ children }) {
  return (
    <>
      {children}
      <style>{`
        @keyframes pulseGlow {
          0% { filter: brightness(1.12) blur(0.8px);} 
          100% { filter: brightness(1.24) blur(2.5px);} 
        }
      `}</style>
    </>
  );
});

export default OrdersModalsHost;
