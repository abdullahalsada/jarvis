#!/usr/bin/env node
/**
 * 🎨 Generates the original pixel-art card icon for every game as a 256×256
 * transparent PNG (16×16 sprite at 16× scale) in assets/games/.
 * All artwork is original — mechanics homages, never copies of trademarked
 * sprites. Rerun after editing a sprite map:
 *
 *   node scripts/gen-game-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'games');
const SCALE = 16;

// ─── Shared palette ─────────────────────────────────────────────────────────
const PAL = {
  '.': null,
  G: [0x39, 0xff, 0x14, 255], g: [0x2b, 0xcc, 0x10, 255],
  C: [0x00, 0xff, 0xf7, 255], c: [0x00, 0xb3, 0xae, 255],
  M: [0xff, 0x20, 0x79, 255], m: [0xc4, 0x15, 0x5c, 255],
  Y: [0xff, 0xe6, 0x00, 255], y: [0xb3, 0xa1, 0x00, 255],
  O: [0xff, 0x9f, 0x1c, 255], o: [0xc4, 0x72, 0x07, 255],
  P: [0xb1, 0x4a, 0xed, 255], p: [0x7c, 0x30, 0xa8, 255],
  R: [0xff, 0x3b, 0x3b, 255], r: [0xb3, 0x22, 0x22, 255],
  W: [0xe8, 0xe8, 0xf0, 255], w: [0x9a, 0x9a, 0xb5, 255],
  D: [0x2a, 0x2a, 0x45, 255], d: [0x1b, 0x1b, 0x30, 255],
  B: [0x8a, 0x5a, 0x2b, 255], b: [0x5e, 0x3d, 0x1c, 255],
  K: [0x10, 0x10, 0x18, 255],

};

// ─── Sprites (16 rows × 16 chars each) ──────────────────────────────────────
const SPRITES = {
  snake: [
    '................',
    '..gGGGG.........',
    '..G....G........',
    '.......G........',
    '..GGGGGG........',
    '..G.............',
    '..GGGGGGGGg.....',
    '..........G.....',
    '..gGGGGGGGG.....',
    '..G.............',
    '..GGGGGGGGGGg...',
    '............G...',
    '.....gGGGGGGG...',
    '....GG..........',
    '...GWG......MM..',
    '....G.......MM..',
  ],
  brickbreaker: [
    '.RRR.RRR.RRR.RRR',
    '.RRR.RRR.RRR.RRR',
    '................',
    '.OOO.OOO.OOO.OOO',
    '.OOO.OOO.OOO.OOO',
    '................',
    '.YYY.YYY.YYY.YYY',
    '.YYY.YYY.YYY.YYY',
    '................',
    '................',
    '.........WW.....',
    '.........WW.....',
    '................',
    '................',
    '.....CCCCCC.....',
    '.....cccccc.....',
  ],
  paddleduel: [
    '................',
    '..MMMMMMMM......',
    '..MMMMMMMM......',
    '..mmmmmmmm......',
    '................',
    '.........WWW....',
    '.........WWW....',
    '.........WWW....',
    'w.w.w.w.w.w.w.w.',
    '................',
    '................',
    '...WWW..........',
    '...WWW..........',
    '................',
    '.....CCCCCCCC...',
    '.....cccccccc...',
  ],
  neonstack: [
    '................',
    '................',
    '......PP........',
    '....PPPP........',
    '......PP........',
    '................',
    '................',
    '................',
    '................',
    '.CC.........YY..',
    '.CC....GG...YY..',
    '.CC...GGG..OOO..',
    '.CC.RRGGG..OOOMM',
    '.CCRRRGGGYYOOOMM',
    '.CCRRGGGGYYOOOMM',
    'KKKKKKKKKKKKKKKK',
  ],
  solitaire: [
    '................',
    '..WWWWWWWWW.....',
    '..WKKWWWWWWWW...',
    '..WKKWWWWWWWW...',
    '..WWWWWWWWWWW...',
    '..WWWWKWWWWWW...',
    '..WWWKKKWWWWW...',
    '..WWKKKKKWWWW...',
    '..WWKKKKKWWWW...',
    '..WWWWKWWWWWW...',
    '..WWWKKKWWWWW...',
    '..WWWWWWWWWWW...',
    '..WWWWWWWWKKW...',
    '..WWWWWWWWKKW...',
    '...WWWWWWWWWW...',
    '................',
  ],
  roadhopper: [
    '................',
    '...GG.....GG....',
    '..GGGG...GGGG...',
    '..GKGG...GGKG...',
    '..GGGGGGGGGGG...',
    '...GGGGGGGGG....',
    '..GGGGGGGGGGG...',
    '.GGgGGGGGGGgGG..',
    '.GG.GGGGGGG.GG..',
    '.GG.gGGGGGg.GG..',
    '.....GGGGG......',
    '..gGGGgggGGGg...',
    '..GGG..g..GGG...',
    '.GG..........GG.',
    '.GGG........GGG.',
    '................',
  ],
  retroracer: [
    '................',
    '.....CCCCCC.....',
    '....CCCCCCCC....',
    '..KK.CCCCCC.KK..',
    '..KKCCCCCCCCKK..',
    '..KK.CDDDDC.KK..',
    '.....CDddDC.....',
    '.....CCCCCC.....',
    '.....CCCCCC.....',
    '..KK.CCCCCC.KK..',
    '..KKCCCCCCCCKK..',
    '..KK.CCCCCC.KK..',
    '.....cccccc.....',
    '......Y..Y......',
    '................',
    '................',
  ],
  eggcatch: [
    '................',
    '.....WWW........',
    '....WWWWW.......',
    '....WWWWW.......',
    '.....WWW........',
    '................',
    '................',
    '.B..........B...',
    '.BB........BB...',
    '..BBBBBBBBBB....',
    '..bBBBBBBBBb....',
    '...BBBBBBBB.....',
    '...bBBBBBBb.....',
    '....BBBBBB......',
    '................',
    '................',
  ],
  spacedefenders: [
    '................',
    '...M......M.....',
    '....M....M......',
    '...MMMMMMMM.....',
    '..MMmMMMMmMM....',
    '.MMMMMMMMMMMM...',
    '.M.MMMMMMMM.M...',
    '.M.M......M.M...',
    '....mm..mm......',
    '................',
    '.......G........',
    '.......G........',
    '......GGG.......',
    '....GGGGGGG.....',
    '...GGGGGGGGG....',
    '...ggggggggg....',
  ],
  pixelwings: [
    '................',
    '......YYYY......',
    '.....YYYYYY.....',
    '....YYYYKYYY....',
    '....YYYYYYYY....',
    '..OOOYYYYYYYYO..',
    '.OOOOOYYYYYOO...',
    '..OOOYYYYYY.....',
    '....YYYYYyy.....',
    '.....yyyyy......',
    '................',
    '....w...........',
    '...w............',
    '..w.............',
    '................',
    '................',
  ],
  divesquadron: [
    '..R.............',
    '...R............',
    '..RRRR..........',
    '.RRRRRR.........',
    '..RRRR..R.......',
    '...RR..R........',
    '......RRRR......',
    '.....RRRRRR.....',
    '......RRRR......',
    '................',
    '................',
    '.......G........',
    '......GGG.......',
    '....GGGGGGG.....',
    '...GGGGGGGGG....',
    '...ggggggggg....',
  ],
  memorymatch: [
    '................',
    '..DDDDDD........',
    '..DwwwwD........',
    '..Dw..wD.WWWWWW.',
    '..Dw..wD.WMMMMW.',
    '..DwwwwD.WMWWMW.',
    '..DDDDDD.WMWWMW.',
    '..DwwwwD.WMMMMW.',
    '..Dw..wD.WWWWWW.',
    '..Dw..wD.WWWWWW.',
    '..DwwwwD.WWWWWW.',
    '..DDDDDD.WWWWWW.',
    '.........WWWWWW.',
    '.........WWWWWW.',
    '................',
    '................',
  ],
  tilefusion: [
    '................',
    '.YYYYYYYYYYYYY..',
    '.YYYYYYYYYYYYY..',
    '.YYyyyyyyyyYYY..',
    '.YYyKKKKKKyYYY..',
    '.YYyKKKKKyyYYY..',
    '.YYyyyyyKKyYYY..',
    '.YYYYYYyKKyYYY..',
    '.YYYYYyKKyyYYY..',
    '.YYYYyKKyYYYYY..',
    '.YYYyKKyYYYYYY..',
    '.YYyKKKKKKKyYY..',
    '.YYyKKKKKKKyYY..',
    '.YYYYYYYYYYYYY..',
    '.YYYYYYYYYYYYY..',
    '................',
  ],
  alleybowl: [
    '................',
    '....W..W..W.....',
    '...RWR.WR.WR....',
    '....W..W..W.....',
    '......W..W......',
    '.....RWR.WR.....',
    '......W..W......',
    '........W.......',
    '.......RWR......',
    '........W.......',
    '................',
    '................',
    '......CCCC......',
    '.....CCCCCC.....',
    '.....CCwCCC.....',
    '......CCCC......',
  ],
  // Battle City-style tank duel
  tankbattle: [
    '................',
    '......GG........',
    '......GG........',
    '..gg.GGGG.gg....',
    '..GGGGgGgGGG....',
    '..GGGGGGGGGG....',
    '..GGGGgKgGGG....',
    '..gg.GGGG.gg....',
    '................',
    '.........RR.....',
    '.....rr.RRRR.rr.',
    '.....RRRRrRrRRR.',
    '.....RRRRRRRRRR.',
    '.....RRRRrKrRRR.',
    '.....rr.RRRR.rr.',
    '................',
  ],
  // Girders, ladder, and a runaway barrel
  towerclimb: [
    '................',
    '..MMMMMMMMMMMM..',
    '.......CC.......',
    '....BB.CC.......',
    '...BbBBCC.......',
    '...BBBBCC.......',
    '....BB.CC.......',
    '..MMMMMMMMMMMM..',
    '.......CC.......',
    '.......CC..BB...',
    '.......CC.BbBB..',
    '.......CC.BBBB..',
    '.......CC..BB...',
    '..MMMMMMMMMMMM..',
    '................',
    '................',
  ],
  // Palm tree over a treasure pit
  jungledash: [
    '................',
    '....GG..GG......',
    '..GGgGGGgGGG....',
    '.GGGGGgGGGGGG...',
    '..GG..bb..GG....',
    '......bb........',
    '......bb........',
    '......bb........',
    '......bb........',
    '.....Ybb........',
    '....YYYb........',
    '..BBBBBBBBBB....',
    '..BbbbbbbbbB..KK',
    '..BBBBBBBBBBKKKK',
    '............KKKK',
    '................',
  ],
  // Round black bomb, lit fuse
  blastmaze: [
    '................',
    '..........YY....',
    '.........Y......',
    '........SS......',
    '.......KKKK.....',
    '.....KKKKKKKK...',
    '....KKKKKKKKKK..',
    '....KKWWKKKKKK..',
    '....KKWKKKKKKK..',
    '....KKKKKKKKKK..',
    '....KKKKKKKKKK..',
    '.....KKKKKKKK...',
    '.......KKKK.....',
    '................',
    '................',
    '................',
  ],
  // Rescue chopper lifting off
  chopperrescue: [
    '................',
    '..CCCCCCCCCCC...',
    '.......C........',
    '.......C........',
    '..C..CCCCCC.....',
    '..CC.CCKKCCC....',
    '..CCCCCKKCCCC...',
    '...CCCCCCCCCC...',
    '....cCCCCCCc....',
    '.....C....C.....',
    '....cccccccc....',
    '................',
    '....W.....W.....',
    '...WWW...WWW....',
    '....W.....W.....',
    '................',
  ],
  // Vampire bat under the moon
  vampirehunt: [
    '................',
    '...........WWW..',
    '..........WWWW..',
    '..........WWWW..',
    '...........WWW..',
    '.PP..........PP.',
    '.PPP...PP...PPP.',
    '.PPPP.PPPP.PPPP.',
    '.PPPPPPPPPPPPP..',
    '..PPPPPPPPPPPP..',
    '...PP.PPPP.PP...',
    '......PWWP......',
    '......P..P......',
    '................',
    '....SSSSSS......',
    '......SS........',
  ],
  // Mummy rising from the sarcophagus
  // Crate sliding onto a glowing target
  cratepush: [
    '................',
    '..BBBBBBBB......',
    '..BbBBBBbB......',
    '..BBbBBbBB......',
    '..BBBbbBBB......',
    '..BBBbbBBB......',
    '..BBbBBbBB......',
    '..BbBBBBbB......',
    '..BBBBBBBB......',
    '................',
    '...........GG...',
    '..........G..G..',
    '.........G....G.',
    '..........G..G..',
    '...........GG...',
    '................',
  ],
  // Nonogram grid, half deduced
  pixellogic: [
    '................',
    '..CC.C.CC.C.....',
    '................',
    '.C.GGGG..GG.....',
    '................',
    '.C.GG..GG.GG....',
    '................',
    '.C..GG.GGGG.....',
    '................',
    '.C.GG.GG..GG....',
    '................',
    '.C..GGGG.GG.....',
    '................',
    '................',
    '................',
    '................',
  ],
  // Warship in the crosshair
  // Four in a row!
  fourstack: [
    '................',
    '..DDDDDDDDDDDD..',
    '..D..D..D..D.D..',
    '..DYYD..DRRD.D..',
    '..DYYD..DRRD.D..',
    '..D..D..D..D.D..',
    '..DRRDYYD..D.D..',
    '..DRRDYYD..D.D..',
    '..D..D..D..D.D..',
    '..DYYDRRDYYD.D..',
    '..DYYDRRDYYD.D..',
    '..D..D..D..D.D..',
    '..DDDDDDDDDDDD..',
    '................',
    '................',
    '................',
  ],


  // Sliced watermelon mid-air
  fruitslice: [
    '................',
    '..CC............',
    '...CC...........',
    '....CC..........',
    '.....CC.........',
    '..GGGGGGGGGG....',
    '..GRRRRRRRRG....',
    '..GRRKRRKRRG....',
    '...GRRRRRRG.....',
    '....GRRRRG......',
    '.....GRRG.......',
    '......GG........',
    '..........CC....',
    '...........CC...',
    '............CC..',
    '................',
  ],
  // Bouncing critter and platforms
  skyjump: [
    '................',
    '....GGGGG.......',
    '................',
    '..........GGGG..',
    '................',
    '......MM.MM.....',
    '......MMMMM.....',
    '.....MMWKWMM....',
    '.....MMMMMMM....',
    '......MM.MM.....',
    '................',
    '..GGGGG.........',
    '................',
    '.........GGGGG..',
    '....YY..........',
    '...YYYY.........',
  ],
  // Pumpkin sprinting past tombstones
  ghostrun: [
    '................',
    '..WW......ww....',
    '.WWWW....wWWw...',
    '.WWWW....wWWw...',
    '.WWWW....wWWw...',
    '................',
    '......OO........',
    '....OOOOOO......',
    '...OOKOOKOO.....',
    '...OOOOOOOO.....',
    '...OOKKKKOO.....',
    '....OOOOOO......',
    '.....O..O.......',
    '....OO..OO......',
    '..YY........YY..',
    '................',
  ],
  // Crosshair on a fleeing ghost
  ghosthunt: [
    '................',
    '.......RR.......',
    '.......RR.......',
    '................',
    '....WWWWWW......',
    '...WWWWWWWW.....',
    '...WKWWWWKW.....',
    '.RRWWWWWWWWRR...',
    '...WWWWWWWW.....',
    '...WWWWWWWW.....',
    '...WW.WW.WW.....',
    '................',
    '.......RR.......',
    '.......RR.......',
    '................',
    '................',
  ],
  // Slingshot pumpkin at a bone fort
  pumpkintoss: [
    '................',
    '...........WWW..',
    '...........WwW..',
    '.....OO....WWW..',
    '....OOOO...W.W..',
    '....OOOO...WWW..',
    '.....OO....WwW..',
    '..B........WWW..',
    '..B........WWW..',
    '.BBB.......W.W..',
    '..B........WWW..',
    '..B.............',
    '..B.............',
    '.BBB............',
    '................',
    '................',
  ],
  // Grinning monster tiles in a row
  monstermatch: [
    '................',
    '..PPPP..GGGG....',
    '..PWPW..GKGK....',
    '..PPPP..GGGG....',
    '..PpPp..GgGg....',
    '................',
    '..OOOO..CCCC....',
    '..OKOK..CKCK....',
    '..OOOO..CCCC....',
    '..OoOo..CcCc....',
    '................',
    '..RRRR..PPPP....',
    '..RWRW..PWPW....',
    '..RRRR..PPPP....',
    '..RrRr..PpPp....',
    '................',
  ],
  // Falling tetromino into a stacked well
  blockdrop: [
    '................',
    '......PP........',
    '......PP........',
    '......PPPP......',
    '................',
    '................',
    '................',
    '................',
    '.CC.........YY..',
    '.CC....GG...YY..',
    '.CCRR..GG.OOYY..',
    '.CCRRGGGGOOOYY..',
    '.CCRRGGGGOOOYY..',
    '.CCRRRRGGOOOYY..',
    '................',
    '................',
  ],

};

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

mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const [id, rows] of Object.entries(SPRITES)) {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) {
    console.error(`❌ ${id}: sprite must be 16×16 (got ${rows.length} rows: ${rows.map((r) => r.length).join(',')})`);
    bad++;
    continue;
  }
  const img = png(16 * SCALE, (x, y) => {
    const ch = rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    if (!(ch in PAL)) return [255, 0, 255, 255]; // magenta = unknown palette char
    return PAL[ch] ?? [0, 0, 0, 0]; // '.' = transparent
  });
  writeFileSync(join(OUT, `${id}.png`), img);
}
if (bad > 0) process.exit(1);
console.log(`✅ ${Object.keys(SPRITES).length} game sprites written to assets/games/`);
