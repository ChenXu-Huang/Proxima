import { endpointText, type Endpoint, type ProxyConfig } from './model';

export interface FirefoxProxyConfig {
  proxyType: 'none' | 'autoDetect' | 'system' | 'manual' | 'autoConfig';
  http?: string;
  ssl?: string;
  socks?: string;
  socksVersion?: 4 | 5;
  passthrough?: string;
  autoConfigUrl?: string;
  autoLogin?: boolean;
  proxyDNS?: boolean;
  httpProxyAll?: boolean;
}

export type FirefoxParseResult =
  { kind: 'config'; config: ProxyConfig } | { kind: 'unknown'; reason: string };

const DEFAULT_PORTS = {
  http: 80,
  ssl: 443,
  socks: 1080,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseEndpoint(value: unknown, defaultPort: number): Endpoint | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const raw = value.trim();
  let host = '';
  let port = '';

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      host = url.hostname.replace(/^\[|\]$/g, '');
      port = url.port || String(defaultPort);
    } catch {
      return null;
    }
  } else {
    const bracketed = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (bracketed) {
      host = bracketed[1] ?? '';
      port = bracketed[2] ?? String(defaultPort);
    } else {
      const lastColon = raw.lastIndexOf(':');
      const suffix = lastColon > 0 ? raw.slice(lastColon + 1) : '';
      const candidateHost = lastColon > 0 ? raw.slice(0, lastColon) : raw;
      const looksLikePort = /^\d+$/.test(suffix);
      const candidateIsIpv6 = candidateHost.includes(':');

      if (looksLikePort && (!candidateIsIpv6 || isValidIpv6(candidateHost))) {
        host = candidateHost;
        port = suffix;
      } else {
        host = raw;
        port = String(defaultPort);
      }
    }
  }

  const normalizedHost = normalizeHost(host);
  const portNumber = Number(port);
  if (!normalizedHost || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }

  return { host: normalizedHost, port: String(portNumber) };
}

function isValidIpv6(host: string): boolean {
  try {
    new URL(`http://[${host}]`);
    return true;
  } catch {
    return false;
  }
}

function normalizeHost(host: string): string | null {
  const value = host.trim().replace(/^\[|\]$/g, '');
  if (!value) return null;
  try {
    const url = new URL(value.includes(':') ? `http://[${value}]` : `http://${value}`);
    return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

function parseBypass(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const rawEntry of value.split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

export function toFirefox(config: ProxyConfig): FirefoxProxyConfig {
  switch (config.mode) {
    case 'direct':
      return { proxyType: 'none' };
    case 'system':
      return { proxyType: 'system' };
    case 'autoDetect':
      return { proxyType: 'autoDetect' };
    case 'pac':
      return { proxyType: 'autoConfig', autoConfigUrl: config.pacUrl };
    case 'manual': {
      const manual = config.manual;
      const value: FirefoxProxyConfig = {
        proxyType: 'manual',
        passthrough: manual.bypass.join(','),
        autoLogin: manual.autoLogin,
        httpProxyAll: false,
      };

      if (manual.http) {
        value.http = endpointText(manual.http);
      }

      if (manual.https) {
        value.ssl = endpointText(manual.https);
      } else if (manual.http && manual.shareHttps) {
        value.httpProxyAll = true;
      }

      if (manual.socks) {
        value.socks = endpointText(manual.socks);
        value.socksVersion = manual.socksVersion;
        value.proxyDNS = manual.proxyDns;
      }

      return value;
    }
  }
}

export function fromFirefox(value: unknown): FirefoxParseResult {
  if (!isRecord(value)) {
    return { kind: 'unknown', reason: 'invalid-value' };
  }

  const proxyType = value.proxyType ?? 'system';
  switch (proxyType) {
    case 'none':
      return { kind: 'config', config: { mode: 'direct' } };
    case 'system':
      return { kind: 'config', config: { mode: 'system' } };
    case 'autoDetect':
      return { kind: 'config', config: { mode: 'autoDetect' } };
    case 'autoConfig': {
      const pacUrl = typeof value.autoConfigUrl === 'string' ? value.autoConfigUrl.trim() : '';
      return pacUrl
        ? { kind: 'config', config: { mode: 'pac', pacUrl } }
        : { kind: 'unknown', reason: 'empty-pac-url' };
    }
    case 'manual': {
      const http = parseEndpoint(value.http, DEFAULT_PORTS.http);
      const rawSsl = parseEndpoint(value.ssl, DEFAULT_PORTS.ssl);
      const socks = parseEndpoint(value.socks, DEFAULT_PORTS.socks);

      if (value.http && !http) return { kind: 'unknown', reason: 'invalid-http-proxy' };
      if (value.ssl && !rawSsl) return { kind: 'unknown', reason: 'invalid-https-proxy' };
      if (value.socks && !socks) return { kind: 'unknown', reason: 'invalid-socks-proxy' };

      const sharesHttps = Boolean(value.httpProxyAll) && Boolean(http);
      const sslMatchesHttp = Boolean(http && rawSsl && endpointsEqual(http, rawSsl));
      const shareHttps = sharesHttps || sslMatchesHttp;
      const https = shareHttps ? null : rawSsl;

      return {
        kind: 'config',
        config: {
          mode: 'manual',
          manual: {
            http,
            https,
            shareHttps,
            socks,
            socksVersion: value.socksVersion === 4 ? 4 : 5,
            proxyDns: value.proxyDNS !== false,
            bypass: parseBypass(value.passthrough),
            autoLogin: Boolean(value.autoLogin),
          },
        },
      };
    }
    default:
      return { kind: 'unknown', reason: `unsupported-proxy-type:${String(proxyType)}` };
  }
}

export function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  return a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;
}
