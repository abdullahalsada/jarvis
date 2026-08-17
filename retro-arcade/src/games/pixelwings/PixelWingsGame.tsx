import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Flappy-style one-touch flyer: tap anywhere to flap, glide through the gap
 * in each tower pair, one point per tower passed. One collision ends the
 * run. The gap narrows gently over the first 20 towers, then holds — the
 * "easy to learn, brutal to master" curve of the genre.
 */
export function PixelWingsGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const BIRD = 26;
  const BIRD_X = W * 0.28;
  const GRAVITY = H * 1.9;
  const FLAP = -H * 0.62;
  const SPEED = W * 0.42;
  const TOWER_W = 64;

  interface Tower {
    x: number;
    gapY: number;
    gapH: number;
    passed: boolean;
  }

  const bird = useRef({ y: H / 2, vy: 0 });
  const towers = useRef<Tower[]>([]);
  const score = useRef(0);
  const started = useRef(false);
  const spawnTimer = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    bird.current = { y: H / 2, vy: 0 };
    towers.current = [];
    score.current = 0;
    started.current = false;
    spawnTimer.current = 0.4;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const flap = () => {
    if (!api.running) return;
    started.current = true;
    bird.current.vy = FLAP;
    playSfx('flip');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    const b = bird.current;
    if (!started.current) {
      // Gentle hover until the first tap — no surprise starts.
      b.y = H / 2 + Math.sin(Date.now() / 300) * 8;
      redraw((n) => n + 1);
      return;
    }

    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      const gapH = Math.max(H * 0.24, H * 0.34 - score.current * (H * 0.005));
      const margin = H * 0.12;
      towers.current.push({
        x: W + TOWER_W,
        gapY: margin + Math.random() * (H - margin * 2 - gapH),
        gapH,
        passed: false,
      });
      spawnTimer.current = 1.55;
    }

    for (const tw of towers.current) {
      tw.x -= SPEED * dt;
      if (!tw.passed && tw.x + TOWER_W < BIRD_X - BIRD / 2) {
        tw.passed = true;
        score.current += 1;
        api.setScore(score.current);
        playSfx('point');
        haptic.light();
      }
    }
    towers.current = towers.current.filter((tw) => tw.x > -TOWER_W);

    // Collisions: floor, ceiling, towers.
    const hitTower = towers.current.some(
      (tw) =>
        BIRD_X + BIRD / 2 > tw.x &&
        BIRD_X - BIRD / 2 < tw.x + TOWER_W &&
        (b.y - BIRD / 2 < tw.gapY || b.y + BIRD / 2 > tw.gapY + tw.gapH)
    );
    if (b.y + BIRD / 2 > H || b.y - BIRD / 2 < 0 || hitTower) {
      playSfx('explode');
      haptic.heavy();
      api.end({ score: score.current });
      return;
    }
    redraw((n) => n + 1);
  });

  return (
    <Pressable style={{ flex: 1 }} onPressIn={flap} accessibilityRole="button">
      <View pointerEvents="none" style={{ flex: 1 }}>
        {towers.current.map((tw, i) => (
          <React.Fragment key={i}>
            <View
              style={{
                position: 'absolute',
                left: tw.x,
                top: 0,
                width: TOWER_W,
                height: tw.gapY,
                backgroundColor: '#123f2a',
                borderWidth: 2,
                borderColor: colors.neonGreen,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: tw.x,
                top: tw.gapY + tw.gapH,
                width: TOWER_W,
                height: H - tw.gapY - tw.gapH,
                backgroundColor: '#123f2a',
                borderWidth: 2,
                borderColor: colors.neonGreen,
              }}
            />
          </React.Fragment>
        ))}
        {/* The bird, pitching with its vertical speed */}
        <Image
          source={ACTORS.bird}
          style={{
            position: 'absolute',
            left: BIRD_X - BIRD,
            top: bird.current.y - BIRD,
            width: BIRD * 2,
            height: BIRD * 2,
            transform: [{ rotate: `${Math.max(-25, Math.min(60, bird.current.vy * 0.06))}deg` }],
          }}
        />
      </View>
    </Pressable>
  );
}
