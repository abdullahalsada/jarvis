/**
 * Cross-game progression: every game maps its score onto levels (each game
 * has its own step so pacing feels right whether a point means one egg or a
 * 100-point dive-bomber), every 3rd level is a coin-doubling BONUS ROUND, and
 * runs pay out coins. Reaching level 3 / 6 / 9 in a game earns its bronze /
 * silver / gold trophy — shown in the Hall of Records.
 */
export const DEFAULT_STEP = 100;

/** Score needed per level, tuned to each game's scoring scale. */
export const LEVEL_STEPS: Record<string, number> = {
  // Classics
  snake: 50,
  brickbreaker: 200,
  paddleduel: 2,
  neonstack: 300,
  solitaire: 60,
  roadhopper: 150,
  retroracer: 150,
  tankbattle: 300,
  eggcatch: 10,
  alleybowl: 60,
  // Action
  spacedefenders: 500,
  fruitslice: 200,
  towerclimb: 300,
  pixelwings: 5,
  jungledash: 250,
  blastmaze: 300,
  divesquadron: 800,
  chopperrescue: 400,
  skyjump: 250,
  // Street Games
  streetrun: 300,
  pigeonpanic: 200,
  balloonfight: 350,
  marblematch: 500,
  canknock: 300,
  // School Days
  binshot: 100,
  paperglider: 200,
  dotsboxes: 150,
  eraserflick: 200,
  mathsprint: 250,
  // Brain
  memorymatch: 60,
  cratepush: 120,
  tilefusion: 400,
  pixellogic: 100,
  blockdrop: 400,
  fourstack: 150,
};

export function levelForScore(gameId: string, score: number): number {
  const step = LEVEL_STEPS[gameId] ?? DEFAULT_STEP;
  return 1 + Math.floor(Math.max(0, score) / step);
}

/** Levels 3, 6, 9… are bonus rounds: coins earned there count double. */
export const isBonusLevel = (level: number): boolean => level > 1 && level % 3 === 0;

/**
 * Coin payout for a finished run: 2 for playing, 5 per level climbed
 * (10 for bonus levels), +15 for a new personal best.
 */
export function coinsForRun(gameId: string, score: number, newBest: boolean): number {
  if (score <= 0) return 0;
  const level = levelForScore(gameId, score);
  let coins = 2;
  for (let l = 2; l <= level; l++) coins += isBonusLevel(l) ? 10 : 5;
  return coins + (newBest ? 15 : 0);
}

export type TrophyTier = 'bronze' | 'silver' | 'gold';

export function trophyForLevel(level: number): TrophyTier | null {
  if (level >= 9) return 'gold';
  if (level >= 6) return 'silver';
  if (level >= 3) return 'bronze';
  return null;
}

export const TROPHY_ICON: Record<TrophyTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🏆',
};
