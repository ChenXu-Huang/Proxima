import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/entrypoints/popup/App';
import { I18nProvider, createBrowserI18n } from '../src/lib/i18n';
import { writeDraft } from '../src/lib/draft';
import type { ClientSnapshot, ProxyClient } from '../src/lib/proxy/client';
import { ProxyError } from '../src/lib/proxy/errors';
import { createEmptyManual, type ManualConfig, type ProxyConfig } from '../src/lib/proxy/model';

function manual(overrides: Partial<ManualConfig> = {}): ManualConfig {
  return { ...createEmptyManual(), ...overrides };
}

function makeSnapshot(overrides: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    config: {
      mode: 'manual',
      manual: manual({ http: { host: '127.0.0.1', port: '7890' } }),
    },
    unknownReason: null,
    level: 'controlled_by_this_extension',
    privateAllowed: true,
    platform: 'linux',
    raw: {},
    readError: null,
    ...overrides,
  };
}

interface FakeClient {
  client: ProxyClient;
  apply: ReturnType<typeof vi.fn>;
  state(): ClientSnapshot;
}

function makeClient(initial: ClientSnapshot): FakeClient {
  let state = initial;
  const apply = vi.fn(async (config: ProxyConfig) => {
    state = {
      ...state,
      config,
      level: 'controlled_by_this_extension',
      readError: null,
    };
    return state;
  });
  return {
    client: {
      browser: 'firefox',
      load: async () => state,
      apply,
    },
    apply,
    state: () => state,
  };
}

function renderApp(client: ProxyClient) {
  const i18n = createBrowserI18n();
  return render(
    <I18nProvider i18n={i18n}>
      <App client={client} />
    </I18nProvider>,
  );
}

describe('App', () => {
  it('shows the browser state and current endpoint', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    expect(screen.getByText('HTTP 127.0.0.1:7890 · HTTPS shared')).toBeTruthy();
    expect((document.getElementById('http-host') as HTMLInputElement).value).toBe('127.0.0.1');
  });

  it('keeps the expanded fields inside the selected mode card', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    const manualItem = screen.getByRole('radio', { name: /Manual proxy/ }).closest('.mode-item');
    expect(manualItem?.getAttribute('data-selected')).toBe('true');
    expect(manualItem?.querySelector('.mode-panel')).not.toBeNull();

    const directItem = screen.getByRole('radio', { name: /Direct/ }).closest('.mode-item');
    expect(directItem?.getAttribute('data-selected')).toBe('false');
  });

  it('keeps manual values when switching modes and back', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    fireEvent.click(screen.getByRole('radio', { name: /Direct/ }));
    expect(document.getElementById('http-host')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /Manual proxy/ }));
    expect((document.getElementById('http-host') as HTMLInputElement).value).toBe('127.0.0.1');
  });

  it('applies a mode change and reports success', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    fireEvent.click(screen.getByRole('radio', { name: /Direct/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    await waitFor(() => {
      expect(fake.apply).toHaveBeenCalledWith({ mode: 'direct' });
    });
    await screen.findByText('Proxy setting applied');
    expect(fake.state().config).toEqual({ mode: 'direct' });
  });

  it('applies with Enter from a text field', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    const host = document.getElementById('http-host') as HTMLInputElement;
    fireEvent.input(host, { target: { value: '10.0.0.2' } });
    fireEvent.keyDown(host, { key: 'Enter' });

    await waitFor(() => {
      expect(fake.apply).toHaveBeenCalled();
    });
    expect(fake.apply.mock.calls[0]?.[0]).toMatchObject({
      mode: 'manual',
      manual: { http: { host: '10.0.0.2', port: '7890' } },
    });
  });

  it('commits a pending bypass entry before applying', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    fireEvent.click(screen.getByRole('button', { name: /Advanced settings/ }));
    const bypassInput = screen.getByLabelText('Add a bypass rule') as HTMLInputElement;
    fireEvent.input(bypassInput, { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Re-apply|Apply changes/ }));

    await waitFor(() => {
      expect(fake.apply).toHaveBeenCalled();
    });
    expect(fake.apply.mock.calls[0]?.[0]).toMatchObject({
      mode: 'manual',
      manual: { bypass: ['example.com'] },
    });
  });

  it('blocks an invalid port and surfaces the error', async () => {
    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Managed by Proxima');
    const port = document.getElementById('http-port') as HTMLInputElement;
    fireEvent.input(port, { target: { value: '0' } });
    await screen.findByText('Port must be between 1 and 65535.');

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await screen.findByText('Port must be between 1 and 65535.');
    expect(fake.apply).not.toHaveBeenCalled();
  });

  it('disables applying when Firefox private-window access is missing', async () => {
    const fake = makeClient(makeSnapshot({ privateAllowed: false }));
    renderApp(fake.client);

    await screen.findByRole('heading', { name: 'One more step' });
    const applyButton = screen.getByRole('button', { name: 'Re-apply' }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });

  it('restores an unapplied draft and offers to discard it', async () => {
    const draft: ProxyConfig = {
      mode: 'manual',
      manual: manual({ http: { host: '10.0.0.1', port: '8080' } }),
    };
    writeDraft(draft);

    const fake = makeClient(makeSnapshot());
    renderApp(fake.client);

    await screen.findByText('Restored your unapplied edits');
    expect((document.getElementById('http-host') as HTMLInputElement).value).toBe('10.0.0.1');

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => {
      expect((document.getElementById('http-host') as HTMLInputElement).value).toBe('127.0.0.1');
    });
  });

  it('shows a read failure with a retry action', async () => {
    const fake = makeClient(
      makeSnapshot({
        config: null,
        unknownReason: 'read-error',
        readError: new ProxyError('read-failed', 'boom', 'boom'),
      }),
    );
    renderApp(fake.client);

    await screen.findByText("Couldn't read the proxy setting");
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Re-apply' })).toBeNull();
  });
});
