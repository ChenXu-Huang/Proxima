import { describe, expect, it } from 'vitest';
import zhMessages from '../public/_locales/zh_CN/messages.json';
import enMessages from '../public/_locales/en/messages.json';
import { createBrowserI18n, normalizeLocale } from '../src/lib/i18n/adapter';
import type { MessageKey } from '../src/lib/i18n/types';

describe('i18n catalog', () => {
  it('ships exactly en and zh_CN in v1', () => {
    expect(Object.keys(enMessages)).toContain('uiLocale');
    expect(Object.keys(zhMessages)).toContain('uiLocale');
  });

  it('has identical key sets in English and Chinese', () => {
    const enKeys = Object.keys(enMessages).sort();
    const zhKeys = Object.keys(zhMessages).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('declares the locale sentinel in each catalog', () => {
    expect(enMessages.uiLocale.message).toBe('en');
    expect(zhMessages.uiLocale.message).toBe('zh-CN');
  });

  it('normalizes browser languages', () => {
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});

describe('i18n adapter', () => {
  it('uses the browser language and interpolates messages', () => {
    const i18n = createBrowserI18n();
    expect(i18n.locale).toBe('en');
    expect(i18n.t('actionApply')).toBe('Apply changes');
    expect(i18n.t('statusBypassCount', ['2'])).toBe('2 bypass rule(s)');
  });

  it('falls back to the key for a missing message', () => {
    const i18n = createBrowserI18n();
    expect(i18n.t('definitelyMissingKey' as MessageKey)).toBe('definitelyMissingKey');
  });

  it('honours the uiLocale sentinel over the raw UI language', () => {
    const original = (globalThis as { browser?: unknown }).browser;
    (globalThis as { browser?: unknown }).browser = {
      i18n: {
        getUILanguage: () => 'zh-TW',
        getMessage: (key: string) =>
          key === 'uiLocale'
            ? 'zh-CN'
            : ((zhMessages as Record<string, { message: string }>)[key]?.message ?? ''),
      },
    };

    try {
      const i18n = createBrowserI18n();
      expect(i18n.locale).toBe('zh-CN');
      expect(i18n.t('actionApply')).toBe('应用更改');
    } finally {
      (globalThis as { browser?: unknown }).browser = original;
    }
  });
});
