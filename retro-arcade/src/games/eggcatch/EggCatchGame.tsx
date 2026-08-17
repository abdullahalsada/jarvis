import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Handheld-LCD catcher in the Game & Watch tradition: eggs roll down four
 * ramps (two per side) and you hold the basket under one of four positions.
 * Tap a quadrant of the screen to jump the basket there — instant, discrete,
 * exactly like the original's four buttons. Three dropped eggs end the game.
 * The roll speeds up and eggs bunch closer as your score climbs.
 */
const RAMPS = 4; // 0 top-left, 1 bottom-left, 2 top-right, 3 bottom-right

interface Egg {
  ramp: number;
  t: number; // 0 at spawn → 1 at basket
}

export function EggCatchGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const FIELD_H = H - 20;

  const eggs = useRef<Egg[]>([]);
  const basket = useRef(0);
  const misses = useRef(0);
  const score = useRef(0);
  const spawnTimer = useRef(1);
  const [, redraw] = useState(0);

  useEffect(() => {
    eggs.current = [];
    basket.current = 0;
    misses.current = 0;
    score.current = 0;
    spawnTimer.current = 1.2;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  // Ramp geometry: left ramps roll rightward, right ramps leftward.
  const rampY = (ramp: number) => (ramp % 2 === 0 ? FIELD_H * 0.22 : FIELD_H * 0.48);
  const rampLeft = (ramp: number) => ramp < 2;
  const RAMP_LEN = W * 0.34;
  const catchX = (ramp: number) => (rampLeft(ramp) ? RAMP_LEN + 24 : W - RAMP_LEN - 24);
  const catchY = (ramp: number) => rampY(ramp) + RAMP_LEN * 0.35 + 24;

  const eggPos = (egg: Egg) => {
    const y0 = rampY(egg.ramp);
    const x0 = rampLeft(egg.ramp) ? 8 : W - 8;
    const x1 = rampLeft(egg.ramp) ? RAMP_LEN + 16 : W - RAMP_LEN - 16;
    return {
      x: x0 + (x1 - x0) * egg.t,
      y: y0 + RAMP_LEN * 0.35 * egg.t,
    };
  };

  useGameLoop(api.running, (dt) => {
    // Roll speed and spawn rate ramp with score, LCD-style difficulty.
    const speed = 0.28 + Math.min(0.5, score.current * 0.004);

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      // Never two eggs arriving at once early on; later it happens.
      const ramp = Math.floor(Math.random() * RAMPS);
      eggs.current.push({ ramp, t: 0 });
      playSfx('select');
      spawnTimer.current = Math.max(0.55, 1.5 - score.current * 0.012);
    }

    for (const egg of eggs.current) egg.t += speed * dt * 2;

    for (let i = eggs.current.length - 1; i >= 0; i--) {
      const egg = eggs.current[i];
      if (egg.t >= 1) {
        eggs.current.splice(i, 1);
        if (basket.current === egg.ramp) {
          score.current += 1;
          api.setScore(score.current);
          playSfx('eat');
          haptic.light();
        } else {
          misses.current += 1;
          api.setLives(3 - misses.current);
          playSfx('loseLife');
          haptic.heavy();
          if (misses.current >= 3) {
            api.end({ score: score.current });
            return;
          }
        }
      }
    }
    redraw((n) => n + 1);
  });

  const moveTo = (ramp: number) => {
    if (!api.running) return;
    basket.current = ramp;
    playSfx('flip');
    redraw((n) => n + 1);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Quadrant tap zones (invisible, full-field) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', zIndex: 2 }}>
        {[0, 2, 1, 3].map((ramp) => (
          <Pressable
            key={ramp}
            accessibilityRole="button"
            onPressIn={() => moveTo(ramp)}
            style={{ width: '50%', height: '50%' }}
          />
        ))}
      </View>

      <View pointerEvents="none" style={{ flex: 1, zIndex: 1 }}>
        {/* Ramps with the hens that lay the eggs perched at the top */}
        {[0, 1, 2, 3].map((r) => (
          <View key={r}>
            <View
              style={{
                position: 'absolute',
                left: rampLeft(r) ? 0 : W - RAMP_LEN,
                top: rampY(r) + RAMP_LEN * 0.175,
                width: RAMP_LEN,
                height: 6,
                backgroundColor: colors.border,
                transform: [{ rotate: rampLeft(r) ? '19deg' : '-19deg' }],
              }}
            />
            <Image
              source={ACTORS.hen}
              style={{
                position: 'absolute',
                left: rampLeft(r) ? 2 : W - 38,
                top: rampY(r) - 34,
                width: 36,
                height: 36,
                transform: [{ scaleX: rampLeft(r) ? 1 : -1 }],
              }}
            />
          </View>
        ))}
        {/* Eggs */}
        {eggs.current.map((egg, i) => {
          const p = eggPos(egg);
          return (
            <Image
              key={i}
              source={ACTORS.egg}
              style={{
                position: 'absolute',
                left: p.x - 11,
                top: p.y - 11,
                width: 22,
                height: 22,
                transform: [{ rotate: `${(egg.t * 360) % 360}deg` }],
              }}
            />
          );
        })}
        {/* Basket */}
        <Image
          source={ACTORS.basket}
          style={{
            position: 'absolute',
            left: catchX(basket.current) - 30,
            top: catchY(basket.current) - 14,
            width: 60,
            height: 60,
          }}
        />
        {/* Miss markers */}
        <PixelText size="label" color={colors.neonRed} style={{ position: 'absolute', bottom: 8, alignSelf: 'center' }}>
          {'✖'.repeat(misses.current)}
        </PixelText>
      </View>
    </View>
  );
}
