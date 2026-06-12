import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/translation.json";
import it from "./locales/it/translation.json";

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        it: { translation: it },
    },
    // Cockpit sets document.documentElement.lang from the system locale
    lng: document.documentElement.lang?.split("-")[0] || "en",
    fallbackLng: "en",
    interpolation: {
        escapeValue: false, // React escapes JSX output
    },
});

export default i18n;
