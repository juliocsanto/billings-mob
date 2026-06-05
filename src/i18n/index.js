/**
 * i18n configuration — ADR-014
 *
 * Locales: pt-BR (default/fallback) and en.
 * Detection order: localStorage key 'billings_locale', then navigator.language.
 * Single namespace: 'translation'.
 *
 * Clinical constraint (ADR-014 §7):
 *   Translation VALUES must never contain fertility classifications.
 *   Stamp domain IDs (sangramento/seco/muco/apice) appear only as JSON keys.
 *
 * LGPD constraint:
 *   Fields 'relations' and 'notes' are never exposed as i18n keys.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
    },
    // Let LanguageDetector decide; fallback to pt-BR when unresolved
    lng: undefined,
    fallbackLng: 'pt-BR',
    supportedLngs: ['pt-BR', 'en'],

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'billings_locale',
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already handles XSS escaping
    },

    defaultNS: 'translation',
  });

export default i18n;
