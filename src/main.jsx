import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Robust Electron detection (works even if preload didn't expose window.beypro)
const isElectron =
  (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) ||
  (typeof window !== 'undefined' && !!window.beypro) ||
  (typeof window !== 'undefined' && window.location.protocol === 'file:');

// Use hash routing in Electron so URL is file:///.../index.html#/<route>
const Router = isElectron ? HashRouter : BrowserRouter;

// In web builds, some code paths can update the URL via `history.pushState/replaceState`
// without going through React Router, which prevents route content from updating.
// This shim makes those updates observable to React Router by emitting a `popstate`.
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
          queueMicrotask(() => {
            try {
              window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
            } catch {
              window.dispatchEvent(new Event('popstate'));
            }
          });
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
      <App />
    </Router>
  </React.StrictMode>
);
