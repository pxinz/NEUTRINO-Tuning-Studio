import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '../lib/types';
import en from './en';
import zh from './zh';
import ja from './ja';

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
  ja: { translation: ja },
};

export function resolveLanguage(setting: Language, locale = navigator.language): 'en' | 'zh' | 'ja' {
  if (setting === 'en' || setting === 'zh' || setting === 'ja') return setting;
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('ja')) return 'ja';
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage('auto'),
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLanguage(language: 'en' | 'zh' | 'ja') {
  if (i18n.language !== language) void i18n.changeLanguage(language);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja' : 'en';
}

export default i18n;
