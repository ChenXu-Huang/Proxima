import { useI18n } from '../lib/i18n';
import type { BrowserName, ManualConfig } from '../lib/proxy/model';
import { errorForField, type ValidationError } from '../lib/proxy/validate';
import type { ProxyFormActions } from '../lib/useProxyForm';
import { BypassEditor } from './BypassEditor';
import { Icon } from './Icon';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  error?: ValidationError;
  disabled: boolean;
  inputMode?: 'text' | 'numeric';
  onChange(value: string): void;
}

function TextField({
  id,
  label,
  value,
  placeholder,
  error,
  disabled,
  inputMode = 'text',
  onChange,
}: TextFieldProps) {
  const { t } = useI18n();
  return (
    <div class="field">
      <label class="field-label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="text-input"
        type="text"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onInput={(event) => onChange(event.currentTarget.value)}
        autoComplete="off"
      />
      {error ? (
        <p class="field-error" id={`${id}-error`}>
          {t(error.key, error.values)}
        </p>
      ) : null}
    </div>
  );
}

export interface ManualPanelProps {
  browser: BrowserName;
  manual: ManualConfig;
  errors: ValidationError[];
  disabled: boolean;
  advancedOpen: boolean;
  bypassPending: string;
  onToggleAdvanced(): void;
  actions: ProxyFormActions;
}

export function ManualPanel({
  browser,
  manual,
  errors,
  disabled,
  advancedOpen,
  bypassPending,
  onToggleAdvanced,
  actions,
}: ManualPanelProps) {
  const { t } = useI18n();

  const httpHostError = errorForField(errors, 'httpHost');
  const httpPortError = errorForField(errors, 'httpPort');
  const httpsHostError = errorForField(errors, 'httpsHost');
  const httpsPortError = errorForField(errors, 'httpsPort');
  const socksHostError = errorForField(errors, 'socksHost');
  const socksPortError = errorForField(errors, 'socksPort');
  const bypassError = errorForField(errors, 'bypass');
  const manualError = errorForField(errors, 'manual');

  const shareDisabled = disabled || !manual.http || Boolean(manual.https);
  const shareChecked = Boolean(manual.http) && manual.shareHttps && !manual.https;

  return (
    <section class="mode-panel" aria-label={t('a11yManualSection')}>
      <div class="field-group">
        <h3 class="group-title">{t('manualHttpTitle')}</h3>
        <div class="endpoint-row">
          <TextField
            id="http-host"
            label={t('manualHost')}
            value={manual.http?.host ?? ''}
            placeholder={t('manualHostPlaceholder')}
            error={httpHostError}
            disabled={disabled}
            onChange={(value) => actions.setEndpoint('http', 'host', value)}
          />
          <TextField
            id="http-port"
            label={t('manualPort')}
            value={manual.http?.port ?? ''}
            placeholder={t('manualPortPlaceholder')}
            error={httpPortError}
            disabled={disabled}
            inputMode="numeric"
            onChange={(value) => actions.setEndpoint('http', 'port', value)}
          />
        </div>
        <label class="check-row">
          <input
            type="checkbox"
            checked={shareChecked}
            disabled={shareDisabled}
            onChange={(event) => actions.setShareHttps(event.currentTarget.checked)}
          />
          <span>{t('manualShareHttps')}</span>
        </label>
        {manual.https ? <p class="field-hint">{t('manualShareDisabledHint')}</p> : null}
      </div>

      <div class="field-group">
        <h3 class="group-title">
          {t('manualSocksTitle')}
          <span class="group-optional">{t('manualOptional')}</span>
        </h3>
        <div class="endpoint-row">
          <TextField
            id="socks-host"
            label={t('manualHost')}
            value={manual.socks?.host ?? ''}
            placeholder={t('manualHostPlaceholder')}
            error={socksHostError}
            disabled={disabled}
            onChange={(value) => actions.setEndpoint('socks', 'host', value)}
          />
          <TextField
            id="socks-port"
            label={t('manualPort')}
            value={manual.socks?.port ?? ''}
            placeholder={t('manualPortPlaceholder')}
            error={socksPortError}
            disabled={disabled}
            inputMode="numeric"
            onChange={(value) => actions.setEndpoint('socks', 'port', value)}
          />
        </div>

        <div class="options-row">
          <label class="inline-field" for="socks-version">
            <span class="field-label">{t('manualSocksVersion')}</span>
            <select
              id="socks-version"
              class="select"
              value={String(manual.socksVersion)}
              disabled={disabled}
              onChange={(event) =>
                actions.setSocksVersion(Number(event.currentTarget.value) === 4 ? 4 : 5)
              }
            >
              <option value="5">{t('manualSocks5')}</option>
              <option value="4">{t('manualSocks4')}</option>
            </select>
          </label>

          {browser === 'firefox' ? (
            <label class="check-row check-row-inline">
              <input
                type="checkbox"
                checked={manual.proxyDns}
                disabled={disabled || !manual.socks}
                onChange={(event) => actions.setProxyDns(event.currentTarget.checked)}
              />
              <span>{t('manualProxyDns')}</span>
            </label>
          ) : null}
        </div>
        {browser === 'firefox' ? <p class="field-hint">{t('manualProxyDnsHint')}</p> : null}
      </div>

      {manualError ? (
        <p class="field-error manual-error" tabIndex={-1} data-error-focus="true">
          {t(manualError.key)}
        </p>
      ) : null}

      <div class="advanced">
        <button
          type="button"
          class="advanced-toggle"
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          disabled={disabled}
          onClick={onToggleAdvanced}
        >
          <Icon name="chevron" size={14} class="advanced-chevron" />
          <span>{t('manualAdvanced')}</span>
          {manual.bypass.length > 0 ? (
            <span class="badge">
              {t('manualAdvancedBypassCount', [String(manual.bypass.length)])}
            </span>
          ) : null}
        </button>

        {advancedOpen ? (
          <div class="advanced-panel" id="advanced-panel">
            <div class="field-group">
              <h3 class="group-title">{t('manualHttpsSeparate')}</h3>
              <p class="field-hint">{t('manualHttpsSeparateHint')}</p>
              <div class="endpoint-row">
                <TextField
                  id="https-host"
                  label={t('manualHost')}
                  value={manual.https?.host ?? ''}
                  placeholder={t('manualHostPlaceholder')}
                  error={httpsHostError}
                  disabled={disabled}
                  onChange={(value) => actions.setEndpoint('https', 'host', value)}
                />
                <TextField
                  id="https-port"
                  label={t('manualPort')}
                  value={manual.https?.port ?? ''}
                  placeholder={t('manualPortPlaceholder')}
                  error={httpsPortError}
                  disabled={disabled}
                  inputMode="numeric"
                  onChange={(value) => actions.setEndpoint('https', 'port', value)}
                />
              </div>
            </div>

            <div class="field-group">
              <BypassEditor
                value={manual.bypass}
                pending={bypassPending}
                disabled={disabled}
                error={bypassError}
                onChange={actions.setBypass}
                onPendingChange={actions.setBypassPending}
              />
            </div>

            {browser === 'firefox' ? (
              <div class="field-group">
                <label class="check-row">
                  <input
                    type="checkbox"
                    checked={manual.autoLogin}
                    disabled={disabled}
                    onChange={(event) => actions.setAutoLogin(event.currentTarget.checked)}
                  />
                  <span>{t('manualAutoLogin')}</span>
                </label>
                <p class="field-hint">{t('manualAutoLoginHint')}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
