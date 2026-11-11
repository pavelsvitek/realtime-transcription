// Generates the two Amie logo SVGs in this folder.
// Run: node docs/logo/build-logo.mjs
// Every number below is part of the locked spec described in README.md.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));

// Container: superellipse (squircle), exponent 4, radius 256, centred at 256,256.
function squircle(n = 4, r = 256, c = 256, steps = 120) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const cs = Math.cos(t);
    const sn = Math.sin(t);
    pts.push([
      c + r * Math.sign(cs) * Math.abs(cs) ** (2 / n),
      c + r * Math.sign(sn) * Math.abs(sn) ** (2 / n),
    ]);
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
}

// "A" glyph: outer outline + one combined counter/crossbar hole, drawn as one
// even-odd path. A 12px round-join stroke rounds the corners (and shrinks the
// holes by 6px per side, which is already compensated for in the coordinates).
const A_PATH = [
  "M222 126L292 126L390 374L328 374L304 318L210 318L186 374L124 374Z", // outline with bottom notch
  // Counter triangle and crossbar pill are ONE hole: the triangle opens straight
  // into the pill (no solid bar between them), like the original icon.
  "M257 182L293 256L305 256A26 26 0 0 1 305 308L203 308A26 26 0 0 1 203 256L221 256Z",
].join(" ");

// Waveform: 21 white bars, symmetric, peak in the middle.
const BAR_HEIGHTS = [8, 12, 18, 14, 22, 18, 28, 22, 34, 26, 36, 26, 34, 22, 28, 18, 22, 14, 18, 12, 8];
const BARS = BAR_HEIGHTS.map((h, i) => {
  const x = (192 + i * 6.3).toFixed(1);
  const y = 282 - h / 2;
  return `<rect x="${x}" y="${y}" width="3" height="${h}" rx="1.5" fill="#FFFFFF"/>`;
}).join("\n    ");

const NAVY = "#0D324D";
const GRADIENT_START = "#1D5880";
const SHADOW = "#04141F";

function logo({ gradient }) {
  const defs = gradient
    ? `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRADIENT_START}"/>
      <stop offset="1" stop-color="${NAVY}"/>
    </linearGradient>
  </defs>
  `
    : "";
  const fill = gradient ? "url(#bg)" : NAVY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${defs}<path d="${squircle()}" fill="${fill}"/>
  <path d="${A_PATH}" transform="translate(0 9)" fill="${SHADOW}" fill-opacity="0.28" stroke="${SHADOW}" stroke-opacity="0.28" stroke-width="12" stroke-linejoin="round" fill-rule="evenodd"/>
  <path d="${A_PATH}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round" fill-rule="evenodd"/>
  <g>
    ${BARS}
  </g>
</svg>
`;
}

writeFileSync(join(OUT, "amie-logo-gradient.svg"), logo({ gradient: true }));
writeFileSync(join(OUT, "amie-logo-solid.svg"), logo({ gradient: false }));
console.log("wrote amie-logo-gradient.svg and amie-logo-solid.svg");
