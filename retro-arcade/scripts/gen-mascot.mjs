#!/usr/bin/env node
/**
 * 🕹️ Generates the Retro Arcade mascot — an arcade-cabinet character with a
 * face on its screen — as three transparent 480×480 PNG animation frames
 * (24×24 sprite at 20× scale) used on the loading screen:
 *
 *   mascot-0.png  eyes center, joystick center
 *   mascot-1.png  eyes left,   joystick tilted left
 *   mascot-2.png  eyes right,  joystick tilted right
 *
 * Original artwork.   node scripts/gen-mascot.mjs
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
  C: [0x00, 0xff, 0xf7, 255], // cyan cabinet trim
  D: [0x2a, 0x2a, 0x45, 255], // cabinet panel
  K: [0x10, 0x10, 0x18, 255], // screen glass
  G: [0x39, 0xff, 0x14, 255], // face on screen
  M: [0xff, 0x20, 0x79, 255], // marquee magenta
  Y: [0xff, 0xe6, 0x00, 255], // marquee lights + buttons
  R: [0xff, 0x3b, 0x3b, 255], // joystick ball
  w: [0x9a, 0x9a, 0xb5, 255], // joystick stem + coin slot
};

// Screen row x5..18 with 2×2 eyes at x8-9 / x14-15, shifted by `off`.
const eyeRow = (off) => {
  const px = Array(SIZE).fill('.');
  px[3] = 'C'; px[4] = 'D'; px[19] = 'D'; px[20] = 'C';
  for (let x = 5; x <= 18; x++) px[x] = 'K';
  for (const x of [8 + off, 9 + off, 14 + off, 15 + off]) px[x] = 'G';
  return px.join('');
};
// Control-deck row x4..19 with the 2px joystick ball at x7-8 + `off`.
const ballRow = (off) => {
  const px = Array(SIZE).fill('.');
  px[3] = 'C'; px[20] = 'C';
  for (let x = 4; x <= 19; x++) px[x] = 'D';
  px[7 + off] = 'R'; px[8 + off] = 'R';
  return px.join('');
};

const frame = (off) => [
  '....MMMMMMMMMMMMMMMM....', // marquee
  '....MYYMYYMMYYMMYYMM....',
  '....MMMMMMMMMMMMMMMM....',
  '...CCCCCCCCCCCCCCCCCC...', // cabinet top
  '...CDDDDDDDDDDDDDDDDC...',
  '...CDKKKKKKKKKKKKKKDC...', // screen
  eyeRow(off),
  eyeRow(off),
  '...CDKKKKKKKKKKKKKKDC...',
  '...CDKKGKKKKKKKKGKKDC...', // smile corners
  '...CDKKKGGGGGGGGKKKDC...', // smile
  '...CDDDDDDDDDDDDDDDDC...',
  '...CCCCCCCCCCCCCCCCCC...',
  ballRow(off), //                joystick ball
  ballRow(off),
  '...CDDDwwDDYYDDYYDDDC...', // stem + two buttons
  '...CDDDDDDDDDDDDDDDDC...',
  '...CCCCCCCCCCCCCCCCCC...',
  '...CDDDDDDDwwDDDDDDDC...', // coin slot
  '...CDDDDDDDDDDDDDDDDC...',
  '...CCCCCCCCCCCCCCCCCC...',
  '.....DDD........DDD.....', // feet
  '........................',
  '........................',
];

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

const OFFSETS = [0, -1, 1];
OFFSETS.forEach((off, i) => {
  const rows = frame(off);
  if (rows.length !== SIZE || rows.some((r) => r.length !== SIZE)) {
    console.error(`❌ frame ${i}: must be ${SIZE}×${SIZE} (rows: ${rows.map((r) => r.length).join(',')})`);
    process.exit(1);
  }
  const img = png(SIZE * SCALE, (x, y) => {
    const ch = rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    if (!(ch in PAL)) return [255, 0, 255, 255];
    return PAL[ch] ?? [0, 0, 0, 0];
  });
  writeFileSync(join(ROOT, 'assets', `mascot-${i}.png`), img);
});
console.log('✅ 3 mascot frames written to assets/mascot-{0,1,2}.png');
