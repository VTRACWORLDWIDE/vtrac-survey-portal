import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await registration.update();
      await cacheCurrentAppShell();
    } catch {
      // Offline mode is a best-effort enhancement; the survey still works online.
    }
  });
}

async function cacheCurrentAppShell() {
  if (!window.caches) return;
  const cache = await window.caches.open('vtrac-survey-app-v1');
  const assetUrls = [
    '/',
    window.location.pathname,
    '/manifest.webmanifest',
    '/vtrac-logo.jpg',
    ...Array.from(document.querySelectorAll('script[src], link[rel="stylesheet"][href]'))
      .map((element) => element.src || element.href)
      .filter(Boolean)
  ];
  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
}
