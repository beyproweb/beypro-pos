import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n'; // i18n config
import i18n from 'i18next';
import { StockProvider } from './context/StockContext';
import AppearanceProvider from './components/AppearanceProvider';

fetch("/api/settings/localization") // ✅ USE PROXY `/api` for backend in Vite
  .then(res => res.json())
  .then(data => {
    const lang = data.language || "English";
    return i18n.changeLanguage(lang);
  })
  .catch(err => {
    console.warn("⚠️ Could not load language, defaulting to English:", err);
  })
  .finally(() => {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <StockProvider>
          <BrowserRouter>
            <AppearanceProvider>
              <App />
            </AppearanceProvider>
          </BrowserRouter>
        </StockProvider>
      </React.StrictMode>
    );
  });
