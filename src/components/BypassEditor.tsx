import { useRef } from 'preact/hooks';
import { useI18n } from '../lib/i18n';
import type { ValidationError } from '../lib/proxy/validate';
import { Icon } from './Icon';

export interface BypassEditorProps {
  value: string[];
  pending: string;
  disabled?: boolean;
  error?: ValidationError;
  onChange(values: string[]): void;
  onPendingChange(value: string): void;
}

function splitEntries(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function BypassEditor({
  value,
  pending,
  disabled = false,
  error,
  onChange,
  onPendingChange,
}: BypassEditorProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  function addEntries(raw: string): void {
    const entries = splitEntries(raw);
    if (entries.length === 0) return;

    const seen = new Set(value.map((entry) => entry.toLowerCase()));
    const next = [...value];
    for (const entry of entries) {
      const key = entry.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        next.push(entry);
      }
    }
    onChange(next);
  }

  function commitPending(): void {
    if (pending.trim()) {
      addEntries(pending);
    }
    onPendingChange('');
  }

  function handleInput(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value;
    if (!/[,，]/.test(raw)) {
      onPendingChange(raw);
      return;
    }

    const endsWithSeparator = /[,，]\s*$/.test(raw);
    const parts = raw.split(/[,，]/);
    const rest = endsWithSeparator ? '' : (parts.pop() ?? '');
    addEntries(parts.join(','));
    onPendingChange(rest);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitPending();
      return;
    }
    if (event.key === 'Backspace' && !pending && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    addEntries(text);
    onPendingChange('');
  }

  return (
    <div class="bypass">
      <span class="field-label">{t('manualBypass')}</span>
      <div
        class="chip-input-wrap"
        onClick={() => inputRef.current?.focus()}
        data-invalid={error ? 'true' : undefined}
      >
        {value.map((entry) => (
          <span class="chip" key={entry}>
            <span>{entry}</span>
            <button
              type="button"
              class="chip-remove"
              disabled={disabled}
              aria-label={t('manualRemoveBypass', [entry])}
              onClick={(event) => {
                event.stopPropagation();
                onChange(value.filter((item) => item !== entry));
              }}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          class="chip-input"
          value={pending}
          type="text"
          disabled={disabled}
          placeholder={value.length === 0 ? t('manualBypassPlaceholder') : ''}
          aria-label={t('manualBypassAdd')}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'bypass-error' : 'bypass-hint'}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={commitPending}
          autoComplete="off"
        />
      </div>
      {error ? (
        <p class="field-error" id="bypass-error">
          {t(error.key, error.values)}
        </p>
      ) : (
        <p class="field-hint" id="bypass-hint">
          {t('manualBypassHint')}
        </p>
      )}
    </div>
  );
}
