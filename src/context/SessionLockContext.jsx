// src/context/SessionLockContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useSetting } from "../components/hooks/useSetting";

const SessionLockContext = createContext();

export function useSessionLock() {
  return useContext(SessionLockContext);
}

export function SessionLockProvider({ children }) {
  const { currentUser } = useAuth();
  const [isLocked, setIsLocked] = useState(() => {
    // Check if lock state persists from previous session
    try {
      return localStorage.getItem('sessionLocked') === 'true';
    } catch {
      return false;
    }
  });
  const [lockReason, setLockReason] = useState(() => {
    try {
      return localStorage.getItem('lockReason') || null;
    } catch {
      return null;
    }
  });
  const [sessionSettings, setSessionSettings] = useState({
    sessionTimeoutEnabled: false,
    sessionTimeoutMinutes: 5,
  });

  const lastActivityRef = useRef(Date.now());
  const timeoutCheckIntervalRef = useRef(null);
  const activityThrottleRef = useRef(null);

  // Load session timeout settings
  useSetting("users", (settings) => {
    if (settings) {
      setSessionSettings({
        sessionTimeoutEnabled: settings.sessionTimeoutEnabled !== false,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes || 5,
      });
    }
  }, { sessionTimeoutEnabled: false, sessionTimeoutMinutes: 5 });

  // Manual lock function
  const lock = useCallback((reason = 'manual') => {
    console.log('🔒 Locking session:', reason);
    setIsLocked(true);
    setLockReason(reason);
    
    // Store lock state in localStorage (persists across refresh)
    try {
      localStorage.setItem('sessionLocked', 'true');
      localStorage.setItem('lockReason', reason);
    } catch (err) {
      console.error('Failed to save lock state:', err);
    }
  }, []);

  // Unlock function (called after successful PIN entry)
  const unlock = useCallback(() => {
    console.log('🔓 Unlocking session');
    setIsLocked(false);
    setLockReason(null);
    lastActivityRef.current = Date.now();
    
    // Clear lock state from localStorage
    try {
      localStorage.removeItem('sessionLocked');
      localStorage.removeItem('lockReason');
    } catch (err) {
      console.error('Failed to clear lock state:', err);
    }
  }, []);

  // Track user activity (throttled)
  const trackActivity = useCallback(() => {
    if (!sessionSettings.sessionTimeoutEnabled || !currentUser) return;
    
    // Throttle to max once per second
    if (activityThrottleRef.current) return;
    
    activityThrottleRef.current = setTimeout(() => {
      activityThrottleRef.current = null;
    }, 1000);

    lastActivityRef.current = Date.now();
    console.log('👆 Activity tracked, timer reset');
  }, [sessionSettings.sessionTimeoutEnabled, currentUser]);

  // Check for timeout
  const checkTimeout = useCallback(() => {
    if (!sessionSettings.sessionTimeoutEnabled || !currentUser || isLocked) return;
    
    const timeoutMs = sessionSettings.sessionTimeoutMinutes * 60 * 1000;
    const inactiveTime = Date.now() - lastActivityRef.current;
    
    console.log(`⏱️ Timeout check: ${Math.round(inactiveTime / 1000)}s inactive, timeout at ${Math.round(timeoutMs / 1000)}s`);
    
    if (inactiveTime >= timeoutMs) {
      console.log('🔒 Auto-locking due to timeout!');
      lock('timeout');
    }
  }, [sessionSettings, currentUser, isLocked, lock]);

  // Set up activity listeners
  useEffect(() => {
    if (!sessionSettings.sessionTimeoutEnabled || !currentUser) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    events.forEach(event => {
      window.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, trackActivity);
      });
    };
  }, [sessionSettings.sessionTimeoutEnabled, currentUser, trackActivity]);

  // Set up timeout check interval
  useEffect(() => {
    if (!sessionSettings.sessionTimeoutEnabled || !currentUser) {
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current);
        timeoutCheckIntervalRef.current = null;
      }
      return;
    }

    console.log(`⏰ Setting up timeout check: ${sessionSettings.sessionTimeoutMinutes} minutes, enabled: ${sessionSettings.sessionTimeoutEnabled}`);
    
    // Check every 2 seconds (more responsive for testing)
    timeoutCheckIntervalRef.current = setInterval(checkTimeout, 2000);

    return () => {
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current);
      }
    };
  }, [sessionSettings.sessionTimeoutEnabled, currentUser, checkTimeout]);

  // Auto-unlock if user logs out
  useEffect(() => {
    if (!currentUser && isLocked) {
      unlock();
    }
  }, [currentUser, isLocked, unlock]);

  const value = {
    isLocked,
    lockReason,
    lock,
    unlock,
    sessionSettings,
  };

  return (
    <SessionLockContext.Provider value={value}>
      {children}
    </SessionLockContext.Provider>
  );
}
