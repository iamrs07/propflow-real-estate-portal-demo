/**
 * Generates the original SVG placeholder photographs used by demo mode.
 *
 * These are drawn from scratch by this script — no stock imagery, no scraping,
 * nothing with a third-party licence. Re-run with:
 *   node scripts/generate-demo-images.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo");

const NAVY = ["#0a1826", "#11243a", "#1a3350", "#274767", "#050d16"];

/** Deterministic pseudo-random so regenerating produces identical files. */
function rng(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function image({ file, seed, palette, motif, label }) {
  const rand = rng(seed);
  const [deep, mid, light, accent] = palette;

  const shapes = [];
  // Sky / wall gradient wash.
  shapes.push(
    `<rect width="1600" height="1100" fill="url(#wash)"/>`,
    `<circle cx="${200 + Math.round(rand() * 1200)}" cy="${180 + Math.round(rand() * 240)}" r="${120 + Math.round(rand() * 90)}" fill="${light}" opacity="0.16"/>`,
  );

  if (motif === "interior") {
    // Window bays, a floor plane and a furniture block.
    for (let i = 0; i < 4; i += 1) {
      const x = 210 + i * 300;
      const h = 460 + Math.round(rand() * 90);
      shapes.push(
        `<rect x="${x}" y="${300 + Math.round(rand() * 40)}" width="220" height="${h}" rx="6" fill="${light}" opacity="0.22"/>`,
        `<rect x="${x}" y="${300 + Math.round(rand() * 40)}" width="220" height="${h}" rx="6" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="3"/>`,
        `<line x1="${x + 110}" y1="${300 + Math.round(rand() * 40)}" x2="${x + 110}" y2="${300 + h}" stroke="${accent}" stroke-opacity="0.3" stroke-width="2"/>`,
      );
    }
    shapes.push(
      `<rect x="0" y="820" width="1600" height="280" fill="${deep}" opacity="0.55"/>`,
      `<rect x="240" y="700" width="520" height="140" rx="10" fill="${mid}" opacity="0.9"/>`,
      `<rect x="900" y="660" width="150" height="180" rx="8" fill="${accent}" opacity="0.28"/>`,
    );
  } else if (motif === "facade") {
    // Roofline, storeys and an entrance.
    shapes.push(
      `<polygon points="180,860 800,430 1420,860" fill="${mid}" opacity="0.9"/>`,
      `<rect x="300" y="620" width="1000" height="420" fill="${deep}" opacity="0.72"/>`,
    );
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const lit = rand() > 0.55;
        shapes.push(
          `<rect x="${370 + col * 190}" y="${660 + row * 170}" width="120" height="110" rx="4" fill="${lit ? accent : light}" opacity="${lit ? 0.42 : 0.18}"/>`,
        );
      }
    }
    shapes.push(
      `<rect x="720" y="880" width="170" height="160" rx="6" fill="${accent}" opacity="0.34"/>`,
      `<rect x="0" y="1040" width="1600" height="60" fill="${deep}"/>`,
    );
  } else if (motif === "plan") {
    // Boundary wall and plot markings.
    shapes.push(
      `<rect x="120" y="200" width="1360" height="760" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="10"/>`,
      `<rect x="200" y="280" width="560" height="600" fill="${mid}" opacity="0.5"/>`,
      `<rect x="840" y="280" width="560" height="600" fill="${light}" opacity="0.12"/>`,
      `<line x1="200" y1="580" x2="1400" y2="580" stroke="${accent}" stroke-opacity="0.3" stroke-width="4"/>`,
      `<line x1="800" y1="280" x2="800" y2="880" stroke="${accent}" stroke-opacity="0.3" stroke-width="4"/>`,
    );
  } else {
    // Landscape: horizon, trees and a path.
    shapes.push(
      `<rect x="0" y="640" width="1600" height="460" fill="${deep}" opacity="0.75"/>`,
      `<path d="M0 640 Q 400 560 800 630 T 1600 610 L1600 700 L0 700 Z" fill="${mid}" opacity="0.8"/>`,
      `<path d="M620 1100 L900 700 L1180 1100 Z" fill="${light}" opacity="0.16"/>`,
    );
    for (let i = 0; i < 7; i += 1) {
      const x = 90 + i * 215 + Math.round(rand() * 50);
      const h = 180 + Math.round(rand() * 150);
      shapes.push(
        `<rect x="${x}" y="${640 - h * 0.35}" width="${Math.round(h * 0.12)}" height="${Math.round(h * 0.35)}" fill="${deep}" opacity="0.8"/>`,
        `<circle cx="${x + Math.round(h * 0.06)}" cy="${640 - h * 0.45}" r="${Math.round(h * 0.28)}" fill="${mid}" opacity="0.85"/>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1100" width="1600" height="1100" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${mid}"/>
      <stop offset="55%" stop-color="${deep}"/>
      <stop offset="100%" stop-color="${NAVY[4]}"/>
    </linearGradient>
  </defs>
  ${shapes.join("\n  ")}
  <rect x="0" y="0" width="1600" height="1100" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="4"/>
  <text x="60" y="1030" font-family="Georgia, serif" font-size="34" fill="${accent}" fill-opacity="0.6">${label}</text>
  <text x="60" y="1070" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#ffffff" fill-opacity="0.35" letter-spacing="6">DEMO IMAGE</text>
</svg>
`;

  return writeFile(join(outDir, file), svg, "utf8");
}

const IMAGES = [
  ["apartment-1.svg", 11, ["#11243a", "#274767", "#93aec7", "#d8b45c"], "interior", "Placeholder photograph — Koregaon Park living room"],
  ["apartment-2.svg", 23, ["#0a1826", "#1a3350", "#93aec7", "#c39c3d"], "interior", "Placeholder photograph — covered balcony"],
  ["apartment-3.svg", 37, ["#11243a", "#1a3350", "#c3d3e2", "#c39c3d"], "interior", "Placeholder photograph — kitchen"],
  ["villa-1.svg", 41, ["#0a1826", "#274767", "#93aec7", "#eddfae"], "facade", "Placeholder photograph — villa frontage"],
  ["villa-2.svg", 53, ["#11243a", "#1a3350", "#c3d3e2", "#d8b45c"], "landscape", "Placeholder photograph — front garden"],
  ["office-1.svg", 67, ["#0a1826", "#274767", "#e2eaf2", "#c39c3d"], "interior", "Placeholder photograph — office floor"],
  ["office-2.svg", 71, ["#050d16", "#1a3350", "#93aec7", "#eddfae"], "interior", "Placeholder photograph — reception"],
  ["plot-1.svg", 83, ["#050d16", "#274767", "#93aec7", "#d8b45c"], "plan", "Placeholder photograph — plotted land"],
  ["resale-1.svg", 97, ["#11243a", "#274767", "#e2eaf2", "#c39c3d"], "interior", "Placeholder photograph — Indiranagar living area"],
  ["resale-2.svg", 109, ["#0a1826", "#1a3350", "#c3d3e2", "#eddfae"], "interior", "Placeholder photograph — redone kitchen"],
  ["rowhouse-1.svg", 127, ["#050d16", "#1a3350", "#93aec7", "#d8b45c"], "facade", "Placeholder photograph — Kokapet row house"],
  ["rowhouse-2.svg", 139, ["#11243a", "#274767", "#e2eaf2", "#c39c3d"], "landscape", "Placeholder photograph — rear terrace"],
];

await mkdir(outDir, { recursive: true });
await Promise.all(IMAGES.map(([file, seed, palette, motif, label]) => image({ file, seed, palette, motif, label })));
console.log(`wrote ${IMAGES.length} placeholder images to ${outDir}`);