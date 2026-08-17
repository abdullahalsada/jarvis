import React from 'react';
import { Image, View } from 'react-native';
import { ACTORS } from '../games/engine/actors';
import { GAMES } from '../games/registry';

/**
 * Invisible 1×1 mounts of every in-game image (actor sprites, card icons,
 * logo, mascot) rendered once at app start. Mounting forces fetch + decode
 * up front, so the first time a bus or ghost appears mid-game there's no
 * stutter, and opening a game doesn't pause to pull its art. Stays mounted —
 * the cache keeps everything warm for the session.
 */
const SOURCES = [
  ...Object.values(ACTORS),
  ...GAMES.map((g) => g.art),
  require('../../assets/mascot.webp'),
  require('../../assets/splash-icon.png'),
];

export function AssetWarmup() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01, overflow: 'hidden' }}>
      {SOURCES.map((source, i) => (
        <Image key={i} source={source} style={{ width: 1, height: 1 }} fadeDuration={0} />
      ))}
    </View>
  );
}
