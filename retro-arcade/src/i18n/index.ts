import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import ar from './locales/ar.json';

/**
 * Adding a language = drop a JSON file here and register it below.
 * RTL languages must also be listed in RTL_LANGUAGES.
 */
export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

export type Language = keyof typeof resources;

export const LANGUAGES: { code: Language; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'ar', nativeName: 'العربية' },
];

const RTL_LANGUAGES: Language[] = ['ar'];

const STORAGE_KEY = 'retroarcade.language';

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang as Language);
}

/** Returns the stored language, or null on first run (language screen is shown). */
export async function getStoredLanguage(): Promise<Language | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored && stored in resources) return stored as Language;
  return null;
}

export function deviceLanguage(): Language {
  const device = getLocales()[0]?.languageCode ?? 'en';
  return (device in resources ? device : 'en') as Language;
}

export async function initI18n(lang: Language): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

/**
 * Switches language and mirrors the layout for RTL. React Native applies a
 * direction change only after restart, so callers must show the "restart
 * needed" notice when the return value is true.
 */
export async function setLanguage(lang: Language): Promise<{ needsRestart: boolean }> {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  const wantRTL = isRTL(lang);
  // !! guards platforms where isRTL is undefined (react-native-web),
  // which otherwise reports a phantom "restart needed" for LTR languages.
  const needsRestart = !!I18nManager.isRTL !== wantRTL;
  if (needsRestart) {
    I18nManager.allowRTL(wantRTL);
    I18nManager.forceRTL(wantRTL);
  }
  return { needsRestart };
}

export default i18n;
