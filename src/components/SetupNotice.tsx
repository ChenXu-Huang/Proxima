import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';

const HELP_URL = 'https://support.mozilla.org/kb/extensions-private-browsing';

export interface SetupNoticeProps {
  refreshing: boolean;
  onRecheck(): void;
}

export function SetupNotice({ refreshing, onRecheck }: SetupNoticeProps) {
  const { t } = useI18n();

  return (
    <section class="setup" aria-labelledby="setup-title">
      <h2 class="setup-title" id="setup-title">
        {t('statusPrivateGateTitle')}
      </h2>
      <p class="setup-body">{t('statusPrivateGateBody')}</p>
      <ol class="setup-steps">
        <li>{t('statusPrivateGateStep1')}</li>
        <li>{t('statusPrivateGateStep2')}</li>
        <li>{t('statusPrivateGateStep3')}</li>
        <li>{t('statusPrivateGateStep4')}</li>
      </ol>
      <div class="setup-actions">
        <button
          type="button"
          class="button button-secondary"
          onClick={onRecheck}
          disabled={refreshing}
        >
          <Icon name="refresh" size={13} class={refreshing ? 'spin' : undefined} />
          {t('statusPrivateGateRecheck')}
        </button>
        <a class="link" href={HELP_URL} target="_blank" rel="noreferrer noopener">
          {t('statusPrivateGateHelp')}
        </a>
      </div>
    </section>
  );
}
