import type { MessageKey } from '../lib/i18n';
import { useI18n } from '../lib/i18n';
import type { ClientSnapshot, ControlLevel } from '../lib/proxy/client';
import { Icon } from './Icon';

const CONTROL_KEY: Record<ControlLevel, MessageKey> = {
  controlled_by_this_extension: 'statusControlManaged',
  controllable_by_this_extension: 'statusControlUnowned',
  controlled_by_other_extensions: 'statusControlOther',
  not_controllable: 'statusControlLocked',
};

type StatusTone = 'ok' | 'warn' | 'error' | 'neutral';

function toneFor(snapshot: ClientSnapshot): StatusTone {
  switch (snapshot.level) {
    case 'controlled_by_this_extension':
      return 'ok';
    case 'controlled_by_other_extensions':
      return 'warn';
    case 'not_controllable':
      return 'error';
    default:
      return 'neutral';
  }
}

export interface StatusCardProps {
  snapshot: ClientSnapshot;
  title: string;
  summary: string;
  detail?: string;
  dirty: boolean;
  refreshing: boolean;
  onRefresh(): void;
}

export function StatusCard({
  snapshot,
  title,
  summary,
  detail,
  dirty,
  refreshing,
  onRefresh,
}: StatusCardProps) {
  const { t } = useI18n();
  const level = snapshot.level;
  const control = level ? t(CONTROL_KEY[level]) : t('statusControlUnknown');
  const tone = toneFor(snapshot);

  return (
    <section class="status-card" aria-live="polite" aria-label={t('a11yStatus')}>
      <div class="status-card-top">
        <span class={`status-dot status-dot-${tone}`} aria-hidden="true" />
        <span class="status-control">{control}</span>
        <button
          type="button"
          class="icon-button"
          onClick={onRefresh}
          disabled={refreshing}
          title={t('statusRefresh')}
          aria-label={t('statusRefresh')}
        >
          <Icon name="refresh" size={15} class={refreshing ? 'spin' : undefined} />
        </button>
      </div>
      <p class="status-mode">{title}</p>
      <p class="status-summary" title={summary}>
        {summary}
      </p>
      {detail ? <p class="status-detail">{detail}</p> : null}
      {dirty ? <span class="status-badge">{t('statusDirty')}</span> : null}
    </section>
  );
}
