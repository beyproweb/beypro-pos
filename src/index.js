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

secureFetch('/settings/localization')
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
          <HashRouter>
            <AppearanceProvider>
              <App />
            </AppearanceProvider>
          </HashRouter>
        </StockProvider>
      </React.StrictMode>
    );
  });
