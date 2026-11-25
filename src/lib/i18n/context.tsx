import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import { createBrowserI18n } from './adapter';
import type { I18n } from './types';

const fallback = createBrowserI18n();

export const I18nContext = createContext<I18n>(fallback);

export interface I18nProviderProps {
  i18n: I18n;
  children: ComponentChildren;
}

export function I18nProvider({ i18n, children }: I18nProviderProps) {
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
