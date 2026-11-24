/** Brand mark: a colour bar of the seven weekday colours (tokens.css), the week a slot recurs in. */
const BARS = ["--weekday-0", "--weekday-1", "--weekday-2", "--weekday-3", "--weekday-4", "--weekday-5", "--weekday-6"];

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      {BARS.map((token, index) => (
        <rect key={token} x={index * 4} y="2" width="4" height="24" fill={`var(${token})`} />
      ))}
    </svg>
  );
}
