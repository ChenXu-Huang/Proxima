import { Logo } from './Logo';

interface RuntimeLike {
  runtime?: {
    getManifest?: () => { version?: string };
  };
}

function getVersion(): string {
  const scope = globalThis as { browser?: RuntimeLike; chrome?: RuntimeLike };
  const version =
    scope.browser?.runtime?.getManifest?.().version ??
    scope.chrome?.runtime?.getManifest?.().version;
  return version ?? '0.1.0';
}

export function Header() {
  return (
    <header class="header">
      <div class="brand">
        <Logo />
        <span class="brand-name">Proxima</span>
      </div>
      <span class="version">{`v${getVersion()}`}</span>
    </header>
  );
}
