import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { ACTORS } from '../games/engine/actors';
import { GAMES } from '../games/registry';

/**
 * Invisible 1×1 mounts of every in-game image (actor sprites, card icons,
 * logo, mascot) so first appearances mid-game don't stutter. Politeness
 * matters in dev mode, where assets stream from the packager: warming
 * everything at once starves the images the player is actually looking at
 * (logo, cards). So the warmup waits for the app to settle, then mounts in
 * small batches — visible screens always get the bandwidth first.
 */
const SOURCES = [
  ...Object.values(ACTORS),
  ...GAMES.map((g) => g.art),
  require('../../assets/mascot.webp'),
  require('../../assets/splash-icon.png'),
];

const START_DELAY_MS = 4000;
const BATCH_SIZE = 8;
const BATCH_INTERVAL_MS = 700;

export function AssetWarmup() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const step = (n: number) => {
      setCount(n);
      if (n < SOURCES.length) {
        timer = setTimeout(() => step(n + BATCH_SIZE), BATCH_INTERVAL_MS);
      }
    };
    timer = setTimeout(() => step(BATCH_SIZE), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (count === 0) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01, overflow: 'hidden' }}>
      {SOURCES.slice(0, count).map((source, i) => (
        <Image key={i} source={source} style={{ width: 1, height: 1 }} fadeDuration={0} />
      ))}
    </View>
  );
}
