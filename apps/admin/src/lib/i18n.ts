import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from '../locales/pt/common.json';
import en from '../locales/en/common.json';
import fr from '../locales/fr/common.json';
import es from '../locales/es/common.json';

void i18n.use(initReactI18next).init({
  resources: {
    pt: { common: pt },
    en: { common: en },
    fr: { common: fr },
    es: { common: es },
  },
  lng: 'pt',
  fallbackLng: 'pt',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
