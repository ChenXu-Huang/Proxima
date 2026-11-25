export type ProxyErrorCode =
  | 'private-browsing'
  | 'policy'
  | 'unsupported-platform'
  | 'not-applied'
  | 'write-failed'
  | 'read-failed';

export class ProxyError extends Error {
  readonly code: ProxyErrorCode;
  readonly raw: string;

  constructor(code: ProxyErrorCode, message: string, raw = message) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.raw = raw;
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Unknown proxy error';
}

export function toProxyError(error: unknown): ProxyError {
  if (error instanceof ProxyError) {
    return error;
  }

  const message = messageOf(error);
  if (/private browsing permission|private window/i.test(message)) {
    return new ProxyError('private-browsing', message, message);
  }
  if (/polic|managed by enterprise|administrator/i.test(message)) {
    return new ProxyError('policy', message, message);
  }
  if (/android|not supported on this platform|not supported on this device/i.test(message)) {
    return new ProxyError('unsupported-platform', message, message);
  }
  return new ProxyError('write-failed', message, message);
}
