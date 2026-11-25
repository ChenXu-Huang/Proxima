import { describe, expect, it, vi } from 'vitest';
import {
  createProxyClient,
  type PlatformOs,
  type ProxyApi,
  type RawProxyState,
} from '../src/lib/proxy/client';
import { ProxyError } from '../src/lib/proxy/errors';

interface ApiOptions {
  privateAllowed?: boolean | null;
  platform?: PlatformOs;
  getError?: Error;
  setResult?: boolean;
  setError?: Error;
}

function makeApi(
  initial: RawProxyState,
  options: ApiOptions = {},
): {
  api: ProxyApi;
  set: ReturnType<typeof vi.fn>;
} {
  let state = initial;
  const set = vi.fn(async (value: unknown) => {
    if (options.setError) throw options.setError;
    const accepted = options.setResult ?? true;
    if (accepted) {
      state = { value, levelOfControl: 'controlled_by_this_extension' };
    }
    return accepted;
  });
  const api: ProxyApi = {
    async get() {
      if (options.getError) throw options.getError;
      return state;
    },
    set,
    async isPrivateAllowed() {
      return options.privateAllowed ?? true;
    },
    async getPlatform() {
      return options.platform ?? 'linux';
    },
  };
  return { api, set };
}

const firefoxManual: RawProxyState = {
  value: {
    proxyType: 'manual',
    http: '127.0.0.1:7890',
    httpProxyAll: true,
    passthrough: 'localhost',
  },
  levelOfControl: 'controlled_by_this_extension',
};

describe('ProxyClient', () => {
  it('reads and maps a Firefox snapshot', async () => {
    const { api } = makeApi(firefoxManual, { privateAllowed: true, platform: 'win' });
    const client = createProxyClient('firefox', api);
    const snapshot = await client.load();

    expect(snapshot.config).toMatchObject({
      mode: 'manual',
      manual: {
        http: { host: '127.0.0.1', port: '7890' },
        shareHttps: true,
        bypass: ['localhost'],
      },
    });
    expect(snapshot.level).toBe('controlled_by_this_extension');
    expect(snapshot.privateAllowed).toBe(true);
    expect(snapshot.platform).toBe('win');
    expect(snapshot.readError).toBeNull();
  });

  it('turns a read failure into a recoverable snapshot', async () => {
    const { api } = makeApi(firefoxManual, { getError: new Error('get failed') });
    const client = createProxyClient('firefox', api);
    const snapshot = await client.load();

    expect(snapshot.config).toBeNull();
    expect(snapshot.readError?.code).toBe('read-failed');
    expect(snapshot.unknownReason).toBe('read-error');
  });

  it('reports unknown Firefox values without throwing', async () => {
    const { api } = makeApi({
      value: { proxyType: 'manual', http: '::::' },
      levelOfControl: 'controllable_by_this_extension',
    });
    const client = createProxyClient('firefox', api);
    const snapshot = await client.load();

    expect(snapshot.config).toBeNull();
    expect(snapshot.unknownReason).toBe('invalid-http-proxy');
  });

  it('writes the mapped Firefox config and re-reads it', async () => {
    const { api, set } = makeApi(firefoxManual);
    const client = createProxyClient('firefox', api);
    const snapshot = await client.apply({ mode: 'direct' });

    expect(set).toHaveBeenCalledWith({ proxyType: 'none' });
    expect(snapshot.config).toEqual({ mode: 'direct' });
  });

  it('maps Chrome fixed_servers and writes Chrome config', async () => {
    const { api, set } = makeApi({
      value: {
        mode: 'fixed_servers',
        rules: {
          proxyForHttp: { scheme: 'http', host: '127.0.0.1', port: 7890 },
          proxyForHttps: { scheme: 'http', host: '127.0.0.1', port: 7890 },
        },
      },
      levelOfControl: 'controllable_by_this_extension',
    });
    const client = createProxyClient('chrome', api);
    const snapshot = await client.load();

    expect(snapshot.config).toMatchObject({
      mode: 'manual',
      manual: { http: { host: '127.0.0.1', port: '7890' }, shareHttps: true },
    });

    await client.apply({ mode: 'system' });
    expect(set).toHaveBeenLastCalledWith({ mode: 'system' });
  });

  it('throws a typed error when set returns false', async () => {
    const { api } = makeApi(firefoxManual, { setResult: false });
    const client = createProxyClient('firefox', api);

    await expect(client.apply({ mode: 'direct' })).rejects.toMatchObject({
      code: 'not-applied',
    });
  });

  it('maps Firefox private-browsing errors', async () => {
    const { api } = makeApi(firefoxManual, {
      setError: new Error('proxy.settings requires private browsing permission.'),
    });
    const client = createProxyClient('firefox', api);

    try {
      await client.apply({ mode: 'direct' });
      throw new Error('expected apply to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('private-browsing');
    }
  });

  it('maps Chrome policy errors', async () => {
    const { api } = makeApi(
      { value: { mode: 'system' }, levelOfControl: 'not_controllable' },
      { setError: new Error('Proxy settings are managed by policy.') },
    );
    const client = createProxyClient('chrome', api);

    await expect(client.apply({ mode: 'direct' })).rejects.toMatchObject({
      code: 'policy',
    });
  });

  it('reports the platform and private access independently of reads', async () => {
    const { api } = makeApi(
      { value: { proxyType: 'system' }, levelOfControl: 'controllable_by_this_extension' },
      { privateAllowed: false, platform: 'android' },
    );
    const client = createProxyClient('firefox', api);
    const snapshot = await client.load();

    expect(snapshot.platform).toBe('android');
    expect(snapshot.privateAllowed).toBe(false);
  });
});
