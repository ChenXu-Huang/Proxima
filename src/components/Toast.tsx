import { useI18n } from '../lib/i18n';
import type { ToastState } from '../lib/useProxyForm';
import { Icon } from './Icon';

export interface ToastProps {
  toast: ToastState;
}

export function Toast({ toast }: ToastProps) {
  const { t } = useI18n();
  const icon = toast.tone === 'success' ? 'check' : toast.tone === 'warning' ? 'alert' : 'info';

  return (
    <div class={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <Icon name={icon} size={14} />
      <span>{t(toast.key, toast.values)}</span>
    </div>
  );
}
