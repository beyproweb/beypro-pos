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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router basename={isElectron ? undefined : "/"}>
      <App />
    </Router>
  </React.StrictMode>
);
