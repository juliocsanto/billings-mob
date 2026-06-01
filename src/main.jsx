import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthGate } from './components/AuthGate.tsx';
import './index.css';

// PWA: when a new Service Worker activates and claims this tab via clientsClaim(),
// the virtual module triggers location.reload() so the user immediately sees
// the new bundle without having to manually refresh.
// Without this, autoUpdate + skipWaiting activates the new SW silently but the
// already-loaded JS bundle (old version) stays in the tab until the next navigation.
import { registerSW } from 'virtual:pwa-register';
registerSW({
  // Called after the new SW has taken control. Force a reload so the
  // new JS/CSS bundle is served instead of the old cached one.
  onRegisteredSW(_swUrl, _registration) {},
  onNeedRefresh() {
    // autoUpdate mode: no user prompt needed — reload immediately.
    window.location.reload();
  },
  onOfflineReady() {
    // App is cached and ready for offline use — no action needed.
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      {({ user, session }) => <App user={user} session={session} />}
    </AuthGate>
  </React.StrictMode>
);
