export interface LogoProps {
  size?: number;
}

export function Logo({ size = 22 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <circle class="logo-core" cx="64" cy="64" r="43" />
      <ellipse
        class="logo-orbit"
        cx="64"
        cy="64"
        rx="55"
        ry="21"
        fill="none"
        stroke="#ffffff"
        transform="rotate(-28 64 64)"
      />
      <circle cx="103" cy="43" r="8.5" fill="#ffffff" />
    </svg>
  );
}
