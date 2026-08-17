import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Whack-the-mole mechanics, graveyard edition: zombies pop out of a 3×3
 * plot of graves — bop them before they sink back. A 60-second round where
 * pop-ups get faster and briefer as time runs down, like the fairground
 * cabinets. +10 per bop, with an occasional golden skeleton worth +50.
 */
const ROUND_SECONDS = 60;
const HOLES = 9;

interface Hole {
  /** Time remaining visible; 0 = empty. */
  up: number;
  golden: boolean;
}

export function ZombieBopGame({ api }: { api: GameApi }) {
  const holes = useRef<Hole[]>([]);
  const timeLeft = useRef(ROUND_SECONDS);
  const spawnTimer = useRef(1);
  const score = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    holes.current = Array.from({ length: HOLES }, () => ({ up: 0, golden: false }));
    timeLeft.current = ROUND_SECONDS;
    spawnTimer.current = 1;
    score.current = 0;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  useGameLoop(api.running, (dt) => {
    timeLeft.current -= dt;
    if (timeLeft.current <= 0) {
      api.end({ score: score.current, won: true });
      return;
    }
    // Difficulty ramps as the round progresses.
    const progress = 1 - timeLeft.current / ROUND_SECONDS;
    const upDuration = 1.3 - progress * 0.65;
    const spawnEvery = 0.9 - progress * 0.5;

    for (const h of holes.current) {
      if (h.up > 0) h.up = Math.max(0, h.up - dt);
    }

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      const empty = holes.current.map((h, i) => (h.up <= 0 ? i : -1)).filter((i) => i >= 0);
      if (empty.length > 0) {
        const idx = empty[Math.floor(Math.random() * empty.length)];
        holes.current[idx] = { up: upDuration, golden: Math.random() < 0.08 };
        playSfx('flip');
      }
      spawnTimer.current = spawnEvery;
    }
    redraw((n) => n + 1);
  });

  const bop = (i: number) => {
    if (!api.running) return;
    const h = holes.current[i];
    if (h.up <= 0) return;
    score.current += h.golden ? 50 : 10;
    api.setScore(score.current);
    holes.current[i] = { up: 0, golden: false };
    playSfx(h.golden ? 'point' : 'brick');
    haptic.medium();
    redraw((n) => n + 1);
  };

  const size = Math.floor(Math.min((api.width - spacing.l * 2) / 3, (api.height - 80) / 3));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size="score" color={colors.neonPurple} glow style={{ marginBottom: spacing.m }}>
        {`⏳ ${Math.ceil(Math.max(0, timeLeft.current))}`}
      </PixelText>
      <View style={{ width: size * 3, flexDirection: 'row', flexWrap: 'wrap' }}>
        {holes.current.map((h, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            onPressIn={() => bop(i)}
            style={{
              width: size - 6,
              height: size - 6,
              margin: 3,
              borderRadius: 8,
              backgroundColor: '#151526',
              borderWidth: 2,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'flex-end',
              overflow: 'hidden',
            }}>
            {/* Grave mound */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                width: '100%',
                height: size * 0.22,
                backgroundColor: '#241a33',
              }}
            />
            {h.up > 0 && (
              // A real zombie pops up; the golden bonus one glows.
              <Image
                source={ACTORS.zombie}
                style={{
                  width: size * 0.85,
                  height: size * 0.85,
                  marginBottom: size * 0.05,
                  opacity: 1,
                  tintColor: h.golden ? colors.neonYellow : undefined,
                }}
              />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
