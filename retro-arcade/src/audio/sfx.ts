import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { getSettings } from '../context/SettingsContext';
import { wavDataUri, type Tone } from './synth';
import { GAME_JINGLES } from './jingles';

/**
 * Shared sound-effect bank. Every game plays from this fixed set so the whole
 * app has one consistent chip-synth voice. Respects the sound toggle.
 */
const BANK: Record<string, Tone[]> = {
  // UI
  select: [{ freq: 660, duration: 0.06 }],
  start: [
    { freq: 440, duration: 0.08 },
    { freq: 660, duration: 0.08 },
    { freq: 880, duration: 0.12 },
  ],
  // Gameplay
  eat: [{ freq: 880, freqEnd: 1320, duration: 0.07 }],
  bounce: [{ freq: 440, duration: 0.04 }],
  brick: [{ freq: 990, duration: 0.05 }],
  shoot: [{ freq: 1200, freqEnd: 300, duration: 0.09 }],
  explode: [{ freq: 220, freqEnd: 40, duration: 0.3, wave: 'noise', volume: 0.7 }],
  point: [
    { freq: 660, duration: 0.07 },
    { freq: 990, duration: 0.1 },
  ],
  loseLife: [
    { freq: 330, duration: 0.12 },
    { freq: 220, duration: 0.12 },
    { freq: 110, duration: 0.2 },
  ],
  gameOver: [
    { freq: 440, duration: 0.15 },
    { freq: 330, duration: 0.15 },
    { freq: 220, duration: 0.15 },
    { freq: 110, duration: 0.35 },
  ],
  win: [
    { freq: 523, duration: 0.1 },
    { freq: 659, duration: 0.1 },
    { freq: 784, duration: 0.1 },
    { freq: 1047, duration: 0.25 },
  ],
  powerUp: [{ freq: 220, freqEnd: 1760, duration: 0.25 }],
  flip: [{ freq: 550, duration: 0.05, wave: 'triangle' }],
  match: [
    { freq: 784, duration: 0.08 },
    { freq: 1175, duration: 0.12 },
  ],
  // Simon pads use one tone each (classic Simon pitches).
  padGreen: [{ freq: 392, duration: 0.3, wave: 'triangle' }],
  padRed: [{ freq: 330, duration: 0.3, wave: 'triangle' }],
  padYellow: [{ freq: 262, duration: 0.3, wave: 'triangle' }],
  padBlue: [{ freq: 196, duration: 0.3, wave: 'triangle' }],
  wrong: [{ freq: 110, duration: 0.5, wave: 'square', volume: 0.6 }],
  // Progression
  levelUp: [
    { freq: 523, duration: 0.07 },
    { freq: 659, duration: 0.07 },
    { freq: 784, duration: 0.07 },
    { freq: 1047, duration: 0.16 },
  ],
  bonusRound: [
    { freq: 784, duration: 0.08 },
    { freq: 988, duration: 0.08 },
    { freq: 784, duration: 0.08 },
    { freq: 988, duration: 0.08 },
    { freq: 1319, duration: 0.22 },
  ],
  coin: [
    { freq: 988, duration: 0.05 },
    { freq: 1319, duration: 0.14 },
  ],
  trophy: [
    { freq: 523, duration: 0.1 },
    { freq: 523, duration: 0.05 },
    { freq: 784, duration: 0.1 },
    { freq: 1047, duration: 0.1 },
    { freq: 1319, duration: 0.28 },
  ],
};

export type SfxName = keyof typeof BANK;

const players = new Map<string, AudioPlayer>();
let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await setAudioModeAsync({ playsInSilentMode: false });
  for (const [name, tones] of Object.entries(BANK)) {
    players.set(name, createAudioPlayer({ uri: wavDataUri(tones) }));
  }
  for (const [gameId, tones] of Object.entries(GAME_JINGLES)) {
    players.set(`jingle:${gameId}`, createAudioPlayer({ uri: wavDataUri(tones) }));
  }
}

/** Pre-render and register every sound at startup so the first play is instant. */
export function initSfx(): Promise<void> {
  return ensureInit().catch(() => {});
}

function playByKey(key: string): void {
  if (!getSettings().sound) return;
  ensureInit().then(() => {
    const player = players.get(key);
    if (player) {
      player.seekTo(0);
      player.play();
    }
  });
}

export function playSfx(name: SfxName): void {
  playByKey(name);
}

/** The game's signature start jingle; falls back to the shared start sound. */
export function playJingle(gameId: string): void {
  playByKey(gameId in GAME_JINGLES ? `jingle:${gameId}` : 'start');
}
