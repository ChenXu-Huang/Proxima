import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import enMessages from '../public/_locales/en/messages.json';

const messages = enMessages as Record<string, { message: string }>;

(globalThis as { browser?: unknown }).browser = {
  i18n: {
    getUILanguage: () => 'en-US',
    getMessage: (key: string, substitutions?: string[]) => {
      const template = messages[key]?.message;
      if (!template) return '';
      if (!substitutions || substitutions.length === 0) return template;
      return template.replace(/\$(\d+)/g, (_match, index: string) => {
        return substitutions[Number(index) - 1] ?? '';
      });
    },
  },
};

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // Ignore environments without localStorage.
  }
});
