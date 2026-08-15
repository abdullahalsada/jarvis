#!/usr/bin/env node
/**
 * 🎨 Generates pixel-art placeholder icons (joystick motif) as PNGs:
 * icon, Android adaptive foreground/background/monochrome, splash, favicon.
 *
 * ⚠️  SUPERSEDED (2026-08-15): the shipping brand assets are the owner-chosen
 * neon-joystick artwork committed in assets/. Running this would overwrite
 * them, so it now requires --force. The monochrome glyph it makes is still
 * used as the Android themed-icon layer.
 *
 *   node scripts/gen-icons.mjs --force
 */
if (!process.argv.includes('--force')) {
  console.error('🛑 Refusing to overwrite the chosen brand assets. Use --force if you really mean it.');
  process.exit(1);
}
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Palette ────────────────────────────────────────────────────────────────
const PAL = {
  '.': null, // transparent (or page background where noted)
  G: [0x39, 0xff, 0x14, 255], // neon green stick
  g: [0x2b, 0xcc, 0x10, 255], // stick shading
  M: [0xff, 0x20, 0x79, 255], // magenta ball
  m: [0xc4, 0x15, 0x5c, 255], // ball shading
  D: [0x2a, 0x2a, 0x45, 255], // base
  d: [0x1b, 0x1b, 0x30, 255], // base shading
  C: [0x00, 0xff, 0xf7, 255], // cyan buttons
  W: [0xff, 0xff, 0xff, 255], // white (monochrome variant)
};

// ─── Original 16×16 joystick sprite ─────────────────────────────────────────
const ART = [
  '................',
  '......MMMM......',
  '.....MMMMMM.....',
  '.....MMMMMm.....',
  '.....MMMMmm.....',
  '......Mmmm......',
  '.......Gg.......',
  '.......Gg.......',
  '.......Gg.......',
  '.......Gg.......',
  '....DDDDDDDD....',
  '..DDDDDDDDDDDD..',
  '.DDDDDDDDDDDDdd.',
  '.DCCDDDDDDDCCdd.',
  '.dddddddddddddd.',
  '................',
];

const BG = [0x0a, 0x0a, 0x12, 255]; // app background

// ─── Minimal PNG encoder ────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
};

function png(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = y * (1 + width * 4) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Renders the 16×16 ART map into a size×size canvas.
 * scale: fraction of the canvas the sprite spans (rest is margin).
 * bg: background RGBA or null for transparent.
 * mono: force every sprite pixel to white (adaptive monochrome layer).
 */
function renderSprite(size, { scale = 1, bg = null, mono = false } = {}) {
  const sprite = Math.floor((size * scale) / 16) * 16; // crisp integer pixels
  const cell = sprite / 16;
  const off = Math.floor((size - sprite) / 2);
  return png(size, size, (x, y) => {
    const sx = Math.floor((x - off) / cell);
    const sy = Math.floor((y - off) / cell);
    let color = null;
    if (sx >= 0 && sx < 16 && sy >= 0 && sy < 16) {
      const ch = ART[sy][sx];
      color = ch === '.' ? null : mono ? PAL.W : PAL[ch];
    }
    if (color) return color;
    return bg ?? [0, 0, 0, 0];
  });
}

const assets = join(ROOT, 'assets');
mkdirSync(assets, { recursive: true });

writeFileSync(join(assets, 'icon.png'), renderSprite(1024, { scale: 0.8, bg: BG }));
writeFileSync(join(assets, 'android-icon-foreground.png'), renderSprite(1024, { scale: 0.5 }));
writeFileSync(join(assets, 'android-icon-background.png'), png(1024, 1024, () => BG));
writeFileSync(join(assets, 'android-icon-monochrome.png'), renderSprite(1024, { scale: 0.5, mono: true }));
writeFileSync(join(assets, 'splash-icon.png'), renderSprite(1024, { scale: 0.55 }));
writeFileSync(join(assets, 'favicon.png'), renderSprite(48, { scale: 1, bg: BG }));

console.log('✅ Pixel-art icons written to assets/ (icon, adaptive fg/bg/mono, splash, favicon)');
