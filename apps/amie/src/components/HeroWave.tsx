const WAVE_BARS: [number, number][] = [
  [25, 10], [21, 18], [15, 30], [20, 20], [9, 42], [16, 28], [2, 56], [13, 34],
  [6, 48], [18, 24], [23, 14], [17, 26], [10, 40], [19, 22], [24, 12],
];

/** Soft waveform above the Home hero and the setup wizard's Welcome step. */
export function HeroWave() {
  return (
    <svg
      className="fill-brand-accent-soft-hover"
      width="105"
      height="60"
      viewBox="0 0 105 60"
      aria-hidden="true"
    >
      {WAVE_BARS.map(([y, h], i) => (
        <rect key={i} x={i * 7} y={y} width="4" height={h} rx="2" />
      ))}
    </svg>
  );
}
