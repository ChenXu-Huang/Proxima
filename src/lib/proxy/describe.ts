import type { MessageKey } from '../i18n/types';
import { endpointText, type ManualConfig, type ProxyConfig, type ProxyMode } from './model';

export type Translate = (key: MessageKey, substitutions?: string[]) => string;

export interface ConfigDescription {
  title: string;
  summary: string;
  detail?: string;
}

const MODE_TITLE: Record<ProxyMode, MessageKey> = {
  direct: 'statusModeDirect',
  system: 'statusModeSystem',
  autoDetect: 'statusModeAutoDetect',
  pac: 'statusModePac',
  manual: 'statusModeManual',
};

const MODE_DESCRIPTION: Record<ProxyMode, MessageKey> = {
  direct: 'modeDirectDesc',
  system: 'modeSystemDesc',
  autoDetect: 'modeAutoDetectDesc',
  pac: 'modePacDesc',
  manual: 'modeManualDesc',
};

export function modeTitleKey(mode: ProxyMode): MessageKey {
  return MODE_TITLE[mode];
}

export function modeDescriptionKey(mode: ProxyMode): MessageKey {
  return MODE_DESCRIPTION[mode];
}

export function describeManual(manual: ManualConfig, t: Translate): string {
  const parts: string[] = [];
  if (manual.http && manual.http.host.trim()) {
    parts.push(`HTTP ${endpointText(manual.http)}`);
  }
  if (manual.https && manual.https.host.trim()) {
    parts.push(`HTTPS ${endpointText(manual.https)}`);
  } else if (manual.http && manual.http.host.trim() && manual.shareHttps) {
    parts.push(t('statusHttpsShared'));
  }
  if (manual.socks && manual.socks.host.trim()) {
    parts.push(`SOCKS${manual.socksVersion} ${endpointText(manual.socks)}`);
  }
  return parts.join(' · ') || t('statusManualEmpty');
}

export function describeConfig(config: ProxyConfig, t: Translate): ConfigDescription {
  const title = t(MODE_TITLE[config.mode]);

  if (config.mode === 'manual') {
    const detail = config.manual.bypass.length
      ? t('statusBypassCount', [String(config.manual.bypass.length)])
      : undefined;
    return {
      title,
      summary: describeManual(config.manual, t),
      detail,
    };
  }

  if (config.mode === 'pac') {
    return {
      title,
      summary: config.pacUrl,
    };
  }

  return {
    title,
    summary: t(MODE_DESCRIPTION[config.mode]),
  };
}
