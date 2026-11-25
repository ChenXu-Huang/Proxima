import { describe, expect, it } from 'vitest';
import { clearDraft, readDraft, writeDraft } from '../src/lib/draft';
import { createEmptyManual, type ProxyConfig } from '../src/lib/proxy/model';

const KEY = 'proxima.draft.v1';

const config: ProxyConfig = {
  mode: 'manual',
  manual: {
    ...createEmptyManual(),
    http: { host: '127.0.0.1', port: '7890' },
    bypass: ['localhost'],
  },
};

describe('draft storage', () => {
  it('round-trips a draft', () => {
    writeDraft(config);
    expect(readDraft()).toEqual(config);
  });

  it('clears malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('rejects and removes an unknown schema version', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, model: config }));
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('rejects an invalid model', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, model: { mode: 'manual' } }));
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clears drafts explicitly', () => {
    writeDraft(config);
    clearDraft();
    expect(readDraft()).toBeNull();
  });
});
