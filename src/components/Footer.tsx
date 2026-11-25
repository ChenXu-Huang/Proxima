import { useI18n } from '../lib/i18n';

export interface FooterProps {
  dirty: boolean;
  errorCount: number;
  canApply: boolean;
  applying: boolean;
  blockedLabel?: string;
  draftSummary: string;
  onApply(): void;
  onReset(): void;
}

export function Footer({
  dirty,
  errorCount,
  canApply,
  applying,
  blockedLabel,
  draftSummary,
  onApply,
  onReset,
}: FooterProps) {
  const { t } = useI18n();

  let state: string;
  if (applying) {
    state = t('statusApplying');
  } else if (blockedLabel) {
    state = blockedLabel;
  } else if (errorCount > 0) {
    state = t('statusErrorCount', [String(errorCount)]);
  } else if (dirty) {
    state = t('statusDraftSummary', [draftSummary]);
  } else {
    state = t('statusInSync');
  }

  const applyLabel = applying ? t('actionApplying') : dirty ? t('actionApply') : t('actionReapply');

  return (
    <footer class="footer">
      <span class="footer-state" title={state}>
        {state}
      </span>
      <div class="footer-actions">
        {dirty ? (
          <button
            type="button"
            class="button button-secondary"
            onClick={onReset}
            disabled={applying}
          >
            {t('actionReset')}
          </button>
        ) : null}
        <button
          type="button"
          class="button button-primary"
          onClick={onApply}
          disabled={!canApply || applying}
          aria-busy={applying}
        >
          {applyLabel}
        </button>
      </div>
    </footer>
  );
}
