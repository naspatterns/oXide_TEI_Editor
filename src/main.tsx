import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Apply saved theme preference (with Private Mode fallback)
try {
  const savedTheme = localStorage.getItem('tei-editor-theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch {
  // localStorage unavailable (Private Mode) — use system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for offline support — production builds only.
// In dev, public/sw.js is served verbatim (unstamped cache name) and its
// cache-first strategy keeps serving STALE module responses across code
// changes, which breaks both HMR-adjacent workflows and manual testing.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration failed — not critical
    });
  });
}
