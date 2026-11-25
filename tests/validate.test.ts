import { describe, expect, it } from 'vitest';
import { createEmptyManual, type ManualConfig, type ProxyConfig } from '../src/lib/proxy/model';
import { validateConfig } from '../src/lib/proxy/validate';

function manual(overrides: Partial<ManualConfig> = {}): ManualConfig {
  return { ...createEmptyManual(), ...overrides };
}

function manualConfig(overrides: Partial<ManualConfig> = {}): ProxyConfig {
  return { mode: 'manual', manual: manual(overrides) };
}

describe('validateConfig', () => {
  it('normalizes a shared HTTP/HTTPS proxy', () => {
    const result = validateConfig(
      manualConfig({ http: { host: ' 127.0.0.1 ', port: ' 7890 ' } }),
      'firefox',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({
      mode: 'manual',
      manual: manual({
        http: { host: '127.0.0.1', port: '7890' },
        shareHttps: true,
      }),
    });
  });

  it('lets an explicit HTTPS proxy win over sharing', () => {
    const result = validateConfig(
      manualConfig({
        http: { host: '127.0.0.1', port: '7890' },
        https: { host: 'secure.example.com', port: '443' },
        shareHttps: true,
      }),
      'firefox',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      mode: 'manual',
      manual: {
        https: { host: 'secure.example.com', port: '443' },
        shareHttps: false,
      },
    });
  });

  it('requires at least one proxy endpoint', () => {
    const result = validateConfig(manualConfig(), 'firefox');
    expect(result.errors.map((error) => error.key)).toContain('manualAtLeastOne');
    expect(result.value).toBeNull();
  });

  it('does not add the generic empty error while an endpoint is incomplete', () => {
    const result = validateConfig(
      manualConfig({ http: { host: '127.0.0.1', port: '' } }),
      'firefox',
    );
    expect(result.errors.map((error) => error.key)).toEqual(['manualPortRequired']);
  });

  it('rejects port zero and out-of-range ports', () => {
    const zero = validateConfig(
      manualConfig({ socks: { host: '127.0.0.1', port: '0' } }),
      'firefox',
    );
    expect(zero.errors.map((error) => error.key)).toContain('manualPortInvalid');

    const tooLarge = validateConfig(
      manualConfig({ socks: { host: '127.0.0.1', port: '70000' } }),
      'firefox',
    );
    expect(tooLarge.errors.map((error) => error.key)).toContain('manualPortInvalid');
  });

  it('splits a pasted URL into host and port', () => {
    const result = validateConfig(
      manualConfig({ http: { host: 'http://example.com:8080/path', port: '' } }),
      'chrome',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      mode: 'manual',
      manual: { http: { host: 'example.com', port: '8080' } },
    });
  });

  it('splits host:port pasted into the host field', () => {
    const result = validateConfig(
      manualConfig({ http: { host: '127.0.0.1:8888', port: '' } }),
      'firefox',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      mode: 'manual',
      manual: { http: { host: '127.0.0.1', port: '8888' } },
    });
  });

  it('normalizes internationalized hostnames', () => {
    const result = validateConfig(
      manualConfig({ http: { host: 'münich.example', port: '3128' } }),
      'chrome',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      mode: 'manual',
      manual: { http: { host: 'xn--mnich-kva.example', port: '3128' } },
    });
  });

  it('rejects a PAC URL with credentials', () => {
    const result = validateConfig(
      { mode: 'pac', pacUrl: 'https://user:pass@example.com/proxy.pac' },
      'firefox',
    );
    expect(result.errors.map((error) => error.key)).toContain('manualPacCredentials');
  });

  it('requires a PAC URL and a supported scheme', () => {
    expect(
      validateConfig({ mode: 'pac', pacUrl: ' ' }, 'firefox').errors.map((error) => error.key),
    ).toContain('manualPacRequired');
    expect(
      validateConfig({ mode: 'pac', pacUrl: 'ftp://example.com/proxy.pac' }, 'firefox').errors.map(
        (error) => error.key,
      ),
    ).toContain('manualPacInvalid');
  });

  it('deduplicates and trims bypass entries', () => {
    const result = validateConfig(
      manualConfig({
        http: { host: '127.0.0.1', port: '7890' },
        bypass: [' example.com ', 'EXAMPLE.com', '.local'],
      }),
      'firefox',
    );

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      mode: 'manual',
      manual: { bypass: ['example.com', '.local'] },
    });
  });

  it('rejects bypass entries containing whitespace', () => {
    const result = validateConfig(
      manualConfig({
        http: { host: '127.0.0.1', port: '7890' },
        bypass: ['bad entry'],
      }),
      'firefox',
    );

    expect(result.errors.map((error) => error.key)).toContain('manualBypassInvalid');
    expect(result.errors.find((error) => error.field === 'bypass')?.values).toEqual(['bad entry']);
  });

  it('passes through non-manual modes', () => {
    expect(validateConfig({ mode: 'direct' }, 'firefox').value).toEqual({ mode: 'direct' });
    expect(validateConfig({ mode: 'system' }, 'chrome').value).toEqual({ mode: 'system' });
    expect(validateConfig({ mode: 'autoDetect' }, 'firefox').value).toEqual({
      mode: 'autoDetect',
    });
  });
});
