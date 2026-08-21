import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Glide the paper plane down the endless school hallway: hold anywhere to
 * pull the nose up, let go to dive. Slip through the gaps between stacked
 * desks and hanging lights, and snatch gold stars for bonus points. One
 * crash and the flight is over — distance is the score.
 */
interface Obstacle {
  id: number;
  x: number;
  gapY: number; // center of the safe gap
  gapH: number;
  star: boolean;
  starTaken: boolean;
}

export function PaperGliderGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const SIZE = 46;
  const PX = W * 0.26;

  const py = useRef(H / 2);
  const vy = useRef(0);
  const holding = useRef(false);
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(1);
  const nextSpawnX = useRef(W * 1.1);
  const distance = useRef(0);
  const stars = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    py.current = H / 2;
    vy.current = 0;
    holding.current = false;
    obstacles.current = [];
    nextId.current = 1;
    nextSpawnX.current = W * 1.1;
    distance.current = 0;
    stars.current = 0;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  useGameLoop(api.running, (dt) => {
    const speed = W * (0.42 + Math.min(0.5, distance.current / (W * 30)));
    distance.current += speed * dt;

    // Hold = lift, release = dive; velocity is clamped so it stays gentle.
    vy.current += (holding.current ? -H * 1.1 : H * 0.95) * dt;
    vy.current = Math.max(-H * 0.5, Math.min(H * 0.55, vy.current));
    py.current += vy.current * dt;

    // Ceiling and floor end the flight too.
    if (py.current < SIZE / 2 || py.current > H - SIZE / 2) {
      playSfx('explode');
      haptic.heavy();
      api.end({ score: Math.floor(distance.current / 20) + stars.current * 50 });
      return;
    }

    // Spawn obstacle columns ahead.
    while (nextSpawnX.current < distance.current + W * 1.5) {
      const gapH = Math.max(H * 0.24, H * 0.4 - distance.current / (W * 0.08));
      obstacles.current.push({
        id: nextId.current++,
        x: nextSpawnX.current,
        gapY: H * (0.25 + Math.random() * 0.5),
        gapH,
        star: Math.random() < 0.4,
        starTaken: false,
      });
      nextSpawnX.current += W * (0.55 + Math.random() * 0.25);
    }
    obstacles.current = obstacles.current.filter((o) => o.x - distance.current > -W * 0.3);

    for (const o of obstacles.current) {
      const sx = o.x - distance.current;
      const overlapX = Math.abs(sx - PX) < SIZE * 0.55;
      if (overlapX) {
        const inGap = py.current > o.gapY - o.gapH / 2 + SIZE * 0.3 && py.current < o.gapY + o.gapH / 2 - SIZE * 0.3;
        if (!inGap) {
          playSfx('explode');
          haptic.heavy();
          api.end({ score: Math.floor(distance.current / 20) + stars.current * 50 });
          return;
        }
        if (o.star && !o.starTaken && Math.abs(py.current - o.gapY) < SIZE * 0.7) {
          o.starTaken = true;
          stars.current += 1;
          playSfx('coin');
          haptic.light();
        }
      }
    }

    api.setScore(Math.floor(distance.current / 20) + stars.current * 50);
    redraw((n) => n + 1);
  });

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={() => {
        holding.current = true;
      }}
      onPressOut={() => {
        holding.current = false;
      }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Hallway: ceiling strip + floor strip */}
        <View style={{ position: 'absolute', top: 0, width: W, height: 12, backgroundColor: '#3a2c1c' }} />
        <View style={{ position: 'absolute', bottom: 0, width: W, height: 12, backgroundColor: '#3a2c1c' }} />
        {obstacles.current.map((o) => {
          const sx = o.x - distance.current;
          const topH = o.gapY - o.gapH / 2;
          const botY = o.gapY + o.gapH / 2;
          return (
            <React.Fragment key={o.id}>
              {/* Hanging light from the ceiling */}
              <View style={{ position: 'absolute', left: sx - 5, top: 0, width: 10, height: topH - 16, backgroundColor: '#57431f' }} />
              <View style={{ position: 'absolute', left: sx - 18, top: topH - 18, width: 36, height: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: colors.neonYellow, opacity: 0.9 }} />
              {/* Desk stack from the floor */}
              <View style={{ position: 'absolute', left: sx - 24, top: botY, width: 48, height: H - botY - 12, backgroundColor: '#8a5a2b', borderWidth: 3, borderColor: '#5e3d1c' }} />
              <View style={{ position: 'absolute', left: sx - 28, top: botY - 8, width: 56, height: 10, backgroundColor: '#a06a35', borderRadius: 3 }} />
              {/* Gold star in the gap */}
              {o.star && !o.starTaken && (
                <View style={{ position: 'absolute', left: sx - 9, top: o.gapY - 9, width: 18, height: 18, borderRadius: 4, backgroundColor: colors.neonYellow, transform: [{ rotate: '45deg' }] }} />
              )}
            </React.Fragment>
          );
        })}
        {/* The glider */}
        <Image
          source={ACTORS.paper_plane}
          style={{
            position: 'absolute',
            left: PX - SIZE / 2,
            top: py.current - SIZE / 2,
            width: SIZE,
            height: SIZE,
            transform: [{ rotate: `${Math.max(-24, Math.min(30, (vy.current / H) * 80))}deg` }],
          }}
        />
      </View>
    </Pressable>
  );
}
