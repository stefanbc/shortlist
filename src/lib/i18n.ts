import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import ro from '@/locales/ro.json'

export const resources = {
  en: { translation: en },
  ro: { translation: ro },
} as const

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: (typeof resources)['en']
  }
}

// The active language is driven by the preferences store (see usePreferencesEffect);
// 'en' is only the initial value before that effect runs.
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'ro'],
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n
