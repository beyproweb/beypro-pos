import { useCallback, useEffect, useRef } from "react";

export const useTxNavigation = ({ navigate, location, debugLog }) => {
  const navTimeoutsRef = useRef([]);

  const debugNavigate = useCallback(
    (to, options) => {
      if (typeof debugLog === "function") {
        debugLog("debugNavigate", {
          from: `${location.pathname}${location.search}`,
          to,
          options: options || null,
        });
      }
      if (
        typeof to === "string" &&
        (to.startsWith("/tableoverview") || to.startsWith("/orders"))
      ) {
        console.log("[TX_NAV]", {
          from: `${location.pathname}${location.search}`,
          to,
          options: options || null,
          mounted: true,
          now: new Date().toISOString(),
        });
      }
      navigate(to, options);
    },
    [debugLog, location.pathname, location.search, navigate]
  );

  const scheduleNavigate = useCallback(
    (to, delayMs, options) => {
      const id = window.setTimeout(() => debugNavigate(to, options), delayMs);
      navTimeoutsRef.current.push(id);
      return id;
    },
    [debugNavigate]
  );

  useEffect(() => {
    return () => {
      navTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      navTimeoutsRef.current = [];
    };
  }, []);

  return {
    debugNavigate,
    scheduleNavigate,
  };
};
