import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MessageKey } from './i18n/types';
import { clearDraft, readDraft, writeDraft } from './draft';
import type { ClientSnapshot, ProxyClient } from './proxy/client';
import { ProxyError, toProxyError } from './proxy/errors';
import {
  cloneConfig,
  configsEqual,
  createDefaultConfig,
  createEmptyManual,
  type ManualConfig,
  type ProxyConfig,
  type ProxyMode,
} from './proxy/model';
import { validateConfig, type ValidationError } from './proxy/validate';

export type BlockingReason =
  | 'loading'
  | 'read-error'
  | 'unknown'
  | 'unsupported-platform'
  | 'policy'
  | 'private-browsing'
  | null;

export type ToastTone = 'success' | 'info' | 'warning';

export interface ToastState {
  id: number;
  tone: ToastTone;
  key: MessageKey;
  values?: string[];
}

interface FormCache {
  manual: ManualConfig;
  pacUrl: string;
}

export type EndpointKey = 'http' | 'https' | 'socks';
export type EndpointPart = 'host' | 'port';

export interface ProxyFormActions {
  setMode(mode: ProxyMode): void;
  setEndpoint(which: EndpointKey, part: EndpointPart, value: string): void;
  setShareHttps(value: boolean): void;
  setSocksVersion(value: 4 | 5): void;
  setProxyDns(value: boolean): void;
  setAutoLogin(value: boolean): void;
  setBypass(values: string[]): void;
  setBypassPending(value: string): void;
  setPacUrl(value: string): void;
  apply(): Promise<void>;
  refresh(): Promise<void>;
  reset(): void;
  recheckPrivate(): Promise<void>;
  dismissToast(): void;
}

export interface ProxyForm {
  browser: ProxyClient['browser'];
  snapshot: ClientSnapshot | null;
  draft: ProxyConfig;
  manual: ManualConfig;
  pacUrl: string;
  bypassPending: string;
  dirty: boolean;
  errors: ValidationError[];
  touched: boolean;
  applying: boolean;
  refreshing: boolean;
  applyError: ProxyError | null;
  blocking: BlockingReason;
  canEdit: boolean;
  canApply: boolean;
  restoredDraft: boolean;
  toast: ToastState | null;
  actions: ProxyFormActions;
}

function cloneManual(manual: ManualConfig): ManualConfig {
  return {
    http: manual.http ? { ...manual.http } : null,
    https: manual.https ? { ...manual.https } : null,
    shareHttps: manual.shareHttps,
    socks: manual.socks ? { ...manual.socks } : null,
    socksVersion: manual.socksVersion,
    proxyDns: manual.proxyDns,
    bypass: [...manual.bypass],
    autoLogin: manual.autoLogin,
  };
}

function deriveCache(configs: Array<ProxyConfig | null>): FormCache {
  let manual: ManualConfig | null = null;
  let pacUrl = '';
  for (const config of configs) {
    if (!config) continue;
    if (!manual && config.mode === 'manual') {
      manual = cloneManual(config.manual);
    }
    if (!pacUrl && config.mode === 'pac') {
      pacUrl = config.pacUrl;
    }
  }
  return {
    manual: manual ?? createEmptyManual(),
    pacUrl,
  };
}

function isErrorVisibleBeforeSubmit(error: ValidationError, draft: ProxyConfig): boolean {
  if (error.field === 'manual') return false;
  if (error.field === 'bypass') return true;
  if (error.field === 'pacUrl') {
    return draft.mode === 'pac' && draft.pacUrl.trim().length > 0;
  }
  if (draft.mode !== 'manual') return false;

  const manual = draft.manual;
  switch (error.field) {
    case 'httpHost':
    case 'httpPort':
      return Boolean(manual.http?.host.trim() || manual.http?.port.trim());
    case 'httpsHost':
    case 'httpsPort':
      return Boolean(manual.https?.host.trim() || manual.https?.port.trim());
    case 'socksHost':
    case 'socksPort':
      return Boolean(manual.socks?.host.trim() || manual.socks?.port.trim());
    default:
      return true;
  }
}

function errorSnapshot(error: unknown): ClientSnapshot {
  const message = error instanceof Error && error.message ? error.message : 'Unknown proxy error';
  return {
    config: null,
    unknownReason: 'read-error',
    level: null,
    privateAllowed: null,
    platform: 'unknown',
    raw: undefined,
    readError: new ProxyError('read-failed', message, message),
  };
}

export function useProxyForm(client: ProxyClient): ProxyForm {
  const [snapshot, setSnapshot] = useState<ClientSnapshot | null>(null);
  const [draft, setDraft] = useState<ProxyConfig>(createDefaultConfig);
  const [cache, setCache] = useState<FormCache>(() => ({
    manual: createEmptyManual(),
    pacUrl: '',
  }));
  const [touched, setTouched] = useState(false);
  const [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [applyError, setApplyError] = useState<ProxyError | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [bypassPending, setBypassPendingValue] = useState('');

  const mounted = useRef(true);
  const toastId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const next = await client.load();
        if (cancelled || !mounted.current) return;
        setSnapshot(next);

        if (next.config) {
          const stored = readDraft();
          let initialDraft = cloneConfig(next.config);
          let restored = false;
          if (stored && !configsEqual(stored, next.config)) {
            initialDraft = stored;
            restored = true;
          }
          setDraft(initialDraft);
          setCache(deriveCache([initialDraft, next.config]));
          setRestoredDraft(restored);
          if (!restored) {
            clearDraft();
          }
        }
      } catch (error) {
        if (cancelled || !mounted.current) return;
        setSnapshot(errorSnapshot(error));
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [client]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const hasPendingBypass = draft.mode === 'manual' && bypassPending.trim().length > 0;
  const dirty = Boolean(
    snapshot?.config && (hasPendingBypass || !configsEqual(draft, snapshot.config)),
  );

  const validation = useMemo(() => validateConfig(draft, client.browser), [draft, client.browser]);
  const errors = touched
    ? validation.errors
    : validation.errors.filter((error) => isErrorVisibleBeforeSubmit(error, draft));

  const manual = draft.mode === 'manual' ? draft.manual : cache.manual;
  const pacUrl = draft.mode === 'pac' ? draft.pacUrl : cache.pacUrl;

  let blocking: BlockingReason = null;
  if (!snapshot) {
    blocking = 'loading';
  } else if (snapshot.platform === 'android') {
    blocking = 'unsupported-platform';
  } else if (snapshot.readError) {
    blocking = 'read-error';
  } else if (!snapshot.config) {
    blocking = 'unknown';
  } else if (snapshot.level === 'not_controllable') {
    blocking = 'policy';
  } else if (snapshot.privateAllowed === false) {
    blocking = 'private-browsing';
  }

  const canEdit =
    Boolean(snapshot?.config) &&
    !applying &&
    !refreshing &&
    (blocking === null || blocking === 'private-browsing');
  const canApply = canEdit && blocking !== 'private-browsing' && blocking !== 'policy';

  function showToast(tone: ToastTone, key: MessageKey, values?: string[]): void {
    toastId.current += 1;
    setToast({ id: toastId.current, tone, key, values });
  }

  function commit(next: ProxyConfig): void {
    setDraft(next);
    setApplyError(null);
    writeDraft(next);
    if (next.mode === 'manual') {
      setCache((previous) => ({ ...previous, manual: cloneManual(next.manual) }));
    } else if (next.mode === 'pac') {
      setCache((previous) => ({ ...previous, pacUrl: next.pacUrl }));
    }
  }

  function setMode(mode: ProxyMode): void {
    if (!snapshot?.config || mode === draft.mode) return;
    setBypassPendingValue('');
    if (mode === 'manual') {
      commit({ mode: 'manual', manual: cloneManual(cache.manual) });
      return;
    }
    if (mode === 'pac') {
      commit({ mode: 'pac', pacUrl: cache.pacUrl });
      return;
    }
    commit({ mode });
  }

  function setEndpoint(which: EndpointKey, part: EndpointPart, value: string): void {
    const current = cache.manual;
    const existing = current[which] ?? { host: '', port: '' };
    const updated = { ...existing, [part]: value };
    const isBlank = !updated.host.trim() && !updated.port.trim();
    const nextEndpoint = isBlank ? null : updated;

    const nextManual: ManualConfig = { ...cloneManual(current), [which]: nextEndpoint };

    if (which === 'https') {
      if (nextEndpoint) nextManual.shareHttps = false;
    } else if (which === 'http') {
      const wasBlank = !existing.host.trim() && !existing.port.trim();
      if (!nextEndpoint) {
        nextManual.shareHttps = false;
      } else if (wasBlank && !nextManual.https) {
        nextManual.shareHttps = true;
      }
    }

    commit({ mode: 'manual', manual: nextManual });
  }

  function setShareHttps(value: boolean): void {
    const current = cache.manual;
    const next: ManualConfig = {
      ...cloneManual(current),
      shareHttps: value && Boolean(current.http) && !current.https,
    };
    commit({ mode: 'manual', manual: next });
  }

  function setSocksVersion(value: 4 | 5): void {
    commit({
      mode: 'manual',
      manual: { ...cloneManual(cache.manual), socksVersion: value },
    });
  }

  function setProxyDns(value: boolean): void {
    commit({
      mode: 'manual',
      manual: { ...cloneManual(cache.manual), proxyDns: value },
    });
  }

  function setAutoLogin(value: boolean): void {
    commit({
      mode: 'manual',
      manual: { ...cloneManual(cache.manual), autoLogin: value },
    });
  }

  function setBypass(values: string[]): void {
    commit({
      mode: 'manual',
      manual: { ...cloneManual(cache.manual), bypass: [...values] },
    });
  }

  function setBypassPending(value: string): void {
    setBypassPendingValue(value);
    setApplyError(null);
  }

  function setPacUrl(value: string): void {
    commit({ mode: 'pac', pacUrl: value });
  }

  async function apply(): Promise<void> {
    if (!snapshot?.config || !canApply) return;

    setTouched(true);
    const pendingBypass = bypassPending.trim();
    const candidate: ProxyConfig =
      draft.mode === 'manual' && pendingBypass
        ? {
            mode: 'manual',
            manual: {
              ...cloneManual(draft.manual),
              bypass: [...draft.manual.bypass, pendingBypass],
            },
          }
        : draft;
    const result = validateConfig(candidate, client.browser);
    if (result.errors.length > 0 || !result.value) {
      return;
    }

    const normalized = result.value;
    setApplying(true);
    setApplyError(null);

    try {
      const next = await client.apply(normalized);
      if (!mounted.current) return;

      setSnapshot(next);
      const finalConfig = next.config ?? normalized;
      setDraft(cloneConfig(finalConfig));
      setCache((previous) => ({
        manual: finalConfig.mode === 'manual' ? cloneManual(finalConfig.manual) : previous.manual,
        pacUrl: finalConfig.mode === 'pac' ? finalConfig.pacUrl : previous.pacUrl,
      }));
      clearDraft();
      setRestoredDraft(false);
      setTouched(false);
      setBypassPendingValue('');

      if (next.readError) {
        showToast('warning', 'statusApplyUnverified');
      } else if (
        next.level === 'controlled_by_other_extensions' ||
        next.level === 'not_controllable'
      ) {
        showToast('warning', 'statusApplyWarning');
      } else {
        showToast('success', 'statusApplySuccess');
      }
    } catch (error) {
      if (!mounted.current) return;
      const proxyError = error instanceof ProxyError ? error : toProxyError(error);
      setApplyError(proxyError);
      if (proxyError.code === 'private-browsing') {
        setSnapshot((previous) => (previous ? { ...previous, privateAllowed: false } : previous));
      } else if (proxyError.code === 'policy') {
        setSnapshot((previous) =>
          previous ? { ...previous, level: 'not_controllable' } : previous,
        );
      }
    } finally {
      if (mounted.current) {
        setApplying(false);
      }
    }
  }

  async function refresh(): Promise<void> {
    if (applying || refreshing) return;
    setRefreshing(true);
    try {
      const next = await client.load();
      if (!mounted.current) return;
      setSnapshot(next);

      if (next.config) {
        const keepDraft =
          hasPendingBypass ||
          (snapshot?.config
            ? !configsEqual(draft, snapshot.config)
            : !configsEqual(draft, next.config));

        if (!keepDraft) {
          setDraft(cloneConfig(next.config));
          setCache(deriveCache([next.config]));
          setRestoredDraft(false);
          setBypassPendingValue('');
          clearDraft();
        }
      }

      if (next.config) {
        showToast('info', 'statusRefreshed');
      }
    } finally {
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }

  async function recheckPrivate(): Promise<void> {
    if (applying || refreshing) return;
    setRefreshing(true);
    try {
      const next = await client.load();
      if (!mounted.current) return;
      setSnapshot(next);

      if (
        next.config &&
        !hasPendingBypass &&
        (!snapshot?.config || configsEqual(draft, snapshot.config))
      ) {
        setDraft(cloneConfig(next.config));
        setCache(deriveCache([next.config]));
        setRestoredDraft(false);
        clearDraft();
      }

      if (next.privateAllowed === true) {
        showToast('success', 'statusPrivateGateGranted');
      } else {
        showToast('warning', 'statusPrivateGateStill');
      }
    } finally {
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }

  function reset(): void {
    if (!snapshot?.config) return;
    setDraft(cloneConfig(snapshot.config));
    setCache(deriveCache([snapshot.config]));
    clearDraft();
    setTouched(false);
    setApplyError(null);
    setRestoredDraft(false);
    setBypassPendingValue('');
    showToast('info', 'statusResetDone');
  }

  function dismissToast(): void {
    setToast(null);
  }

  return {
    browser: client.browser,
    snapshot,
    draft,
    manual,
    pacUrl,
    bypassPending,
    dirty,
    errors,
    touched,
    applying,
    refreshing,
    applyError,
    blocking,
    canEdit,
    canApply,
    restoredDraft,
    toast,
    actions: {
      setMode,
      setEndpoint,
      setShareHttps,
      setSocksVersion,
      setProxyDns,
      setAutoLogin,
      setBypass,
      setBypassPending,
      setPacUrl,
      apply,
      refresh,
      reset,
      recheckPrivate,
      dismissToast,
    },
  };
}
