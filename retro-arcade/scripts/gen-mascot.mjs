#!/usr/bin/env node
/**
 * 🐍 Generates the Retro Arcade mascot — a cute front-facing pixel snake —
 * as a transparent 480×480 PNG (24×24 sprite at 20× scale) used on the
 * loading screen. Original artwork.
 *
 *   node scripts/gen-mascot.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 24;
const SCALE = 20;

const PAL = {
  '.': null,
  G: [0x39, 0xff, 0x14, 255], // bright body green
  g: [0x2b, 0xcc, 0x10, 255], // shade green
  l: [0x8f, 0xff, 0x66, 255], // highlight green
  W: [0xff, 0xff, 0xff, 255], // eye white
  K: [0x10, 0x10, 0x18, 255], // pupil / mouth
  R: [0xff, 0x3b, 0x3b, 255], // tongue
};

// Cute snake: big round head with huge eyes + grin, forked tongue,
// coiled body below (like a plush toy sitting on its coil).
const ROWS = [
  '........gGGGGGg.........',
  '......gGGGGGGGGGg.......',
  '.....GGGGGGGGGGGGG......',
  '....GGGGGGGGGGGGGGG.....',
  '....GGWWWWGGGWWWWGG.....',
  '...GGWWWWWWGWWWWWWGG....',
  '...GGWWKKWWGWWKKWWGG....',
  '...GGWWKKWWGWWKKWWGG....',
  '...GGWWWWWWGWWWWWWGG....',
  '....GGWWWWGGGWWWWGG.....',
  '....GGGKGGGGGGGKGGG.....',
  '.....GGGKKKKKKKGGG......',
  '......gGGGGRRGGGg.......',
  '.........GGRRGG.........',
  '........gGGRGRGGg.......',
  '.....gGGGGGGGGGGGg......',
  '....gGllGGGGGGGGGGg.....',
  '...gGGGGGGGGGGGGGGGg....',
  '...ggggggggggggggggg....',
  '..gGllGGGGGGGGGGGGGGg...',
  '..GGGGGGGGGGGGGGGGGGGG..',
  '..gGGGGGGGGGGGGGGGGGGGg.',
  '...ggGGGGGGGGGGGGGggGGg.',
  '.................ggg....',
];

if (ROWS.length !== SIZE || ROWS.some((r) => r.length !== SIZE)) {
  console.error(
    `❌ mascot must be ${SIZE}×${SIZE} (got ${ROWS.length} rows: ${ROWS.map((r) => r.length).join(',')})`
  );
  process.exit(1);
}

// ─── Minimal PNG encoder (same as gen-icons.mjs, kept self-contained) ───────
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
function png(size, pixelAt) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = y * (1 + size * 4) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const img = png(SIZE * SCALE, (x, y) => {
  const ch = ROWS[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
  if (!(ch in PAL)) return [255, 0, 255, 255];
  return PAL[ch] ?? [0, 0, 0, 0];
});
writeFileSync(join(ROOT, 'assets', 'mascot.png'), img);
console.log('✅ mascot written to assets/mascot.png');
