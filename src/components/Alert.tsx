import type { ComponentChildren } from 'preact';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ComponentChildren;
  action?: ComponentChildren;
  details?: string;
}

export function Alert({ tone = 'info', title, children, action, details }: AlertProps) {
  const { t } = useI18n();
  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert';

  return (
    <section class={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span class={`alert-icon alert-icon-${tone}`}>
        <Icon name={icon} size={16} />
      </span>
      <div class="alert-body">
        {title ? <p class="alert-title">{title}</p> : null}
        {children ? <div class="alert-text">{children}</div> : null}
        {details ? (
          <details class="alert-details">
            <summary>{t('errorDetails')}</summary>
            <code>{details}</code>
          </details>
        ) : null}
        {action ? <div class="alert-action">{action}</div> : null}
      </div>
    </section>
  );
}
