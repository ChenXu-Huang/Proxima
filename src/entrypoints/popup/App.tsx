import { useMemo } from 'preact/hooks';
import { Alert } from '../../components/Alert';
import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { ModePicker } from '../../components/ModePicker';
import { SetupNotice } from '../../components/SetupNotice';
import { StatusCard } from '../../components/StatusCard';
import { Toast } from '../../components/Toast';
import { useI18n, type MessageKey } from '../../lib/i18n';
import { createBrowserClient, type ProxyClient } from '../../lib/proxy/client';
import { describeConfig } from '../../lib/proxy/describe';
import type { ProxyError } from '../../lib/proxy/errors';
import { useProxyForm } from '../../lib/useProxyForm';

export interface AppProps {
  client?: ProxyClient;
}

function applyErrorKey(error: ProxyError): MessageKey {
  switch (error.code) {
    case 'private-browsing':
      return 'errorPrivate';
    case 'policy':
      return 'errorPolicy';
    case 'unsupported-platform':
      return 'errorUnsupported';
    case 'not-applied':
      return 'errorNotApplied';
    default:
      return 'errorGeneric';
  }
}

export function App({ client }: AppProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const proxyClient = useMemo(() => client ?? createBrowserClient(), [client]);
  const form = useProxyForm(proxyClient);
  const { snapshot, blocking } = form;

  const currentDescription = snapshot?.config ? describeConfig(snapshot.config, t) : null;
  const draftDescription = describeConfig(form.draft, t);

  const blockedLabel =
    blocking === 'loading'
      ? t('statusReading')
      : blocking === 'read-error'
        ? t('errorReadTitle')
        : blocking === 'unknown'
          ? t('statusUnknownTitle')
          : blocking === 'unsupported-platform'
            ? t('statusUnsupportedTitle')
            : blocking === 'policy'
              ? t('statusPolicyTitle')
              : blocking === 'private-browsing'
                ? t('statusPrivateGateTitle')
                : undefined;

  function handleApply(): void {
    void form.actions.apply();
    window.setTimeout(() => {
      const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      const manualError = document.querySelector<HTMLElement>('[data-error-focus="true"]');
      (invalid ?? manualError)?.focus();
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest(
        'button, a, select, textarea, input[type="radio"], input[type="checkbox"], .chip-input',
      )
    ) {
      return;
    }

    event.preventDefault();
    handleApply();
  }

  const showApplyError =
    Boolean(form.applyError) && blocking !== 'private-browsing' && blocking !== 'policy';

  return (
    <div class="app" onKeyDown={handleKeyDown}>
      <Header />

      <main class="content">
        {blocking === 'loading' ? (
          <div class="loading" aria-live="polite">
            <span class="spinner" aria-hidden="true" />
            <span>{t('statusReading')}</span>
          </div>
        ) : null}

        {blocking === 'unsupported-platform' ? (
          <Alert tone="error" title={t('statusUnsupportedTitle')}>
            {t('statusUnsupportedBody')}
          </Alert>
        ) : null}

        {blocking === 'read-error' ? (
          <Alert
            tone="error"
            title={t('errorReadTitle')}
            details={snapshot?.readError?.raw}
            action={
              <button
                type="button"
                class="button button-secondary"
                onClick={() => void form.actions.refresh()}
                disabled={form.refreshing}
              >
                {t('actionRetry')}
              </button>
            }
          >
            {form.browser === 'firefox' ? t('errorReadBody') : t('errorReadBodyGeneric')}
          </Alert>
        ) : null}

        {blocking === 'unknown' ? (
          <Alert
            tone="warning"
            title={t('statusUnknownTitle')}
            action={
              <button
                type="button"
                class="button button-secondary"
                onClick={() => void form.actions.refresh()}
                disabled={form.refreshing}
              >
                {t('actionRetry')}
              </button>
            }
          >
            {t('statusUnknownBody')}
          </Alert>
        ) : null}

        {blocking === 'private-browsing' ? (
          <SetupNotice
            refreshing={form.refreshing}
            onRecheck={() => void form.actions.recheckPrivate()}
          />
        ) : null}

        {snapshot?.config && currentDescription ? (
          <StatusCard
            snapshot={snapshot}
            title={currentDescription.title}
            summary={currentDescription.summary}
            detail={currentDescription.detail}
            dirty={form.dirty}
            refreshing={form.refreshing || form.applying}
            onRefresh={() => void form.actions.refresh()}
          />
        ) : null}

        {blocking === 'policy' ? (
          <Alert
            tone="warning"
            title={t('statusPolicyTitle')}
            action={
              <button
                type="button"
                class="button button-secondary"
                onClick={() => void form.actions.refresh()}
                disabled={form.refreshing}
              >
                {t('actionRetry')}
              </button>
            }
          >
            {t('statusPolicyBody')}
          </Alert>
        ) : null}

        {snapshot?.level === 'controlled_by_other_extensions' && blocking === null ? (
          <Alert tone="warning" title={t('statusOtherExtensionTitle')}>
            {t('statusOtherExtensionBody')}
          </Alert>
        ) : null}

        {snapshot?.config && form.restoredDraft ? (
          <div class="notice">
            <span>{t('statusDraftRestored')}</span>
            <button type="button" class="text-button" onClick={form.actions.reset}>
              {t('actionDiscard')}
            </button>
          </div>
        ) : null}

        {snapshot?.config ? (
          <ModePicker
            mode={form.draft.mode}
            browser={form.browser}
            manual={form.manual}
            pacUrl={form.pacUrl}
            bypassPending={form.bypassPending}
            errors={form.errors}
            disabled={!form.canEdit}
            actions={form.actions}
          />
        ) : null}

        {showApplyError && form.applyError ? (
          <Alert
            tone="error"
            title={t('errorWriteTitle')}
            details={form.applyError.raw}
            action={
              <button
                type="button"
                class="button button-secondary"
                onClick={handleApply}
                disabled={!form.canApply || form.applying}
              >
                {t('actionRetry')}
              </button>
            }
          >
            {t(applyErrorKey(form.applyError))}
          </Alert>
        ) : null}
      </main>

      {snapshot?.config ? (
        <Footer
          dirty={form.dirty}
          errorCount={form.errors.length}
          canApply={form.canApply}
          applying={form.applying}
          blockedLabel={blockedLabel}
          draftSummary={`${draftDescription.title} · ${draftDescription.summary}`}
          onApply={handleApply}
          onReset={form.actions.reset}
        />
      ) : null}

      {form.toast ? <Toast toast={form.toast} /> : null}
    </div>
  );
}
