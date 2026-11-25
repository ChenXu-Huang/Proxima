import type { I18n, MessageKey, SupportedLocale } from './types';

interface BrowserI18n {
  getUILanguage?(): string;
  getMessage?(key: string, substitutions?: string[]): string;
}

function getI18nApi(): BrowserI18n | null {
  const scope = globalThis as {
    browser?: { i18n?: BrowserI18n };
    chrome?: { i18n?: BrowserI18n };
  };
  return scope.browser?.i18n ?? scope.chrome?.i18n ?? null;
}

/**
 * Collapse the browser UI language to one of the v1 catalogs. The actual
 * selection is left to `browser.i18n`; this value is used for `<html lang>`
 * and for future locale-aware UI.
 */
export function normalizeLocale(language: string | undefined): SupportedLocale {
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

/**
 * The only place in the app that touches `browser.i18n` / `chrome.i18n`.
 * Components receive this through the `I18nProvider` context.
 */
export function createBrowserI18n(): I18n {
  const api = getI18nApi();
  const uiLanguage = api?.getUILanguage?.() ?? 'en';
  let locale = normalizeLocale(uiLanguage);

  // The `uiLocale` sentinel tells us which catalog the browser actually chose,
  // which is more reliable than the UI language when zh-TW falls back to en.
  const sentinel = api?.getMessage?.('uiLocale');
  if (sentinel === 'en' || sentinel === 'zh-CN') {
    locale = sentinel;
  }

  return {
    locale,
    t(key: MessageKey, substitutions?: string[]): string {
      const message = api?.getMessage?.(key, substitutions);
      if (message) {
        return message;
      }
      if (import.meta.env.DEV) {
        console.warn(`[i18n] missing message: ${key}`);
      }
      return key;
    },
  };
}
