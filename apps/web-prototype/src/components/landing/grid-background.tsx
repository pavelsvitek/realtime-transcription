/**
 * Variant B background: a fine blue grid that fades in below the hero and out at
 * the bottom, with a few small plus marks near the copy. Purely decorative.
 * Mirrors "Landing — Variant B · Grid" in Paper (page "Landing · Brand colors").
 */

const GRID_START = 1000; // px from the top of the page, just below the hero window
const FADE = 240; // px fade at the top and bottom of the grid

// Plus marks, in page coordinates (x from the left of the 1440px column).
const MARKS: { x: number; y: number }[] = [
  { x: 72, y: 1432 },
  { x: 1368, y: 1752 },
  { x: 1368, y: 2312 },
  { x: 72, y: 2872 },
  { x: 1368, y: 3352 },
  { x: 72, y: 3790 },
  { x: 1368, y: 4280 },
];

export function GridBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 select-none"
      style={{ top: GRID_START }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgb(111 176 222 / 9%) 1px, transparent 1px), linear-gradient(90deg, rgb(111 176 222 / 9%) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: "8px 8px",
          maskImage: `linear-gradient(to bottom, transparent 0, black ${FADE}px, black calc(100% - ${FADE}px), transparent 100%)`,
          WebkitMaskImage: `linear-gradient(to bottom, transparent 0, black ${FADE}px, black calc(100% - ${FADE}px), transparent 100%)`,
        }}
      />
      {MARKS.map((mark) => (
        <span
          key={`${mark.x}-${mark.y}`}
          className="absolute size-4"
          style={{ left: mark.x - 8, top: mark.y - 8 - GRID_START }}
        >
          <span className="absolute top-0 left-[7px] h-4 w-0.5 bg-brand-accent/60" />
          <span className="absolute top-[7px] left-0 h-0.5 w-4 bg-brand-accent/60" />
        </span>
      ))}
    </div>
  );
}
