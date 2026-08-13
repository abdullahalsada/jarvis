import { Platform } from 'react-native';

/**
 * Neon-on-dark palette from the retro-arcade-v4 web prototype.
 * Chunky pixels, high contrast — designed for older players:
 * large type, bright accents on near-black backgrounds.
 */
export const colors = {
  bg: '#0a0a12',
  bgRaised: '#12121f',
  bgCard: '#161628',
  border: '#2a2a45',
  text: '#e8e8f0',
  textDim: '#9a9ab5',
  neonGreen: '#39ff14',
  neonCyan: '#00fff7',
  neonMagenta: '#ff2079',
  neonYellow: '#ffe600',
  neonOrange: '#ff9f1c',
  neonPurple: '#b14aed',
  neonRed: '#ff3b3b',
  locked: '#55556f',
} as const;

export const categoryColors: Record<string, string> = {
  classics: colors.neonGreen,
  action: colors.neonCyan,
  spooky: colors.neonPurple,
  brain: colors.neonYellow,
};

/** Monospace stack — swap for a bundled pixel font (e.g. Press Start 2P) later. */
export const pixelFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/** Large-type scale: minimum body size 18 for readability. */
export const type = {
  title: 34,
  heading: 26,
  body: 18,
  label: 16,
  score: 22,
  button: 20,
} as const;

/** Minimum touch target (Apple HIG is 44; we go bigger for older hands). */
export const touchTarget = 56;

export const spacing = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
