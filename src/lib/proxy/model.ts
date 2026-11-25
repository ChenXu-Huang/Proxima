export type ProxyMode = 'direct' | 'system' | 'autoDetect' | 'pac' | 'manual';

export type BrowserName = 'firefox' | 'chrome';

/** Port is kept as an editable string in the form model. */
export interface Endpoint {
  host: string;
  port: string;
}

export interface ManualConfig {
  http: Endpoint | null;
  https: Endpoint | null;
  /** Only meaningful when `http` exists and `https` is null. */
  shareHttps: boolean;
  socks: Endpoint | null;
  socksVersion: 4 | 5;
  /** Firefox only. */
  proxyDns: boolean;
  bypass: string[];
  /** Firefox only. */
  autoLogin: boolean;
}

export type ProxyConfig =
  | { mode: 'direct' }
  | { mode: 'system' }
  | { mode: 'autoDetect' }
  | { mode: 'pac'; pacUrl: string }
  | { mode: 'manual'; manual: ManualConfig };

export const PROXY_MODES: readonly ProxyMode[] = [
  'direct',
  'manual',
  'system',
  'pac',
  'autoDetect',
] as const;

export function createEmptyManual(): ManualConfig {
  return {
    http: null,
    https: null,
    shareHttps: true,
    socks: null,
    socksVersion: 5,
    proxyDns: true,
    bypass: [],
    autoLogin: false,
  };
}

export function createDefaultConfig(): ProxyConfig {
  return { mode: 'system' };
}

export function cloneConfig(config: ProxyConfig): ProxyConfig {
  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as ProxyConfig;
}

function canonicalEndpoint(endpoint: Endpoint | null): Endpoint | null {
  if (!endpoint) return null;
  return { host: endpoint.host, port: endpoint.port };
}

function canonicalManual(manual: ManualConfig): ManualConfig {
  return {
    http: canonicalEndpoint(manual.http),
    https: canonicalEndpoint(manual.https),
    shareHttps: manual.shareHttps,
    socks: canonicalEndpoint(manual.socks),
    socksVersion: manual.socksVersion,
    proxyDns: manual.proxyDns,
    bypass: [...manual.bypass],
    autoLogin: manual.autoLogin,
  };
}

function canonicalConfig(config: ProxyConfig): unknown {
  switch (config.mode) {
    case 'manual':
      return { mode: 'manual', manual: canonicalManual(config.manual) };
    case 'pac':
      return { mode: 'pac', pacUrl: config.pacUrl };
    default:
      return { mode: config.mode };
  }
}

export function configsEqual(a: ProxyConfig, b: ProxyConfig): boolean {
  return JSON.stringify(canonicalConfig(a)) === JSON.stringify(canonicalConfig(b));
}

export function isEndpoint(value: unknown): value is Endpoint {
  if (!value || typeof value !== 'object') return false;
  const endpoint = value as Partial<Endpoint>;
  return typeof endpoint.host === 'string' && typeof endpoint.port === 'string';
}

export function isManualConfig(value: unknown): value is ManualConfig {
  if (!value || typeof value !== 'object') return false;
  const manual = value as Partial<ManualConfig>;
  return (
    (manual.http === null || isEndpoint(manual.http)) &&
    (manual.https === null || isEndpoint(manual.https)) &&
    typeof manual.shareHttps === 'boolean' &&
    (manual.socks === null || isEndpoint(manual.socks)) &&
    (manual.socksVersion === 4 || manual.socksVersion === 5) &&
    typeof manual.proxyDns === 'boolean' &&
    Array.isArray(manual.bypass) &&
    manual.bypass.every((entry) => typeof entry === 'string') &&
    typeof manual.autoLogin === 'boolean'
  );
}

export function isProxyConfig(value: unknown): value is ProxyConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<ProxyConfig> & { mode?: unknown };
  switch (config.mode) {
    case 'direct':
    case 'system':
    case 'autoDetect':
      return true;
    case 'pac':
      return typeof (config as { pacUrl?: unknown }).pacUrl === 'string';
    case 'manual':
      return isManualConfig((config as { manual?: unknown }).manual);
    default:
      return false;
  }
}

export function isEndpointBlank(endpoint: Endpoint | null): boolean {
  return !endpoint || (!endpoint.host.trim() && !endpoint.port.trim());
}

export function isManualEmpty(manual: ManualConfig): boolean {
  return (
    isEndpointBlank(manual.http) && isEndpointBlank(manual.https) && isEndpointBlank(manual.socks)
  );
}

export function effectiveHttps(manual: ManualConfig): Endpoint | null {
  if (manual.https && manual.https.host.trim()) {
    return manual.https;
  }
  if (manual.http && manual.shareHttps) {
    return manual.http;
  }
  return null;
}

export function formatHost(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

export function endpointText(endpoint: Endpoint): string {
  const port = endpoint.port.trim();
  return port ? `${formatHost(endpoint.host.trim())}:${port}` : formatHost(endpoint.host.trim());
}
