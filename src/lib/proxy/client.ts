import { fromChrome, toChrome } from './chrome';
import { messageOf, ProxyError, toProxyError } from './errors';
import { fromFirefox, toFirefox } from './firefox';
import type { BrowserName, ProxyConfig } from './model';

export type ControlLevel =
  | 'not_controllable'
  | 'controlled_by_other_extensions'
  | 'controllable_by_this_extension'
  | 'controlled_by_this_extension';

export type PlatformOs = 'mac' | 'win' | 'linux' | 'android' | 'cros' | 'openbsd' | 'unknown';

export interface RawProxyState {
  value: unknown;
  levelOfControl: ControlLevel | null;
}

export interface ProxyApi {
  get(): Promise<RawProxyState>;
  set(value: unknown): Promise<boolean>;
  isPrivateAllowed(): Promise<boolean | null>;
  getPlatform(): Promise<PlatformOs>;
}

export interface ClientSnapshot {
  config: ProxyConfig | null;
  unknownReason: string | null;
  level: ControlLevel | null;
  privateAllowed: boolean | null;
  platform: PlatformOs;
  raw: unknown;
  readError: ProxyError | null;
}

export interface ProxyClient {
  readonly browser: BrowserName;
  load(): Promise<ClientSnapshot>;
  apply(config: ProxyConfig): Promise<ClientSnapshot>;
}

const LEVELS: ReadonlySet<string> = new Set([
  'not_controllable',
  'controlled_by_other_extensions',
  'controllable_by_this_extension',
  'controlled_by_this_extension',
]);

const PLATFORMS: ReadonlySet<string> = new Set([
  'mac',
  'win',
  'linux',
  'android',
  'cros',
  'openbsd',
]);

function normalizeLevel(value: unknown): ControlLevel | null {
  return typeof value === 'string' && LEVELS.has(value) ? (value as ControlLevel) : null;
}

function normalizeOs(value: unknown): PlatformOs {
  return typeof value === 'string' && PLATFORMS.has(value) ? (value as PlatformOs) : 'unknown';
}

interface FirefoxBrowserLike {
  proxy: {
    settings: {
      get(details: Record<string, never>): Promise<{
        value?: unknown;
        levelOfControl?: unknown;
      }>;
      set(details: { value: unknown }): Promise<boolean | void>;
    };
  };
  extension: {
    isAllowedIncognitoAccess(): Promise<boolean>;
  };
  runtime: {
    getPlatformInfo(): Promise<{ os?: string }>;
  };
}

interface ChromeLike {
  proxy: {
    settings: {
      get(
        details: Record<string, never>,
        callback: (result: { value?: unknown; levelOfControl?: unknown }) => void,
      ): void;
      set(details: { value: unknown }, callback?: () => void): void;
    };
  };
  runtime: {
    lastError?: { message?: string };
    getPlatformInfo(callback: (info: { os?: string }) => void): void;
  };
}

function getChrome(): ChromeLike {
  const scope = globalThis as { chrome?: ChromeLike };
  if (!scope.chrome?.proxy?.settings) {
    throw new ProxyError('write-failed', 'Chrome proxy API is unavailable.');
  }
  return scope.chrome;
}

function chromeLastError(): Error | null {
  const scope = globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } };
  const message = scope.chrome?.runtime?.lastError?.message;
  return message ? new Error(message) : null;
}

function callChromeGet(): Promise<{ value?: unknown; levelOfControl?: unknown }> {
  return new Promise((resolve, reject) => {
    getChrome().proxy.settings.get({}, (result) => {
      const error = chromeLastError();
      if (error) {
        reject(error);
      } else {
        resolve(result ?? {});
      }
    });
  });
}

function callChromeSet(value: unknown): Promise<boolean> {
  return new Promise((resolve, reject) => {
    getChrome().proxy.settings.set({ value }, () => {
      const error = chromeLastError();
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
}

function callChromePlatform(): Promise<{ os?: string }> {
  return new Promise((resolve, reject) => {
    getChrome().runtime.getPlatformInfo((info) => {
      const error = chromeLastError();
      if (error) {
        reject(error);
      } else {
        resolve(info ?? {});
      }
    });
  });
}

export function createBrowserApi(browser: BrowserName): ProxyApi {
  if (browser === 'chrome') {
    return {
      async get() {
        const result = await callChromeGet();
        return {
          value: result.value,
          levelOfControl: normalizeLevel(result.levelOfControl),
        };
      },
      async set(value) {
        return callChromeSet(value);
      },
      async isPrivateAllowed() {
        return null;
      },
      async getPlatform() {
        try {
          return normalizeOs((await callChromePlatform()).os);
        } catch {
          return 'unknown';
        }
      },
    };
  }

  const scope = globalThis as { browser?: FirefoxBrowserLike };
  if (!scope.browser?.proxy?.settings) {
    throw new ProxyError('write-failed', 'Firefox proxy API is unavailable.');
  }

  const firefox = scope.browser;

  return {
    async get() {
      const result = await firefox.proxy.settings.get({});
      return {
        value: result.value,
        levelOfControl: normalizeLevel(result.levelOfControl),
      };
    },
    async set(value) {
      const accepted = await firefox.proxy.settings.set({ value });
      return accepted !== false;
    },
    async isPrivateAllowed() {
      try {
        return await firefox.extension.isAllowedIncognitoAccess();
      } catch {
        return null;
      }
    },
    async getPlatform() {
      try {
        const info = await firefox.runtime.getPlatformInfo();
        return normalizeOs(info.os);
      } catch {
        return 'unknown';
      }
    },
  };
}

export function createBrowserClient(): ProxyClient {
  const scope = globalThis as { browser?: { proxy?: { settings?: unknown } } };
  const browser: BrowserName = scope.browser?.proxy?.settings ? 'firefox' : 'chrome';
  return createProxyClient(browser);
}

class BrowserProxyClient implements ProxyClient {
  private api: ProxyApi | undefined;

  constructor(
    readonly browser: BrowserName,
    api?: ProxyApi,
  ) {
    this.api = api;
  }

  private getApi(): ProxyApi {
    if (!this.api) {
      this.api = createBrowserApi(this.browser);
    }
    return this.api;
  }

  async load(): Promise<ClientSnapshot> {
    const [privateAllowed, platform] = await Promise.all([
      this.safePrivateAllowed(),
      this.safePlatform(),
    ]);

    try {
      const raw = await this.getApi().get();
      const parsed = this.browser === 'firefox' ? fromFirefox(raw.value) : fromChrome(raw.value);

      if (parsed.kind === 'config') {
        return {
          config: parsed.config,
          unknownReason: null,
          level: raw.levelOfControl,
          privateAllowed,
          platform,
          raw: raw.value,
          readError: null,
        };
      }

      return {
        config: null,
        unknownReason: parsed.reason,
        level: raw.levelOfControl,
        privateAllowed,
        platform,
        raw: raw.value,
        readError: null,
      };
    } catch (error) {
      const message = messageOf(error);
      return {
        config: null,
        unknownReason: 'read-error',
        level: null,
        privateAllowed,
        platform,
        raw: undefined,
        readError: new ProxyError('read-failed', message, message),
      };
    }
  }

  async apply(config: ProxyConfig): Promise<ClientSnapshot> {
    const mapped = this.browser === 'firefox' ? toFirefox(config) : toChrome(config);

    let accepted: boolean;
    try {
      accepted = await this.getApi().set(mapped);
    } catch (error) {
      throw toProxyError(error);
    }

    if (accepted === false) {
      throw new ProxyError(
        'not-applied',
        'The browser did not accept the proxy setting.',
        'set() returned false',
      );
    }

    return this.load();
  }

  private async safePrivateAllowed(): Promise<boolean | null> {
    try {
      return await this.getApi().isPrivateAllowed();
    } catch {
      return null;
    }
  }

  private async safePlatform(): Promise<PlatformOs> {
    try {
      return await this.getApi().getPlatform();
    } catch {
      return 'unknown';
    }
  }
}

export function createProxyClient(browser: BrowserName, api?: ProxyApi): ProxyClient {
  return new BrowserProxyClient(browser, api);
}
