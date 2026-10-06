/**
 * Minimal PNG encoder + placeholder scene painter.
 *
 * The demo seed needs real image files in the Storage bucket, and the bucket
 * deliberately excludes image/svg+xml (SVG can carry script). Rather than pull
 * in an image library or download stock photography, this paints the
 * placeholders pixel by pixel and encodes them with node:zlib. No dependencies,
 * no network, no third-party licence.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Encodes 8-bit RGB pixel data (width * height * 3 bytes) as a PNG buffer. */
export function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const rgb = (hex) => {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

function isDeterministicRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/**
 * Paints an abstract architectural placeholder. Every listing gets the same
 * composition in its own palette so the cards look deliberate rather than
 * random, without pretending to be photographs of real homes.
 */
export function paintPlaceholder({ width = 1200, height = 800, palette, seed = 7 }) {
  const random = isDeterministicRandom(seed);

  const deep = rgb(palette.deep);
  const mid = rgb(palette.mid);
  const light = rgb(palette.light);
  const accent = rgb(palette.accent);

  const pixels = Buffer.alloc(width * height * 3);

  const windows = [];
  const columns = 5;
  const rows = 3;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      windows.push({
        x: Math.round(width * 0.24) + column * Math.round(width * 0.11),
        y: Math.round(height * 0.3) + row * Math.round(height * 0.14),
        w: Math.round(width * 0.07),
        h: Math.round(height * 0.09),
        lit: random() > 0.55,
      });
    }
  }

  const sun = { x: Math.round(width * (0.2 + random() * 0.6)), y: Math.round(height * 0.22) };

  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    const rowBase = mix(mid, deep, Math.pow(vertical, 0.8));
    const groundStart = Math.round(height * 0.82);

    for (let x = 0; x < width; x += 1) {
      let colour = rowBase;

      // Soft light source.
      const dx = x - sun.x;
      const dy = y - sun.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - distance / (width * 0.55));
      if (glow > 0) colour = mix(colour, light, glow * 0.32);

      // Building block.
      const blockLeft = Math.round(width * 0.18);
      const blockRight = Math.round(width * 0.84);
      const blockTop = Math.round(height * 0.26);
      if (x > blockLeft && x < blockRight && y > blockTop && y < groundStart) {
        colour = mix(colour, deep, 0.42);
      }

      // Roofline.
      if (y >= blockTop && y < blockTop + 6 && x > blockLeft && x < blockRight) {
        colour = mix(colour, accent, 0.55);
      }

      // Windows.
      for (const window of windows) {
        if (
          x >= window.x &&
          x < window.x + window.w &&
          y >= window.y &&
          y < window.y + window.h
        ) {
          colour = window.lit ? mix(colour, accent, 0.5) : mix(colour, light, 0.22);
        }
      }

      // Ground plane and entrance.
      if (y >= groundStart) {
        const depth = (y - groundStart) / (height - groundStart);
        colour = mix(colour, deep, 0.55 + depth * 0.3);
      }
      const doorLeft = Math.round(width * 0.47);
      const doorRight = Math.round(width * 0.53);
      if (x > doorLeft && x < doorRight && y > groundStart - Math.round(height * 0.16) && y < groundStart) {
        colour = mix(colour, accent, 0.4);
      }

      const offset = (y * width + x) * 3;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
    }
  }

  return encodePng(width, height, pixels);
}

export const PALETTES = {
  apartment: { deep: "#0a1826", mid: "#274767", light: "#c3d3e2", accent: "#d8b45c" },
  villa: { deep: "#050d16", mid: "#1a3350", light: "#e2eaf2", accent: "#eddfae" },
  office: { deep: "#11243a", mid: "#3d628a", light: "#e2eaf2", accent: "#c39c3d" },
  plot: { deep: "#0a1826", mid: "#274767", light: "#93aec7", accent: "#d8b45c" },
  resale: { deep: "#050d16", mid: "#1a3350", light: "#c3d3e2", accent: "#c39c3d" },
  rowhouse: { deep: "#11243a", mid: "#274767", light: "#93aec7", accent: "#eddfae" },
};