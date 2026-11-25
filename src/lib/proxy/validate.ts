import type { MessageKey } from '../i18n/types';
import {
  cloneConfig,
  isEndpointBlank,
  type BrowserName,
  type Endpoint,
  type ManualConfig,
  type ProxyConfig,
} from './model';

export type ValidationField =
  | 'httpHost'
  | 'httpPort'
  | 'httpsHost'
  | 'httpsPort'
  | 'socksHost'
  | 'socksPort'
  | 'bypass'
  | 'manual'
  | 'pacUrl';

export interface ValidationError {
  field: ValidationField;
  key: MessageKey;
  values?: string[];
}

export interface ValidationResult {
  errors: ValidationError[];
  value: ProxyConfig | null;
}

interface EndpointFields {
  host: ValidationField;
  port: ValidationField;
}

function normalizeHost(rawHost: string): string | null {
  const host = rawHost.trim().replace(/^\[|\]$/g, '');
  if (!host || /[\s,;/#?@]/.test(host)) {
    return null;
  }
  try {
    if (host.includes(':')) {
      const url = new URL(`http://[${host}]`);
      return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    }
    const url = new URL(`http://${host}`);
    return url.hostname ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

interface SplitHost {
  host: string;
  port?: string;
  invalid?: boolean;
}

function splitEmbeddedPort(rawHost: string): SplitHost {
  const value = rawHost.trim();
  if (!value) {
    return { host: '' };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (hasScheme || value.includes('/')) {
    try {
      const url = new URL(hasScheme ? value : `http://${value}`);
      if (url.username || url.password) {
        return { host: '', invalid: true };
      }
      return {
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
      };
    } catch {
      return { host: '', invalid: true };
    }
  }

  const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1] ?? '', port: bracketed[2] };
  }

  // A bare IPv6 literal (two or more colons) is a host, not host:port.
  if ((value.match(/:/g) ?? []).length >= 2) {
    return { host: value };
  }

  const hostAndPort = value.match(/^([^:]+):(\d+)$/);
  if (hostAndPort) {
    return { host: hostAndPort[1] ?? '', port: hostAndPort[2] };
  }

  return { host: value };
}

function normalizeEndpoint(
  hostRaw: string,
  portRaw: string,
  fields: EndpointFields,
): { endpoint: Endpoint | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const split = splitEmbeddedPort(hostRaw);

  if (split.invalid || (!split.host.trim() && !portRaw.trim())) {
    if (split.invalid) {
      errors.push({ field: fields.host, key: 'manualHostInvalid' });
    }
    return { endpoint: null, errors };
  }

  const hostInput = split.host.trim();
  const portInput = portRaw.trim() || split.port || '';

  if (!hostInput) {
    errors.push({ field: fields.host, key: 'manualHostRequired' });
  }
  if (!portInput) {
    errors.push({ field: fields.port, key: 'manualPortRequired' });
  }
  if (errors.length > 0) {
    return { endpoint: null, errors };
  }

  const host = normalizeHost(hostInput);
  if (!host) {
    errors.push({ field: fields.host, key: 'manualHostInvalid' });
  }

  const portNumber = /^\d{1,5}$/.test(portInput) ? Number(portInput) : NaN;
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    errors.push({ field: fields.port, key: 'manualPortInvalid' });
  }

  if (!host || errors.length > 0) {
    return { endpoint: null, errors };
  }

  return {
    endpoint: { host, port: String(portNumber) },
    errors,
  };
}

function normalizeBypass(entries: string[]): { value: string[]; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  const value: string[] = [];

  for (const rawEntry of entries) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    if (/[\s,]/.test(entry)) {
      errors.push({ field: 'bypass', key: 'manualBypassInvalid', values: [entry] });
      continue;
    }
    const dedupeKey = entry.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    value.push(entry);
  }

  return { value, errors };
}

function validateManual(manual: ManualConfig, _browser: BrowserName): ValidationResult {
  const http = normalizeEndpoint(manual.http?.host ?? '', manual.http?.port ?? '', {
    host: 'httpHost',
    port: 'httpPort',
  });
  const https = normalizeEndpoint(manual.https?.host ?? '', manual.https?.port ?? '', {
    host: 'httpsHost',
    port: 'httpsPort',
  });
  const socks = normalizeEndpoint(manual.socks?.host ?? '', manual.socks?.port ?? '', {
    host: 'socksHost',
    port: 'socksPort',
  });
  const bypass = normalizeBypass(manual.bypass);

  const endpointErrors = [...http.errors, ...https.errors, ...socks.errors];
  const errors = [...endpointErrors, ...bypass.errors];

  const httpEndpoint = http.endpoint;
  const httpsEndpoint = https.endpoint;
  const socksEndpoint = socks.endpoint;

  if (!httpEndpoint && !httpsEndpoint && !socksEndpoint && endpointErrors.length === 0) {
    errors.push({ field: 'manual', key: 'manualAtLeastOne' });
  }

  // A separate HTTPS proxy always wins; the leftover share flag is normalised
  // away instead of being reported as a scary error.
  const shareHttps = Boolean(httpEndpoint) && manual.shareHttps && !httpsEndpoint;

  if (errors.length > 0) {
    return { errors, value: null };
  }

  return {
    errors: [],
    value: {
      mode: 'manual',
      manual: {
        http: httpEndpoint,
        https: httpsEndpoint,
        shareHttps,
        socks: socksEndpoint,
        socksVersion: manual.socksVersion === 4 ? 4 : 5,
        proxyDns: Boolean(manual.proxyDns),
        bypass: bypass.value,
        autoLogin: Boolean(manual.autoLogin),
      },
    },
  };
}

function validatePac(pacUrl: string): ValidationResult {
  const value = pacUrl.trim();
  if (!value) {
    return { errors: [{ field: 'pacUrl', key: 'manualPacRequired' }], value: null };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { errors: [{ field: 'pacUrl', key: 'manualPacInvalid' }], value: null };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { errors: [{ field: 'pacUrl', key: 'manualPacInvalid' }], value: null };
  }
  if (url.username || url.password) {
    return { errors: [{ field: 'pacUrl', key: 'manualPacCredentials' }], value: null };
  }
  if (!url.hostname) {
    return { errors: [{ field: 'pacUrl', key: 'manualPacInvalid' }], value: null };
  }

  return {
    errors: [],
    value: { mode: 'pac', pacUrl: value },
  };
}

export function validateConfig(config: ProxyConfig, browser: BrowserName): ValidationResult {
  switch (config.mode) {
    case 'manual':
      return validateManual(config.manual, browser);
    case 'pac':
      return validatePac(config.pacUrl);
    case 'direct':
    case 'system':
    case 'autoDetect':
      return { errors: [], value: cloneConfig(config) };
  }
}

export function errorForField(
  errors: ValidationError[],
  field: ValidationField,
): ValidationError | undefined {
  return errors.find((error) => error.field === field);
}

export function firstErrorField(errors: ValidationError[]): ValidationField | undefined {
  return errors[0]?.field;
}

export function isEndpointErrorField(
  field: ValidationField,
): field is 'httpHost' | 'httpPort' | 'httpsHost' | 'httpsPort' | 'socksHost' | 'socksPort' {
  return field.endsWith('Host') || field.endsWith('Port');
}

export function manualHasAnyValue(manual: ManualConfig): boolean {
  return (
    !isEndpointBlank(manual.http) ||
    !isEndpointBlank(manual.https) ||
    !isEndpointBlank(manual.socks)
  );
}
