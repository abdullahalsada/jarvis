import type { Tone, WaveForm } from './synth';

/**
 * A signature start jingle for every game — each one a tiny original chiptune
 * motif in the handheld-LCD spirit, so games greet you with their own voice
 * (the racer revs, the hens cluck, the haunted maze wobbles…). Composed as
 * note lists and rendered by the same synth as the sfx bank; nothing sampled.
 */
const note = (midi: number, duration: number, wave: WaveForm = 'square', volume = 0.5): Tone => ({
  freq: Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100,
  duration,
  wave,
  volume,
});

const slide = (
  freq: number,
  freqEnd: number,
  duration: number,
  wave: WaveForm = 'square',
  volume = 0.5
): Tone => ({ freq, freqEnd, duration, wave, volume });

export const GAME_JINGLES: Record<string, Tone[]> = {
  // ─── Classics ───
  // Rising minor arpeggio — the hungry serpent uncoils.
  snake: [note(57, 0.09), note(60, 0.09), note(64, 0.09), note(69, 0.2)],
  // Two paddle pings and a high serve.
  brickbreaker: [note(69, 0.08), note(76, 0.08), note(69, 0.08), note(81, 0.18)],
  // Slow rally: left… right… left-right!
  paddleduel: [note(64, 0.12), note(71, 0.12), note(64, 0.07), note(71, 0.16)],
  // Four falling steps, like a piece dropping into place.
  neonstack: [note(76, 0.09), note(74, 0.09), note(72, 0.09), note(67, 0.2)],
  // Gentle card-table waltz in triangle voice.
  solitaire: [note(60, 0.12, 'triangle'), note(64, 0.12, 'triangle'), note(67, 0.12, 'triangle'), note(72, 0.24, 'triangle')],
  // Froggy fourths — hop, hop, big leap.
  roadhopper: [note(62, 0.09), note(67, 0.09), note(62, 0.09), note(74, 0.18)],
  // Engine rev-up and away.
  retroracer: [slide(80, 220, 0.18), slide(110, 320, 0.18), slide(160, 640, 0.28)],
  // Slow triangle descent onto the pad.
  moonlander: [note(76, 0.14, 'triangle'), note(72, 0.14, 'triangle'), note(69, 0.14, 'triangle'), note(57, 0.26, 'triangle')],
  // Staccato clucks and a proud little crow.
  eggcatch: [note(72, 0.06), note(72, 0.06), note(76, 0.06), note(79, 0.16)],
  // The ball rolls low… and strikes.
  alleybowl: [slide(180, 90, 0.3, 'triangle'), note(45, 0.08), { freq: 400, freqEnd: 120, duration: 0.18, wave: 'noise', volume: 0.5 }],

  // ─── Action ───
  // Four-note descending invader march.
  spacedefenders: [note(52, 0.13), note(50, 0.13), note(48, 0.13), note(45, 0.2)],
  // Proximity alarm, then engines up.
  meteordodge: [note(69, 0.09), note(63, 0.09), note(69, 0.09), slide(220, 880, 0.2)],
  // Sparse open fifths adrift in space.
  astroshards: [note(57, 0.12, 'triangle'), note(64, 0.12, 'triangle'), note(69, 0.24, 'triangle')],
  // Cheeky up-up trill — wings ready.
  pixelwings: [note(76, 0.06), note(79, 0.06), note(76, 0.06), note(83, 0.14)],
  // Pickaxe clink-clink, gem glitter.
  gemdigger: [note(88, 0.05), note(52, 0.09), note(88, 0.05), note(52, 0.09), note(93, 0.16)],
  // Air-raid siren sweep.
  skyshield: [slide(330, 660, 0.22), slide(660, 330, 0.22), note(76, 0.14)],
  // Dive-bomb down, pull up!
  divesquadron: [slide(880, 220, 0.22), slide(220, 660, 0.18), note(81, 0.12)],
  // A staircase of hops up the pyramid.
  pyramidhop: [note(60, 0.08), note(62, 0.08), note(64, 0.08), note(65, 0.08), note(67, 0.16)],
  // Low bouncy groove over the dunes.
  moonbuggy: [note(45, 0.1), note(52, 0.1), note(45, 0.1), note(57, 0.18)],

  // ─── Spooky ───
  // Chromatic wobble from the crypt.
  hauntedmaze: [note(58, 0.12, 'triangle'), note(59, 0.12, 'triangle'), note(58, 0.12, 'triangle'), note(53, 0.24, 'triangle')],
  // A hesitant minor-second question mark.
  ghostsweeper: [note(64, 0.14, 'triangle'), note(65, 0.14, 'triangle'), note(64, 0.2, 'triangle')],
  // A groan rising from below.
  zombiebop: [slide(70, 140, 0.3, 'triangle', 0.6), note(50, 0.1), note(55, 0.16)],
  // Fast skittering legs.
  creepycrawler: [note(79, 0.05), note(77, 0.05), note(79, 0.05), note(77, 0.05), note(72, 0.14)],
  // Carnival shooting-gallery flourish.
  spookshoot: [note(67, 0.08), note(72, 0.08), note(76, 0.08), note(72, 0.08), note(79, 0.16)],

  // ─── Brain ───
  // Flip… flip… match!
  memorymatch: [note(72, 0.09), note(72, 0.09), note(79, 0.2)],
  // The four classic pad tones in a row.
  simonecho: [note(67, 0.11, 'triangle'), note(64, 0.11, 'triangle'), note(60, 0.11, 'triangle'), note(55, 0.18, 'triangle')],
  // A number and its double.
  tilefusion: [note(60, 0.1), note(72, 0.1), note(60, 0.07), note(72, 0.18)],
  // Tiles glissing into place.
  slidefifteen: [slide(523, 784, 0.12, 'triangle'), slide(784, 659, 0.12, 'triangle'), note(76, 0.14, 'triangle')],
  // Switches clicking on, one by one.
  neonlights: [note(72, 0.06), note(76, 0.06), note(79, 0.06), note(84, 0.16)],
  // Sparkling falling thirds.
  gemcolumns: [note(88, 0.08), note(84, 0.08), note(81, 0.08), note(76, 0.18)],
};
