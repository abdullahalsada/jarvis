import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import tr from './locales/tr.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';
import hi from './locales/hi.json';
import id from './locales/id.json';

/**
 * Adding a language = drop a JSON file here and register it below.
 * RTL languages must also be listed in RTL_LANGUAGES.
 */
export const resources = {
  en: { translation: en },
  ar: { translation: ar },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  tr: { translation: tr },
  ru: { translation: ru },
  ja: { translation: ja },
  ko: { translation: ko },
  zh: { translation: zh },
  hi: { translation: hi },
  id: { translation: id },
} as const;

export type Language = keyof typeof resources;

/** Shown in each language's own name so anyone can find theirs. */
export const LANGUAGES: { code: Language; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'tr', nativeName: 'Türkçe' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'zh', nativeName: '中文' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'id', nativeName: 'Bahasa Indonesia' },
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
