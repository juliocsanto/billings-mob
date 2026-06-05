import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './i18n/index.js'; // initialise i18next before React mounts (ADR-014)
import App from './App.jsx';
import { AuthGate } from './components/AuthGate.tsx';
import './index.css';

/**
 * LGPD Art. 11 — campos clínicos e pessoais que NUNCA devem sair do dispositivo
 * em relatórios de erro. Este scrubber é aplicado a todos os eventos Sentry
 * antes do envio à rede.
 *
 * NC-02 auditoria ISO 27001:2022 — critério de aceitação obrigatório.
 */
const LGPD_SENSITIVE_FIELDS = [
  'relations',          // orientação clínica da instrutora — LGPD Art. 11
  'notes',              // notas livres da aluna — LGPD Art. 11
  'observacao_descricao', // descrição do sangramento — LGPD Art. 11
  'fcm_token',          // token pessoal de push
  'password',
  'token',
];

/**
 * Recursively redacts LGPD-sensitive fields from any plain object or array.
 * Returns a new object — never mutates the original.
 */
function redactLgpdFields(obj) {
  if (Array.isArray(obj)) {
    return obj.map(redactLgpdFields);
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      // Match full key or keys containing an email pattern
      const isEmail = typeof key === 'string' && key.toLowerCase().includes('email') && key !== 'error';
      if (LGPD_SENSITIVE_FIELDS.includes(key) || isEmail) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactLgpdFields(val);
      }
    }
    return out;
  }
  return obj;
}

/**
 * Sentry beforeSend scrubber — runs on every error/transaction event
 * before it leaves the browser. Redacts from:
 *   - event.request.data (POST body echoed back)
 *   - event.extra        (manual extra context)
 *   - event.contexts     (user-supplied context bags)
 *   - event.exception    (exception values / stacks carry no field data,
 *                         but sanitise for safety)
 */
function lgpdBeforeSend(event) {
  if (event.request?.data) {
    event.request.data = redactLgpdFields(event.request.data);
  }
  if (event.extra) {
    event.extra = redactLgpdFields(event.extra);
  }
  if (event.contexts) {
    event.contexts = redactLgpdFields(event.contexts);
  }
  // Strip sensitive fields from exception values (unlikely but defensive)
  if (event.exception?.values) {
    event.exception.values = redactLgpdFields(event.exception.values);
  }
  return event;
}

/**
 * Sentry beforeBreadcrumb scrubber — prevents sensitive data from accumulating
 * in the breadcrumb trail that is attached to every event.
 */
function lgpdBeforeBreadcrumb(breadcrumb) {
  if (breadcrumb.data) {
    breadcrumb.data = redactLgpdFields(breadcrumb.data);
  }
  return breadcrumb;
}

// Only initialise Sentry when the DSN is provided (production/staging).
// In local dev without VITE_SENTRY_DSN set, Sentry is a no-op.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // 10% performance trace sampling — higher rates increase cost and PII risk
    tracesSampleRate: 0.1,
    beforeSend: lgpdBeforeSend,
    beforeBreadcrumb: lgpdBeforeBreadcrumb,
  });
}

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
