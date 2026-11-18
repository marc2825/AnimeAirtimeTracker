/** Brand mark: a programming grid with one cell "on air". */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--color-ink)" />
      <g fill="var(--color-bg)" opacity="0.28">
        <rect x="6" y="7" width="6" height="5" rx="1.5" />
        <rect x="13" y="7" width="6" height="5" rx="1.5" />
        <rect x="6" y="13.5" width="6" height="5" rx="1.5" />
        <rect x="20" y="13.5" width="6" height="5" rx="1.5" />
        <rect x="6" y="20" width="6" height="5" rx="1.5" />
        <rect x="13" y="20" width="6" height="5" rx="1.5" />
        <rect x="20" y="20" width="6" height="5" rx="1.5" />
      </g>
      <rect x="13" y="13.5" width="6" height="5" rx="1.5" fill="var(--color-accent)" />
      <circle cx="23" cy="9.5" r="2.5" fill="var(--color-new)" />
    </svg>
  );
}
