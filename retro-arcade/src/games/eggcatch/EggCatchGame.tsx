import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideXY } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Free-movement catcher: eggs roll down four ramps (two per side), tumble
 * off the end, and fall — the basket follows your finger ANYWHERE on the
 * screen (riding slightly above it so your hand never hides it), so you can
 * snatch an egg mid-air or camp under a ramp lip. Three cracked eggs end
 * the game; rolls speed up and bunch closer as your score climbs.
 */
const RAMPS = 4; // 0 top-left, 1 bottom-left, 2 top-right, 3 bottom-right

interface Egg {
  ramp: number;
  phase: 'roll' | 'fall';
  t: number; // roll progress 0→1
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

const BASKET_W = 64;

export function EggCatchGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  // The basket rides a bit above the finger so the hand never covers it.
  const FINGER_LIFT = 56;

  const eggs = useRef<Egg[]>([]);
  const basketX = useRef(W / 2);
  const basketY = useRef(H - 86); // top of the basket mouth
  const misses = useRef(0);
  const score = useRef(0);
  const spawnTimer = useRef(1);
  const [, redraw] = useState(0);

  useEffect(() => {
    eggs.current = [];
    basketX.current = W / 2;
    basketY.current = H - 86;
    misses.current = 0;
    score.current = 0;
    spawnTimer.current = 1.2;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  // The whole field is the controller: the basket follows the finger in
  // BOTH axes — anywhere on the screen.
  const pan = useSlideXY((x, y) => {
    basketX.current = Math.max(BASKET_W / 2, Math.min(W - BASKET_W / 2, x));
    basketY.current = Math.max(40, Math.min(H - 60, y - FINGER_LIFT));
  });

  // Ramp geometry: left ramps roll rightward, right ramps leftward.
  const rampY = (ramp: number) => (ramp % 2 === 0 ? H * 0.16 : H * 0.38);
  const rampLeft = (ramp: number) => ramp < 2;
  const RAMP_LEN = W * 0.34;

  const rampEnd = (ramp: number) => ({
    x: rampLeft(ramp) ? RAMP_LEN + 16 : W - RAMP_LEN - 16,
    y: rampY(ramp) + RAMP_LEN * 0.35,
  });

  useGameLoop(api.running, (dt) => {
    // Roll speed and spawn rate ramp with score, LCD-style difficulty.
    const speed = 0.28 + Math.min(0.5, score.current * 0.004);

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      const ramp = Math.floor(Math.random() * RAMPS);
      eggs.current.push({ ramp, phase: 'roll', t: 0, x: 0, y: 0, vx: 0, vy: 0, spin: 0 });
      playSfx('select');
      spawnTimer.current = Math.max(0.55, 1.5 - score.current * 0.012);
    }

    for (const egg of eggs.current) {
      egg.spin += dt * (egg.phase === 'roll' ? 360 : 540);
      if (egg.phase === 'roll') {
        egg.t += speed * dt * 2;
        if (egg.t >= 1) {
          // Tumble off the ramp lip into free fall, keeping roll direction.
          const end = rampEnd(egg.ramp);
          egg.phase = 'fall';
          egg.x = end.x;
          egg.y = end.y;
          egg.vx = (rampLeft(egg.ramp) ? 1 : -1) * W * (0.12 + speed * 0.12);
          egg.vy = H * 0.1;
        }
      } else {
        egg.vy += H * 1.1 * dt; // gravity
        egg.x += egg.vx * dt;
        egg.y += egg.vy * dt;
      }
    }

    for (let i = eggs.current.length - 1; i >= 0; i--) {
      const egg = eggs.current[i];
      if (egg.phase !== 'fall') continue;
      // Caught: a falling egg meets the basket mouth — wherever the basket is.
      if (
        egg.vy > 0 &&
        egg.y >= basketY.current - 6 &&
        egg.y <= basketY.current + 26 &&
        Math.abs(egg.x - basketX.current) < BASKET_W / 2
      ) {
        eggs.current.splice(i, 1);
        score.current += 1;
        api.setScore(score.current);
        playSfx('eat');
        haptic.light();
        continue;
      }
      // Cracked on the floor.
      if (egg.y > H - 18) {
        eggs.current.splice(i, 1);
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
    redraw((n) => n + 1);
  });

  const eggPos = (egg: Egg) => {
    if (egg.phase === 'fall') return { x: egg.x, y: egg.y };
    const y0 = rampY(egg.ramp);
    const x0 = rampLeft(egg.ramp) ? 8 : W - 8;
    const x1 = rampLeft(egg.ramp) ? RAMP_LEN + 16 : W - RAMP_LEN - 16;
    return {
      x: x0 + (x1 - x0) * egg.t,
      y: y0 + RAMP_LEN * 0.35 * egg.t,
    };
  };

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
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
                transform: [{ rotate: `${egg.spin % 360}deg` }],
              }}
            />
          );
        })}
        {/* Basket — glides with the finger, anywhere on the screen */}
        <Image
          source={ACTORS.basket}
          style={{
            position: 'absolute',
            left: basketX.current - BASKET_W / 2,
            top: basketY.current - 12,
            width: BASKET_W,
            height: BASKET_W,
          }}
        />
        {/* Floor line + miss markers */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 12,
            height: 3,
            backgroundColor: colors.border,
          }}
        />
        <PixelText size="label" color={colors.neonRed} style={{ position: 'absolute', bottom: 20, left: 12 }}>
          {'✖'.repeat(misses.current)}
        </PixelText>
      </View>
    </View>
  );
}
