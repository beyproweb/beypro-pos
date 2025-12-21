import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter, useLocation, useNavigate } from 'react-router-dom';
import App from './App';
import './index.css';

// Robust Electron detection (works even if preload didn't expose window.beypro)
const isElectron =
  (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) ||
  (typeof window !== 'undefined' && !!window.beypro) ||
  (typeof window !== 'undefined' && window.location.protocol === 'file:');

// Use hash routing in Electron so URL is file:///.../index.html#/<route>
const Router = isElectron ? HashRouter : BrowserRouter;

function HistorySync() {
  const navigate = useNavigate();
  const location = useLocation();

  const routerPathRef = React.useRef(`${location.pathname}${location.search}`);
  const lastAttemptRef = React.useRef({ path: null, at: 0 });
  const scheduledRef = React.useRef(false);

  React.useEffect(() => {
    routerPathRef.current = `${location.pathname}${location.search}`;
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    if (isElectron || typeof window === 'undefined') return undefined;

    const getBrowserPath = () => `${window.location.pathname}${window.location.search}`;

    const syncIfNeeded = () => {
      scheduledRef.current = false;

      const routerPath = routerPathRef.current;
      const browserPath = getBrowserPath();
      if (routerPath === browserPath) return;

      const lastAttempt = lastAttemptRef.current;
      const now = Date.now();
      if (lastAttempt.path === browserPath && now - lastAttempt.at < 1000) return;

      lastAttemptRef.current = { path: browserPath, at: now };
      navigate(browserPath, { replace: true });
    };

    const scheduleSync = () => {
      if (scheduledRef.current) return;
      scheduledRef.current = true;
      window.setTimeout(syncIfNeeded, 0);
    };

    window.addEventListener('beypro:historychange', scheduleSync);
    window.addEventListener('popstate', scheduleSync);
    return () => {
      window.removeEventListener('beypro:historychange', scheduleSync);
      window.removeEventListener('popstate', scheduleSync);
    };
  }, [navigate]);

  return null;
}

// In web builds, some code paths can update the URL via `history.pushState/replaceState`
// without going through React Router, which prevents route content from updating.
// Emit a custom event for those changes; a small in-router sync hook will reconcile.
if (!isElectron && typeof window !== 'undefined') {
  const key = '__beyproHistoryShimInstalled';
  if (!window[key]) {
    window[key] = true;

    const wrap = (methodName) => {
      const original = window.history[methodName];
      if (typeof original !== 'function') return;
      window.history[methodName] = function (...args) {
        const before = window.location.href;
        const result = original.apply(this, args);
        const after = window.location.href;
        if (before !== after) {
          queueMicrotask(() => window.dispatchEvent(new Event('beypro:historychange')));
        }
        return result;
      };
    };

    wrap('pushState');
    wrap('replaceState');
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router basename={isElectron ? undefined : "/"}>
      <HistorySync />
      <App />
    </Router>
  </React.StrictMode>
);
