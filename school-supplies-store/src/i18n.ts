import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import adminAr from "./locales/admin-ar.json";
import adminEn from "./locales/admin-en.json";
let saved: string | null = null;
try {
  saved = localStorage.getItem("maktabati-language");
} catch {
  /* preferences unavailable */
}
export const hasLanguagePreference = !!saved;
i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar, common: ar, admin: adminAr },
    en: { translation: en, common: en, admin: adminEn },
  },
  lng: saved === "en" ? "en" : "ar",
  ns: ["translation", "common", "admin"],
  defaultNS: "translation",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});
function syncLanguage(lang: string) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  try {
    localStorage.setItem("maktabati-language", lang);
  } catch {}
}
syncLanguage(i18n.language);
i18n.on("languageChanged", syncLanguage);
export default i18n;
