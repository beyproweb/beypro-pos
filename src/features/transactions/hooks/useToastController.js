import { useCallback, useEffect, useRef } from "react";

export function useToastController(setToast, duration = 3500) {
  const timeoutRef = useRef(null);

  const showToast = useCallback(
    (message) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setToast({ show: true, message });
      timeoutRef.current = setTimeout(() => {
        setToast({ show: false, message: "" });
        timeoutRef.current = null;
      }, duration);
    },
    [duration, setToast]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return showToast;
}
