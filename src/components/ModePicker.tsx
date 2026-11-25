import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../lib/i18n';
import { modeDescriptionKey, modeTitleKey } from '../lib/proxy/describe';
import {
  PROXY_MODES,
  type BrowserName,
  type ManualConfig,
  type ProxyMode,
} from '../lib/proxy/model';
import { errorForField, type ValidationError } from '../lib/proxy/validate';
import type { ProxyFormActions } from '../lib/useProxyForm';
import { ManualPanel } from './ManualPanel';

export interface ModePickerProps {
  mode: ProxyMode;
  browser: BrowserName;
  manual: ManualConfig;
  pacUrl: string;
  bypassPending: string;
  errors: ValidationError[];
  disabled: boolean;
  actions: ProxyFormActions;
}

interface PacPanelProps {
  pacUrl: string;
  error?: ValidationError;
  disabled: boolean;
  onChange(value: string): void;
}

function PacPanel({ pacUrl, error, disabled, onChange }: PacPanelProps) {
  const { t } = useI18n();
  return (
    <section class="mode-panel" aria-label={t('manualPacTitle')}>
      <div class="field">
        <label class="field-label" for="pac-url">
          {t('manualPacUrl')}
        </label>
        <input
          id="pac-url"
          class="text-input"
          type="url"
          value={pacUrl}
          placeholder={t('manualPacPlaceholder')}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'pac-url-error' : 'pac-help'}
          onInput={(event) => onChange(event.currentTarget.value)}
          autoComplete="off"
        />
        {error ? (
          <p class="field-error" id="pac-url-error">
            {t(error.key, error.values)}
          </p>
        ) : null}
      </div>
      <p class="field-hint" id="pac-help">
        {t('manualPacHint')}
      </p>
    </section>
  );
}

export function ModePicker({
  mode,
  browser,
  manual,
  pacUrl,
  bypassPending,
  errors,
  disabled,
  actions,
}: ModePickerProps) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasAdvancedError = errors.some(
    (error) =>
      error.field === 'httpsHost' || error.field === 'httpsPort' || error.field === 'bypass',
  );

  useEffect(() => {
    if (hasAdvancedError) {
      setAdvancedOpen(true);
    }
  }, [hasAdvancedError]);

  return (
    <fieldset class="mode-picker" aria-label={t('a11yModeGroup')}>
      <legend class="section-title mode-legend">{t('modeSection')}</legend>

      {PROXY_MODES.map((item) => {
        const selected = item === mode;
        return (
          <div class="mode-item" key={item} data-selected={selected ? 'true' : 'false'}>
            <label class="mode-row" data-disabled={disabled ? 'true' : 'false'}>
              <input
                type="radio"
                name="proxy-mode"
                value={item}
                checked={selected}
                disabled={disabled}
                aria-describedby={`mode-${item}-desc`}
                onChange={() => actions.setMode(item)}
              />
              <span class="mode-copy">
                <span class="mode-title">{t(modeTitleKey(item))}</span>
                <span class="mode-desc" id={`mode-${item}-desc`}>
                  {t(modeDescriptionKey(item))}
                </span>
              </span>
            </label>

            {selected && item === 'manual' ? (
              <ManualPanel
                browser={browser}
                manual={manual}
                errors={errors}
                disabled={disabled}
                advancedOpen={advancedOpen}
                bypassPending={bypassPending}
                onToggleAdvanced={() => setAdvancedOpen((open) => !open)}
                actions={actions}
              />
            ) : null}

            {selected && item === 'pac' ? (
              <PacPanel
                pacUrl={pacUrl}
                error={errorForField(errors, 'pacUrl')}
                disabled={disabled}
                onChange={actions.setPacUrl}
              />
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
