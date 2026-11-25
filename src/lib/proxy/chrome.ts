import { endpointText, type Endpoint, type ProxyConfig } from './model';

type ChromeScheme = 'http' | 'https' | 'socks4' | 'socks5' | 'quic';
type ChromeMode = 'direct' | 'auto_detect' | 'pac_script' | 'fixed_servers' | 'system';

export interface ChromeProxyServer {
  scheme?: ChromeScheme;
  host: string;
  port?: number;
}

export interface ChromeProxyRules {
  singleProxy?: ChromeProxyServer;
  proxyForHttp?: ChromeProxyServer;
  proxyForHttps?: ChromeProxyServer;
  proxyForFtp?: ChromeProxyServer;
  fallbackProxy?: ChromeProxyServer;
  bypassList?: string[];
}

export interface ChromeProxyConfig {
  mode: ChromeMode;
  rules?: ChromeProxyRules;
  pacScript?: {
    url?: string;
    data?: string;
    mandatory?: boolean;
  };
}

export type ChromeParseResult =
  { kind: 'config'; config: ProxyConfig } | { kind: 'unknown'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function serverToEndpoint(server: ChromeProxyServer, fallbackPort: number): Endpoint | null {
  if (typeof server.host !== 'string' || !server.host.trim()) {
    return null;
  }
  const port = server.port ?? fallbackPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return {
    host: server.host
      .trim()
      .replace(/^\[|\]$/g, '')
      .toLowerCase(),
    port: String(port),
  };
}

function parseServer(value: unknown): { endpoint: Endpoint; scheme: ChromeScheme } | null {
  if (!isRecord(value)) return null;
  const scheme = typeof value.scheme === 'string' ? (value.scheme as ChromeScheme) : 'http';
  if (!['http', 'https', 'socks4', 'socks5', 'quic'].includes(scheme)) {
    return null;
  }
  const fallbackPort = scheme.startsWith('socks') ? 1080 : 80;
  const endpoint = serverToEndpoint(value as unknown as ChromeProxyServer, fallbackPort);
  if (!endpoint) return null;
  return { endpoint, scheme };
}

function endpointServer(
  endpoint: Endpoint,
  scheme: 'http' | 'socks4' | 'socks5',
): ChromeProxyServer {
  return {
    scheme,
    host: endpoint.host,
    port: Number(endpoint.port),
  };
}

function parseBypassList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const rawEntry of value) {
    if (typeof rawEntry !== 'string') continue;
    const entry = rawEntry.trim();
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

export function toChrome(config: ProxyConfig): ChromeProxyConfig {
  switch (config.mode) {
    case 'direct':
      return { mode: 'direct' };
    case 'system':
      return { mode: 'system' };
    case 'autoDetect':
      return { mode: 'auto_detect' };
    case 'pac':
      return {
        mode: 'pac_script',
        pacScript: { url: config.pacUrl, mandatory: false },
      };
    case 'manual': {
      const manual = config.manual;
      const rules: ChromeProxyRules = {};
      if (manual.bypass.length > 0) {
        rules.bypassList = [...manual.bypass];
      }

      if (manual.socks && !manual.http && !manual.https) {
        rules.singleProxy = endpointServer(
          manual.socks,
          manual.socksVersion === 4 ? 'socks4' : 'socks5',
        );
        return { mode: 'fixed_servers', rules };
      }

      if (manual.http) {
        rules.proxyForHttp = endpointServer(manual.http, 'http');
      }

      const https = manual.https ?? (manual.http && manual.shareHttps ? manual.http : null);
      if (https) {
        rules.proxyForHttps = endpointServer(https, 'http');
      }

      if (manual.socks) {
        rules.fallbackProxy = endpointServer(
          manual.socks,
          manual.socksVersion === 4 ? 'socks4' : 'socks5',
        );
      }

      return { mode: 'fixed_servers', rules };
    }
  }
}

export function fromChrome(value: unknown): ChromeParseResult {
  if (!isRecord(value)) {
    return { kind: 'unknown', reason: 'invalid-value' };
  }

  const mode = value.mode;
  switch (mode) {
    case 'direct':
      return { kind: 'config', config: { mode: 'direct' } };
    case 'system':
      return { kind: 'config', config: { mode: 'system' } };
    case 'auto_detect':
      return { kind: 'config', config: { mode: 'autoDetect' } };
    case 'pac_script': {
      const pac = isRecord(value.pacScript) ? value.pacScript : null;
      const url = typeof pac?.url === 'string' ? pac.url.trim() : '';
      if (url) {
        return { kind: 'config', config: { mode: 'pac', pacUrl: url } };
      }
      return { kind: 'unknown', reason: 'inline-pac' };
    }
    case 'fixed_servers': {
      const rules = isRecord(value.rules) ? value.rules : {};
      const single = parseServer(rules.singleProxy);
      const httpServer = parseServer(rules.proxyForHttp);
      const httpsServer = parseServer(rules.proxyForHttps);
      const fallback = parseServer(rules.fallbackProxy);

      if (
        (rules.singleProxy !== undefined && !single) ||
        (rules.proxyForHttp !== undefined && !httpServer) ||
        (rules.proxyForHttps !== undefined && !httpsServer) ||
        (rules.fallbackProxy !== undefined && !fallback)
      ) {
        return { kind: 'unknown', reason: 'invalid-server' };
      }

      if (
        [single, httpServer, httpsServer, fallback].some(
          (server) => server?.scheme === 'https' || server?.scheme === 'quic',
        )
      ) {
        return { kind: 'unknown', reason: 'unsupported-scheme' };
      }

      let http: Endpoint | null = null;
      let https: Endpoint | null = null;
      let shareHttps = false;
      let socks: Endpoint | null = null;
      let socksVersion: 4 | 5 = 5;

      if (single) {
        if (single.scheme === 'socks4' || single.scheme === 'socks5') {
          socks = single.endpoint;
          socksVersion = single.scheme === 'socks4' ? 4 : 5;
        } else {
          http = single.endpoint;
          shareHttps = true;
        }
      } else {
        if (httpServer) http = httpServer.endpoint;
        if (httpsServer) https = httpsServer.endpoint;
        if (fallback) {
          if (fallback.scheme === 'socks4' || fallback.scheme === 'socks5') {
            socks = fallback.endpoint;
            socksVersion = fallback.scheme === 'socks4' ? 4 : 5;
          } else if (!http) {
            http = fallback.endpoint;
          }
        }
        if (http && https && endpointsEqual(http, https)) {
          shareHttps = true;
          https = null;
        }
      }

      return {
        kind: 'config',
        config: {
          mode: 'manual',
          manual: {
            http,
            https,
            shareHttps,
            socks,
            socksVersion,
            proxyDns: true,
            bypass: parseBypassList(rules.bypassList),
            autoLogin: false,
          },
        },
      };
    }
    default:
      return { kind: 'unknown', reason: `unsupported-mode:${String(mode)}` };
  }
}

function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  return a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;
}
