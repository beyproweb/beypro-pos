import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n'; 
import i18n from 'i18next';
import { StockProvider } from './context/StockContext';
import AppearanceProvider from './components/AppearanceProvider';
import secureFetch from "./utils/secureFetch";
import {
  DEFAULT_LANGUAGE,
  ensureDefaultLanguage,
  normalizeLanguageCode,
  persistLanguage,
  resolvePreferredLanguage,
} from "./utils/language";

ensureDefaultLanguage();

secureFetch('/settings/localization')
  .then(data => {
    const lang = resolvePreferredLanguage({
      storage: localStorage,
      preferred: normalizeLanguageCode(data?.language),
    });
    persistLanguage(lang, localStorage);
    return i18n.changeLanguage(lang);
  })
  .catch(err => {
    const fallback = resolvePreferredLanguage({
      storage: localStorage,
      fallback: DEFAULT_LANGUAGE,
    });
    persistLanguage(fallback, localStorage);
    i18n.changeLanguage(fallback);
    console.warn("⚠️ Could not load language, defaulting:", err);
  })
  .finally(() => {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
      <HashRouter>
  <StockProvider>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StockProvider>
</HashRouter>

      </React.StrictMode>
    );
  });
