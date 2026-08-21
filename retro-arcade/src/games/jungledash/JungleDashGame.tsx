import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Pitfall-style jungle runner: the explorer sprints right past scrolling
 * jungle; tap anywhere to jump over pits, rolling logs and snakes, and
 * grab treasure floating mid-air. Speed climbs with distance. One stumble
 * ends the run — distance + treasure is the score.
 */
type Kind = 'pit' | 'log' | 'snake' | 'treasure';

interface Item {
  x: number; // world px (screen x = x - camera)
  kind: Kind;
  w: number;
}

export function JungleDashGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GROUND = H - 90;
  const PSIZE = 44;
  const PX = W * 0.22; // player's fixed screen x

  const camera = useRef(0);
  const py = useRef(GROUND);
  const vy = useRef(0);
  const jumping = useRef(false);
  const items = useRef<Item[]>([]);
  const nextSpawn = useRef(W * 0.9);
  const score = useRef(0);
  const treasure = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    camera.current = 0;
    py.current = GROUND;
    vy.current = 0;
    jumping.current = false;
    items.current = [];
    nextSpawn.current = W * 0.9;
    score.current = 0;
    treasure.current = 0;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const jump = () => {
    if (!api.running || jumping.current) return;
    jumping.current = true;
    vy.current = -H * 0.62;
    playSfx('bounce');
    haptic.light();
  };

  const tap = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => tapRef.current(),
    })
  );
  const tapRef = useRef(jump);
  tapRef.current = jump;

  useGameLoop(api.running, (dt) => {
    const speed = W * (0.42 + Math.min(0.5, camera.current / (W * 40)));
    camera.current += speed * dt;

    // Physics
    if (jumping.current) {
      vy.current += H * 1.35 * dt;
      py.current += vy.current * dt;
      if (py.current >= GROUND) {
        py.current = GROUND;
        jumping.current = false;
      }
    }

    // Spawn obstacles ahead of the camera with fair gaps.
    while (nextSpawn.current < camera.current + W * 1.4) {
      const r = Math.random();
      const kind: Kind = r < 0.3 ? 'pit' : r < 0.55 ? 'log' : r < 0.75 ? 'snake' : 'treasure';
      items.current.push({
        x: nextSpawn.current,
        kind,
        w: kind === 'pit' ? PSIZE * 1.6 : PSIZE * 0.9,
      });
      nextSpawn.current += W * (0.45 + Math.random() * 0.4);
    }
    items.current = items.current.filter((o) => o.x - camera.current > -W * 0.3);

    // Collisions at the player's screen position.
    const onGround = !jumping.current;
    for (const o of items.current) {
      const sx = o.x - camera.current;
      const overlap = sx < PX + PSIZE * 0.35 && sx + o.w > PX - PSIZE * 0.35;
      if (!overlap) continue;
      if (o.kind === 'treasure') {
        // Grab in the air (it floats at jump height).
        if (jumping.current && py.current < GROUND - PSIZE * 0.8) {
          o.x = -99999;
          treasure.current += 1;
          score.current += 100;
          api.setScore(score.current);
          playSfx('coin');
          haptic.medium();
        }
      } else if (onGround || (o.kind !== 'pit' && py.current > GROUND - PSIZE * 0.6)) {
        playSfx('explode');
        haptic.heavy();
        api.end({ score: score.current });
        return;
      }
    }
    items.current = items.current.filter((o) => o.x > -9999);

    score.current = Math.floor(camera.current / 20) + treasure.current * 100;
    api.setScore(score.current);
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...tap.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Jungle backdrop: layered canopy stripes */}
        <View style={{ position: 'absolute', top: 0, width: W, height: H * 0.24, backgroundColor: '#0c1f10' }} />
        <View style={{ position: 'absolute', top: H * 0.24, width: W, height: 14, backgroundColor: '#123018' }} />
        {/* Ground */}
        <View
          style={{
            position: 'absolute',
            top: GROUND + PSIZE * 0.5,
            width: W,
            height: H - GROUND,
            backgroundColor: '#2b1c0e',
            borderTopWidth: 3,
            borderColor: '#3f7d2c',
          }}
        />
        {items.current.map((o, i) => {
          const sx = o.x - camera.current;
          if (o.kind === 'pit') {
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: sx,
                  top: GROUND + PSIZE * 0.5,
                  width: o.w,
                  height: H - GROUND,
                  backgroundColor: '#050508',
                }}
              />
            );
          }
          if (o.kind === 'log') {
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: sx,
                  top: GROUND + PSIZE * 0.5 - 22,
                  width: o.w,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: '#8a5a2b',
                  borderWidth: 3,
                  borderColor: '#5e3d1c',
                }}
              />
            );
          }
          if (o.kind === 'snake') {
            return (
              <View key={i} style={{ position: 'absolute', left: sx, top: GROUND + PSIZE * 0.5 - 18 }}>
                <View style={{ width: o.w, height: 14, borderRadius: 7, backgroundColor: colors.neonGreen }} />
                <View style={{ position: 'absolute', right: -4, top: -8, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.neonGreen }} />
              </View>
            );
          }
          return (
            <Image
              key={i}
              source={ACTORS.gemstone}
              style={{
                position: 'absolute',
                left: sx,
                top: GROUND - PSIZE * 1.7,
                width: PSIZE * 0.8,
                height: PSIZE * 0.8,
              }}
            />
          );
        })}
        {/* The explorer */}
        <Image
          source={ACTORS.climber}
          style={{
            position: 'absolute',
            left: PX - PSIZE / 2,
            top: py.current - PSIZE * 0.5,
            width: PSIZE,
            height: PSIZE,
          }}
        />
      </View>
    </View>
  );
}
