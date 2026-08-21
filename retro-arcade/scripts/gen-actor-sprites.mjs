#!/usr/bin/env node
/**
 * 🎭 Generates the in-game actor sprites (frogs, cars, landers, pins…) as
 * transparent PNGs in assets/actors/ — 16× scale so they stay crisp when the
 * games scale them down. All artwork is original. Rerun after editing a map:
 *
 *   node scripts/gen-actor-sprites.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'actors');
const SCALE = 16;

const PAL = {
  '.': null,
  G: [0x39, 0xff, 0x14, 255], g: [0x2b, 0xcc, 0x10, 255],
  C: [0x00, 0xff, 0xf7, 255], c: [0x00, 0xb3, 0xae, 255],
  M: [0xff, 0x20, 0x79, 255], m: [0xc4, 0x15, 0x5c, 255],
  Y: [0xff, 0xe6, 0x00, 255], y: [0xb3, 0xa1, 0x00, 255],
  O: [0xff, 0x9f, 0x1c, 255], o: [0xc4, 0x72, 0x07, 255],
  R: [0xff, 0x3b, 0x3b, 255], r: [0xb3, 0x22, 0x22, 255],
  W: [0xe8, 0xe8, 0xf0, 255], w: [0x9a, 0x9a, 0xb5, 255],
  D: [0x2a, 0x2a, 0x45, 255], d: [0x1b, 0x1b, 0x30, 255],
  B: [0x8a, 0x5a, 0x2b, 255], b: [0x5e, 0x3d, 0x1c, 255],
  K: [0x10, 0x10, 0x18, 255],
  S: [0xc0, 0xc0, 0xd2, 255], // silver
  F: [0xff, 0xff, 0xff, 255], // pure white
};

// Color-templated sprites: X = body color, x = shade. Literal maps keep the
// row widths honest; colors are substituted per variant.
const tint = (rows, BODY, SHADE) =>
  rows.map((r) => r.replaceAll('X', BODY).replaceAll('x', SHADE));

// Compact side-view car (1 lane cell).
const CAR_SIDE = [
  '................',
  '................',
  '................',
  '................',
  '.....XXXXXX.....',
  '....XKKXXKKX....',
  '..XXXKKXXKKXXX..',
  '.XXXXXXXXXXXXXX.',
  '.xxxxxxxxxxxxxx.',
  '..KKK......KKK..',
  '..KwK......KwK..',
  '...K........K...',
  '................',
  '................',
  '................',
  '................',
];
const carSide = (B, S) => tint(CAR_SIDE, B, S);

// Long truck (2 lane cells, 32×16): box in front, cab on the right.
const TRUCK_SIDE = [
  '................................',
  '................................',
  '................................',
  '................................',
  '..XXXXXXXXXXXXXXXXXXXX....XXXX..',
  '..XXXXXXXXXXXXXXXXXXXX...XKKX...',
  '..xxxxxxxxxxxxxxxxxxxx..XXKKXX..',
  '..xxxxxxxxxxxxxxxxxxxx.XXXXXXX..',
  '.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.',
  '....KKK...KKK.......KKK..KKK....',
  '....KwK...KwK.......KwK..KwK....',
  '.....K.....K.........K....K.....',
  '................................',
  '................................',
  '................................',
  '................................',
];
const truckSide = (B, S) => tint(TRUCK_SIDE, B, S);

// Top-view race car (nose up) — F1 silhouette with four tires.
const CAR_TOP = [
  '................',
  '.......KK.......',
  '......XXXX......',
  '......XXXX......',
  '..KK..XXXX..KK..',
  '..KKXXXXXXXXKK..',
  '..KKXXxxxxXXKK..',
  '....XXxKKxXX....',
  '....XXxKKxXX....',
  '....XXXXXXXX....',
  '..KKXXXXXXXXKK..',
  '..KKXXXXXXXXKK..',
  '..KK.xxxxxx.KK..',
  '................',
  '................',
  '................',
];
const carTop = (B, S) => tint(CAR_TOP, B, S);

// Top-view civilian sedan (nose up): windshield, roof, rear window, 4 tires.
const SEDAN_TOP = [
  '................',
  '................',
  '.....XXXXXX.....',
  '....XXXXXXXX....',
  '..KKXXXXXXXXKK..',
  '..KKXxxxxxxXKK..',
  '....XKKKKKKX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XKKKKKKX....',
  '..KKXXXXXXXXKK..',
  '..KKXxxxxxxXKK..',
  '....xxxxxxxx....',
  '................',
  '................',
  '................',
];
const sedanTop = (B, S) => tint(SEDAN_TOP, B, S);

// Yellow cab: checkerboard band across the roof.
const TAXI_TOP = [
  '................',
  '................',
  '.....YYYYYY.....',
  '....YYYYYYYY....',
  '..KKYYYYYYYYKK..',
  '..KKYyyyyyyYKK..',
  '....YKKKKKKY....',
  '....WKWKWKWK....',
  '....KWKWKWKW....',
  '....YKKKKKKY....',
  '..KKYYYYYYYYKK..',
  '..KKYyyyyyyYKK..',
  '....yyyyyyyy....',
  '................',
  '................',
  '................',
];

// Boxy 4x4 with roof-rack rails running front to back.
const SUV_TOP = [
  '................',
  '................',
  '....GGGGGGGG....',
  '....GGGGGGGG....',
  '..KKGGGGGGGGKK..',
  '..KKGKKKKKKGKK..',
  '....GgGGGGgG....',
  '....GgGGGGgG....',
  '....GgGGGGgG....',
  '....GKKKKKKG....',
  '..KKGGGGGGGGKK..',
  '..KKGggggggGKK..',
  '....gggggggg....',
  '................',
  '................',
  '................',
];

// Pickup: cab up front, open dark bed behind.
const PICKUP_TOP = [
  '................',
  '................',
  '....OOOOOOOO....',
  '....OOOOOOOO....',
  '..KKOOOOOOOOKK..',
  '..KKOKKKKKKOKK..',
  '....OOOOOOOO....',
  '....OooooooO....',
  '....OoKKKKoO....',
  '....OoKKKKoO....',
  '..KKOoKKKKoOKK..',
  '..KKOooooooOKK..',
  '....oooooooo....',
  '................',
  '................',
  '................',
];

// City bus (16×24, fills 1.5 car lengths): roof panels + sunroofs.
const BUS_TOP = [
  '................',
  '....RRRRRRRR....',
  '...RRRRRRRRRR...',
  '..KKRRRRRRRRKK..',
  '..KKRKKKKKKRKK..',
  '....RWWWWWWR....',
  '....RWWWWWWR....',
  '....RrrrrrrR....',
  '....RWWWWWWR....',
  '....RWWWWWWR....',
  '....RrrrrrrR....',
  '....RWWWWWWR....',
  '....RWWWWWWR....',
  '..KKRrrrrrrRKK..',
  '..KKRWWWWWWRKK..',
  '....RWWWWWWR....',
  '....RrrrrrrR....',
  '....RWWWWWWR....',
  '....RWWWWWWR....',
  '....RKKKKKKR....',
  '..KKRRRRRRRRKK..',
  '..KKRrrrrrrRKK..',
  '....rrrrrrrr....',
  '................',
];

// The player's machine (16×24 — drawn at the in-game 1:1.5 aspect so nothing
// stretches): cyan F1 with front/rear wings, white stripe, open cockpit.
const PLAYER_RACER = [
  '................',
  '.......CC.......',
  '.......CC.......',
  '..CCCCCCCCCCCC..',
  '..cc..CCCC..cc..',
  '.KKK..CFFC..KKK.',
  '.KKK.CCFFCC.KKK.',
  '.KKKCCCFFCCCKKK.',
  '..CCCCCFFCCCCC..',
  '..CCCCcKKcCCCC..',
  '..CCCCcKKcCCCC..',
  '..CCCCcKKcCCCC..',
  '..cCCCCFFCCCCc..',
  '...CCCCFFCCCC...',
  '...CCCCFFCCCC...',
  '.KKKCCCFFCCCKKK.',
  '.KKKCCCFFCCCKKK.',
  '.KKKCCCFFCCCKKK.',
  '..cccCCFFCCccc..',
  '..cccccccccccc..',
  '................',
  '................',
  '................',
  '................',
];

const SPRITES = {
  // ─── Road Hopper ───
  frog: [
    '................',
    '................',
    '..gg........gg..',
    '.gKWg......gWKg.',
    '.gKWgGGGGGGgWKg.',
    '..ggGGGGGGGGgg..',
    '...GGgGGGGgGG...',
    '...GGGGGGGGGG...',
    '...GGGGGGGGGG...',
    '..gGGGGGGGGGGg..',
    '.gg.GGgGGgGG.gg.',
    '.g..gGGGGGGg..g.',
    '....gg....gg....',
    '...gg......gg...',
    '................',
    '................',
  ],
  car_side_yellow: carSide('Y', 'y'),
  car_side_cyan: carSide('C', 'c'),
  car_side_magenta: carSide('M', 'm'),
  car_side_orange: carSide('O', 'o'),
  car_side_red: carSide('R', 'r'),
  truck_side_yellow: truckSide('Y', 'y'),
  truck_side_magenta: truckSide('M', 'm'),
  truck_side_red: truckSide('R', 'r'),

  // ─── Retro Racer ───
  racecar_cyan: carTop('C', 'c'),
  racecar_red: carTop('R', 'r'),
  racecar_yellow: carTop('Y', 'y'),
  racecar_magenta: carTop('M', 'm'),
  racecar_orange: carTop('O', 'o'),
  player_racer: PLAYER_RACER,
  taxi_top: TAXI_TOP,
  suv_top: SUV_TOP,
  pickup_top: PICKUP_TOP,
  bus_top: BUS_TOP,
  sedan_top_magenta: sedanTop('M', 'm'),
  sedan_top_white: sedanTop('W', 'w'),

  // ─── Tank Battle ───
  // Top-view tank (nose up), tintable per side.
  tank_green: tint([
    '................',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '..xx..XXXX..xx..',
    '..XX.XXXXXX.XX..',
    '..XXXXxXXxXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXxKKxXXXX..',
    '..XXXXxKKxXXXX..',
    '..XXXXXXXXXXXX..',
    '..XX.xxxxxx.XX..',
    '..xx..xxxx..xx..',
    '................',
    '................',
    '................',
  ], 'G', 'g'),
  tank_red: tint([
    '................',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '..xx..XXXX..xx..',
    '..XX.XXXXXX.XX..',
    '..XXXXxXXxXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXxKKxXXXX..',
    '..XXXXxKKxXXXX..',
    '..XXXXXXXXXXXX..',
    '..XX.xxxxxx.XX..',
    '..xx..xxxx..xx..',
    '................',
    '................',
    '................',
  ], 'R', 'r'),

  // ─── Tower Climb / Jungle Dash ───
  // Little climber hero in overalls, facing forward.
  climber: [
    '................',
    '.....RRRR.......',
    '....RRRRRR......',
    '....FFwFFw......',
    '....FFFFFF......',
    '.....FFFF.......',
    '...CCCCCCCC.....',
    '..FCCCCCCCCF....',
    '..FCCcCCcCCF....',
    '....CCCCCC......',
    '....cc..cc......',
    '....CC..CC......',
    '...KK....KK.....',
    '................',
    '................',
    '................',
  ],
  // Grumpy barrel-throwing ape for the tower top.
  ape: [
    '................',
    '...BBB....BBB...',
    '..BBBBBBBBBBBB..',
    '..BBWKBBBBKWBB..',
    '..BBBBBbbBBBBB..',
    '...BBbBBBBbBB...',
    '...BBBBBBBBBB...',
    '..BBBBBBBBBBBB..',
    '.BBbBBBBBBBBbBB.',
    '.BBbBBBBBBBBbBB.',
    '..BBBBBBBBBBBB..',
    '...bb.BBBB.bb...',
    '......bBBb......',
    '.....BB..BB.....',
    '................',
    '................',
  ],

  // ─── Chopper Rescue ───
  // Side-view rescue helicopter facing right.
  chopper: [
    '................',
    '..CCCCCCCCCCCC..',
    '.......CC.......',
    '.......CC.......',
    '..C..CCCCCCC....',
    '..CC.CCKKCCCC...',
    '..CCCCCKKCCCCC..',
    '...CCCCCCCCCCC..',
    '....cCCCCCCCc...',
    '.....CC..CC.....',
    '....cccccccc....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Vampire Hunt ───
  // Dagger-throwing hunter in a red cloak, facing right.
  hunter: [
    '................',
    '.....KKKK.......',
    '....KKKKKK......',
    '....FFwFFF......',
    '....FFFFF.......',
    '.....FFF........',
    '...RRRRRRR......',
    '..RRRRRRRRRF....',
    '..RRrRRrRRRF....',
    '..RRRRRRRR......',
    '...RRRRRR.......',
    '....rr.rr.......',
    '...KK...KK......',
    '................',
    '................',
    '................',
  ],

  // ─── Mummy's Tomb ───
  // Shambling bandaged mummy.
  mummy: [
    '................',
    '.....WWWW.......',
    '....WwWWwW......',
    '....WKWWKW......',
    '....WWwWWW......',
    '.....WWWW.......',
    '...WWwWWwWW.....',
    '..WWWWWWWWWW....',
    '..WwWWwWWwWW....',
    '..WWWWWWWWWW....',
    '...WwWWWwWW.....',
    '....WW..WW......',
    '....Ww..wW......',
    '...WW....WW.....',
    '................',
    '................',
  ],

  // ─── Pumpkin Toss ───
  // Rattling skeleton guard.
  skeleton: [
    '................',
    '.....FFFF.......',
    '....FFFFFF......',
    '....FKFFKF......',
    '....FFFFFF......',
    '.....FwwF.......',
    '......FF........',
    '...FFFFFFFF.....',
    '....wFFFFw......',
    '....F.FF.F......',
    '...FF.FF.FF.....',
    '......FF........',
    '.....F..F.......',
    '.....F..F.......',
    '....FF..FF......',
    '................',
  ],

  // ─── Shooter upgrades (Space Defenders / Dive Squadron) ───
  // Mk2 fighter: winged interceptor with twin cannons.
  ship_mk2: [
    '................',
    '.......CC.......',
    '.......CC.......',
    '......CFFC......',
    '......CFFC......',
    '..YY..CCCC..YY..',
    '..YY.CCCCCC.YY..',
    '..YYCCCCCCCCYY..',
    '..CCCCCFFCCCCC..',
    '.CCCCCCFFCCCCCC.',
    '.CCcCCCFFCCCcCC.',
    '.CC.cCCFFCCc.CC.',
    '.YY..cCCCCc..YY.',
    '.....OO..OO.....',
    '................',
    '................',
  ],
  // Mk3 fighter: heavy assault wings, gold core.
  ship_mk3: [
    '................',
    '.......MM.......',
    '......MFFM......',
    '......MFFM......',
    '..M...MMMM...M..',
    '..MM.MMMMMM.MM..',
    '..MMMMMYYMMMMM..',
    '.MMMMMMYYMMMMMM.',
    '.MMYMMMYYMMMYMM.',
    '.MMYMMmYYmMMYMM.',
    '.MMMMMmYYmMMMMM.',
    '..mm.MMMMMM.mm..',
    '.....MMmmMM.....',
    '....OO....OO....',
    '................',
    '................',
  ],
  // Final boss: broad mothership saucer with dome, lights, and landing struts.
  boss_saucer: [
    '................................',
    '.............WWWWWW.............',
    '...........WWCCCCCCWW...........',
    '..........WCCCCCCCCCCW..........',
    '..........WCCKKCCKKCCW..........',
    '.......MMMMMMMMMMMMMMMMMM.......',
    '.....MMMMMMMMMMMMMMMMMMMMMM.....',
    '..MMMMMMMMMMMMMMMMMMMMMMMMMMMM..',
    '.MMYYMMMMYYMMMMYYMMMMYYMMMMYYMM.',
    '.mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm.',
    '..mmmmmmmmmmmmmmmmmmmmmmmmmmmm..',
    '....mm.....mm......mm.....mm....',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  // ─── Moon Lander ───
  lander: [
    '................',
    '......SSSS......',
    '.....SWWSSS.....',
    '....SWWSSSSS....',
    '....SSSSSSSS....',
    '.....OOOOOO.....',
    '....OOYYYYOO....',
    '....OOOOOOOO....',
    '....oOOOOOOo....',
    '.....oooooo.....',
    '....S..SS..S....',
    '...S...SS...S...',
    '..SS...SS...SS..',
    '.SSS........SSS.',
    '................',
    '................',
  ],

  // ─── Egg Catch ───
  hen: [
    '................',
    '.....RR.........',
    '....RRRR........',
    '....FFFFF.......',
    '...FFKFFF.......',
    '...FFFFFOO......',
    '....FFFFF.......',
    '..FFFFFFFF......',
    '.FFFFFFFFFF.....',
    '.FFFFFFFFFFF....',
    '.wFFFFFFFFFF....',
    '..FFFFFFFFF.....',
    '...FFFFFFF......',
    '.....OO..OO.....',
    '.....OO..OO.....',
    '................',
  ],
  egg: [
    '................',
    '................',
    '................',
    '......FFFF......',
    '.....FFFFFF.....',
    '....FFWFFFFF....',
    '....FWFFFFFF....',
    '....FFFFFFFF....',
    '....FFFFFFFF....',
    '....wFFFFFFw....',
    '.....wFFFFw.....',
    '......wwww......',
    '................',
    '................',
    '................',
    '................',
  ],
  basket: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.BBBBBBBBBBBBBB.',
    '.BbBBbBBbBBbBBB.',
    '..BBbBBbBBbBBb..',
    '..bBBbBBbBBbBB..',
    '...BbBBbBBbBB...',
    '...bBBbBBbBBb...',
    '....bbbbbbbb....',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Space Defenders ───
  invader_magenta: tint(
    [
      '................',
      '................',
      '....X......X....',
      '.....X....X.....',
      '....XXXXXXXX....',
      '...XXxXXXXxXX...',
      '..XXXXXXXXXXXX..',
      '..X.XXXXXXXX.X..',
      '..X.X......X.X..',
      '.....XX..XX.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], 'M', 'K'),
  invader_cyan: tint(
    [
      '................',
      '................',
      '......XXXX......',
      '...XXXXXXXXXX...',
      '..XXxXXXXXXxXX..',
      '..XXXXXXXXXXXX..',
      '....XX.XX.XX....',
      '...X..X..X..X...',
      '..X..X....X..X..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], 'C', 'K'),
  cannon: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......GG.......',
    '.......GG.......',
    '......GGGG......',
    '......GGGG......',
    '..GGGGGGGGGGGG..',
    '.GGGGGGGGGGGGGG.',
    '.GGGGGGGGGGGGGG.',
    '.gggggggggggggg.',
    '................',
    '................',
    '................',
  ],

  // ─── Meteor Dodge / Astro Shards ───
  rocket: [
    '................',
    '.......CC.......',
    '......CCCC......',
    '......CWWC......',
    '......CWWC......',
    '.....CCCCCC.....',
    '.....CCCCCC.....',
    '.....CcCCcC.....',
    '....CCcCCcCC....',
    '....CCCCCCCC....',
    '...CC.CCCC.CC...',
    '...C..cCCc..C...',
    '......OOOO......',
    '.......YY.......',
    '................',
    '................',
  ],
  meteor: [
    '................',
    '.....wwww.......',
    '...wwwwwwww.....',
    '..wwwSSwwwww....',
    '..wSSSSwwwwww...',
    '.wwSSSwwwwKKww..',
    '.wwwwwwwwwKKww..',
    '.wwwwwKwwwwwww..',
    '.wwwwwwwwwwwww..',
    '..wwKKwwwwSSw...',
    '..wwKKwwwSSww...',
    '...wwwwwwwww....',
    '.....wwwww......',
    '................',
    '................',
    '................',
  ],

  // ─── Pixel Wings ───
  bird: [
    '................',
    '................',
    '................',
    '......YYYY......',
    '.....YYYYYY.....',
    '....YYYKWYYY....',
    '.OOOYYYYYYYYOO..',
    '..OOOYYYYYYYOOO.',
    '...OOYYYYYYYY...',
    '.....YYYYYYY....',
    '......YYYYY.....',
    '.......OO.......',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Gem Digger ───
  miner: [
    '................',
    '.....YYYYYY.....',
    '....YYYYYYYY....',
    '....YyyyyyyY....',
    '....WWWWWWWW....',
    '....WKWWWWKW....',
    '....WWWWWWWW....',
    '.....WWwwWW.....',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '..OOOOOOOOOOOO..',
    '....OOOOOOOO....',
    '....OO....OO....',
    '....bb....bb....',
    '................',
    '................',
  ],
  gemstone: [
    '................',
    '................',
    '................',
    '....CCCCCCCC....',
    '...CWCCCCCCCC...',
    '..CWCCCCCCCCCC..',
    '..CCCCCCCCCCcC..',
    '...CCCCCCCCcC...',
    '....CCCCCCcC....',
    '.....CCCCcC.....',
    '......CCcC......',
    '.......Cc.......',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Dive Squadron ───
  plane_enemy: [
    '................',
    '................',
    '................',
    '.......MM.......',
    '.......MM.......',
    '..MM..mMMm..MM..',
    '..MMMMMMMMMMMM..',
    '..mmMMMMMMMMmm..',
    '.....MMMMMM.....',
    '......mMMm......',
    '.......MM.......',
    '......M..M......',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Pyramid Hop ───
  hopper: [
    '................',
    '................',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '..OOWWOOOOWWOO..',
    '..OOWKOOOOKWOO..',
    '..OOOOOOOOOOOO..',
    '..OOOOOOOOOOOO..',
    '...OOOOOOOOOO...',
    '....OOOOOOOO....',
    '.....O....O.....',
    '....oo....oo....',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Moon Buggy ───
  buggy: [
    '................',
    '................',
    '................',
    '................',
    '......CCCC......',
    '.....CWWCCC.....',
    '..CCCCCCCCCCCC..',
    '.CCCCCCCCCCCCCC.',
    '.cccccccccccccc.',
    '..KKK..KK..KKK..',
    '.KKKKK.KK.KKKKK.',
    '.KwKwK....KwKwK.',
    '..KKK......KKK..',
    '................',
    '................',
    '................',
  ],

  // ─── Spooky room ───
  ghost_magenta: tint(
    [
      '................',
      '.....XXXXXX.....',
      '....XXXXXXXX....',
      '...XXXXXXXXXX...',
      '...XWWXXXXWWX...',
      '...XWKXXXXKWX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XX.XXXX.XX...',
      '...X...XX...X...',
      '................',
      '................',
      '................',
    ], 'M', 'K'),
  ghost_cyan: tint(
    [
      '................',
      '.....XXXXXX.....',
      '....XXXXXXXX....',
      '...XXXXXXXXXX...',
      '...XWWXXXXWWX...',
      '...XWKXXXXKWX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XXXXXXXXXX...',
      '...XX.XXXX.XX...',
      '...X...XX...X...',
      '................',
      '................',
      '................',
    ], 'C', 'K'),
  pumpkin: [
    '................',
    '.......gg.......',
    '......gg........',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '..OOOOOOOOOOOO..',
    '..OOKKOOOOKKOO..',
    '..OOOKOOOOKOOO..',
    '..OOOOOOOOOOOO..',
    '..OOKOOKKOOKOO..',
    '..OOOKKOOKKOOO..',
    '...OOOOOOOOOO...',
    '....OOOOOOOO....',
    '................',
    '................',
    '................',
  ],
  zombie: [
    '................',
    '....gggggggg....',
    '...gggggggggg...',
    '...ggGGGGGGgg...',
    '...GGGGGGGGGG...',
    '...GWWGGGGWWG...',
    '...GKWGGGGWKG...',
    '...GGGGGGGGGG...',
    '...GGGKKKKGGG...',
    '...GGKWKWKKGG...',
    '...GGGKKKKGGG...',
    '....GGGGGGGG....',
    '................',
    '................',
    '................',
    '................',
  ],
  bat: [
    '................',
    '................',
    '................',
    '................',
    '.PP..........PP.',
    '.PPP..PPPP..PPP.',
    '.PPPPPPPPPPPPPP.',
    '..PPPPPPPPPPPP..',
    '...PPWKPPKWPP...',
    '....PPPPPPPP....',
    '.....PP..PP.....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  crawler_head: [
    '................',
    '................',
    '....GGGGGGGG....',
    '...GGGGGGGGGG...',
    '..GGWWGGGGWWGG..',
    '..GGWKGGGGKWGG..',
    '..GGGGGGGGGGGG..',
    '..GGGGGGGGGGGG..',
    '..GgGGGGGGGGgG..',
    '...GGGGGGGGGG...',
    '....GGGGGGGG....',
    '...g..g..g..g...',
    '................',
    '................',
    '................',
    '................',
  ],
  mushroom: [
    '................',
    '................',
    '................',
    '.....RRRRRR.....',
    '....RRWWRRRR....',
    '...RRWWRRRRRR...',
    '...RRRRRRWWRR...',
    '...RRRRRRWWRR...',
    '...rrrrrrrrrr...',
    '.....WWWWWW.....',
    '.....WWWWWW.....',
    '.....wWWWWw.....',
    '................',
    '................',
    '................',
    '................',
  ],

  // ─── Alley Bowl ───
  pin: [
    '................',
    '......FFFF......',
    '.....FFFFFF.....',
    '.....FFFFFF.....',
    '......FFFF......',
    '......RRRR......',
    '......FFFF......',
    '.....FFFFFF.....',
    '....FFFFFFFF....',
    '...FFFFFFFFFF...',
    '...FFFFFFFFFF...',
    '...FFFFFFFFww...',
    '...FFFFFFFFww...',
    '....wFFFFFFw....',
    '.....wwwwww.....',
    '................',
  ],
};

// ─── Minimal PNG encoder (shared style; supports non-square) ────────────────
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
function png(w, h, pixelAt) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = y * (1 + w * 4) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
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
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w)) {
    console.error(`❌ ${id}: ragged rows (${rows.map((r) => r.length).join(',')})`);
    bad++;
    continue;
  }
  const img = png(w * SCALE, rows.length * SCALE, (x, y) => {
    const ch = rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    if (!(ch in PAL)) return [255, 0, 255, 255];
    return PAL[ch] ?? [0, 0, 0, 0];
  });
  writeFileSync(join(OUT, `${id}.png`), img);
}
if (bad > 0) process.exit(1);
console.log(`✅ ${Object.keys(SPRITES).length} actor sprites written to assets/actors/`);
