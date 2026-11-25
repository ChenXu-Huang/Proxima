import { describe, expect, it } from 'vitest';
import { fromChrome, toChrome } from '../src/lib/proxy/chrome';
import { fromFirefox, toFirefox } from '../src/lib/proxy/firefox';
import { createEmptyManual, type ManualConfig, type ProxyConfig } from '../src/lib/proxy/model';

function manual(overrides: Partial<ManualConfig> = {}): ManualConfig {
  return { ...createEmptyManual(), ...overrides };
}

function manualConfig(overrides: Partial<ManualConfig> = {}): ProxyConfig {
  return { mode: 'manual', manual: manual(overrides) };
}

describe('Firefox mapping', () => {
  it('maps simple modes', () => {
    expect(toFirefox({ mode: 'direct' })).toEqual({ proxyType: 'none' });
    expect(toFirefox({ mode: 'system' })).toEqual({ proxyType: 'system' });
    expect(toFirefox({ mode: 'autoDetect' })).toEqual({ proxyType: 'autoDetect' });
    expect(toFirefox({ mode: 'pac', pacUrl: 'https://example.com/p.pac' })).toEqual({
      proxyType: 'autoConfig',
      autoConfigUrl: 'https://example.com/p.pac',
    });
  });

  it('writes a shared HTTP/HTTPS proxy with httpProxyAll', () => {
    expect(
      toFirefox(
        manualConfig({
          http: { host: '127.0.0.1', port: '7890' },
          bypass: ['localhost', '.local'],
          autoLogin: true,
        }),
      ),
    ).toEqual({
      proxyType: 'manual',
      http: '127.0.0.1:7890',
      httpProxyAll: true,
      passthrough: 'localhost,.local',
      autoLogin: true,
    });
  });

  it('writes a separate HTTPS proxy', () => {
    expect(
      toFirefox(
        manualConfig({
          http: { host: '127.0.0.1', port: '7890' },
          https: { host: 'secure.example.com', port: '443' },
          shareHttps: false,
        }),
      ),
    ).toMatchObject({
      proxyType: 'manual',
      http: '127.0.0.1:7890',
      ssl: 'secure.example.com:443',
      httpProxyAll: false,
    });
  });

  it('writes SOCKS options and omits them for HTTP-only configs', () => {
    const socks = toFirefox(
      manualConfig({
        socks: { host: '127.0.0.1', port: '1080' },
        socksVersion: 4,
        proxyDns: false,
      }),
    );
    expect(socks).toMatchObject({
      proxyType: 'manual',
      socks: '127.0.0.1:1080',
      socksVersion: 4,
      proxyDNS: false,
    });
    expect(socks.http).toBeUndefined();
    expect(socks.ssl).toBeUndefined();
  });

  it('reads share/BYPASS/locale flags from Firefox values', () => {
    const parsed = fromFirefox({
      proxyType: 'manual',
      http: '127.0.0.1:7890',
      httpProxyAll: true,
      passthrough: 'localhost, .local',
      autoLogin: true,
    });

    expect(parsed).toEqual({
      kind: 'config',
      config: {
        mode: 'manual',
        manual: manual({
          http: { host: '127.0.0.1', port: '7890' },
          shareHttps: true,
          bypass: ['localhost', '.local'],
          autoLogin: true,
        }),
      },
    });
  });

  it('treats equal ssl and http endpoints as shared', () => {
    const parsed = fromFirefox({
      proxyType: 'manual',
      http: '127.0.0.1:7890',
      ssl: '127.0.0.1:7890',
      httpProxyAll: false,
    });

    expect(parsed.kind).toBe('config');
    if (parsed.kind === 'config') {
      expect(parsed.config).toMatchObject({
        mode: 'manual',
        manual: { shareHttps: true, https: null },
      });
    }
  });

  it('returns unknown for unsupported or malformed values', () => {
    expect(fromFirefox({ proxyType: 'something' }).kind).toBe('unknown');
    expect(fromFirefox({ proxyType: 'manual', http: '::::' }).kind).toBe('unknown');
    expect(fromFirefox(null).kind).toBe('unknown');
  });
});

describe('Chrome mapping', () => {
  it('maps simple modes and PAC', () => {
    expect(toChrome({ mode: 'direct' })).toEqual({ mode: 'direct' });
    expect(toChrome({ mode: 'system' })).toEqual({ mode: 'system' });
    expect(toChrome({ mode: 'autoDetect' })).toEqual({ mode: 'auto_detect' });
    expect(toChrome({ mode: 'pac', pacUrl: 'https://example.com/p.pac' })).toEqual({
      mode: 'pac_script',
      pacScript: { url: 'https://example.com/p.pac', mandatory: false },
    });
  });

  it('uses proxyForHttp/proxyForHttps for shared HTTP', () => {
    expect(
      toChrome(
        manualConfig({
          http: { host: '127.0.0.1', port: '7890' },
          bypass: ['.local'],
        }),
      ),
    ).toEqual({
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: { scheme: 'http', host: '127.0.0.1', port: 7890 },
        proxyForHttps: { scheme: 'http', host: '127.0.0.1', port: 7890 },
        bypassList: ['.local'],
      },
    });
  });

  it('uses singleProxy for SOCKS-only configs', () => {
    expect(
      toChrome(
        manualConfig({
          socks: { host: '127.0.0.1', port: '1080' },
          socksVersion: 5,
        }),
      ),
    ).toEqual({
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: 1080 },
      },
    });
  });

  it('uses fallbackProxy for HTTP + SOCKS', () => {
    expect(
      toChrome(
        manualConfig({
          http: { host: '127.0.0.1', port: '7890' },
          socks: { host: '127.0.0.1', port: '1080' },
        }),
      ),
    ).toMatchObject({
      rules: {
        proxyForHttp: { scheme: 'http' },
        proxyForHttps: { scheme: 'http' },
        fallbackProxy: { scheme: 'socks5' },
      },
    });
  });

  it('reads singleProxy, per-protocol rules and bypass entries', () => {
    const single = fromChrome({
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: 1080 },
        bypassList: ['localhost'],
      },
    });
    expect(single).toEqual({
      kind: 'config',
      config: {
        mode: 'manual',
        manual: manual({
          socks: { host: '127.0.0.1', port: '1080' },
          shareHttps: false,
          bypass: ['localhost'],
        }),
      },
    });

    const split = fromChrome({
      mode: 'fixed_servers',
      rules: {
        proxyForHttp: { scheme: 'http', host: '127.0.0.1', port: 7890 },
        proxyForHttps: { scheme: 'http', host: 'secure.example.com', port: 443 },
      },
    });
    expect(split.kind).toBe('config');
    if (split.kind === 'config') {
      expect(split.config).toMatchObject({
        mode: 'manual',
        manual: {
          http: { host: '127.0.0.1', port: '7890' },
          https: { host: 'secure.example.com', port: '443' },
          shareHttps: false,
        },
      });
    }
  });

  it('returns unknown for inline PAC and unknown modes', () => {
    expect(
      fromChrome({ mode: 'pac_script', pacScript: { data: 'function FindProxyForURL(){}' } }).kind,
    ).toBe('unknown');
    expect(fromChrome({ mode: 'something' }).kind).toBe('unknown');
  });

  it('treats a TLS-to-proxy scheme as unsupported', () => {
    expect(
      fromChrome({
        mode: 'fixed_servers',
        rules: {
          proxyForHttp: { scheme: 'https', host: 'proxy.example.com', port: 443 },
        },
      }).kind,
    ).toBe('unknown');
  });
});
