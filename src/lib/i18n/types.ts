import type enMessages from '../../../public/_locales/en/messages.json';

/**
 * All user-visible strings are keyed by the English catalog. `import type`
 * keeps the catalog out of the bundle; it only provides compile-time keys.
 */
export type MessageKey = keyof typeof enMessages;

/**
 * v1 ships exactly these two catalogs. Adding a language means adding a
 * `public/_locales/<lang>/messages.json` and one entry here; components never
 * change because they only depend on `I18n`.
 */
export type SupportedLocale = 'en' | 'zh-CN';

export interface I18n {
  readonly locale: SupportedLocale;
  t(key: MessageKey, substitutions?: string[]): string;
}
