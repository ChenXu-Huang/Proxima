import { isProxyConfig, type ProxyConfig } from './proxy/model';

const DRAFT_KEY = 'proxima.draft.v1';

interface StoredDraft {
  v: 1;
  savedAt: number;
  model: ProxyConfig;
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readDraft(): ProxyConfig | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.v !== 1 || !isProxyConfig(parsed.model)) {
      storage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed.model;
  } catch {
    try {
      storage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore quota/security errors.
    }
    return null;
  }
}

export function writeDraft(config: ProxyConfig): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const value: StoredDraft = { v: 1, savedAt: Date.now(), model: config };
    storage.setItem(DRAFT_KEY, JSON.stringify(value));
  } catch {
    // Draft persistence is best-effort; the in-memory form still works.
  }
}

export function clearDraft(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore quota/security errors.
  }
}
