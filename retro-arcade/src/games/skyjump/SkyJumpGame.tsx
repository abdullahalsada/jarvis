import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Bouncy endless jumper: your critter bounces automatically — steer it onto
 * platforms as the tower scrolls ever upward. Green platforms are solid,
 * white ones crumble after one bounce, springs launch you sky-high. Drift
 * off one edge and you wrap to the other. Falling off the bottom ends the
 * run; score is the height you reach.
 */
interface Platform {
  id: number;
  x: number;
  y: number; // world y, smaller = higher
  kind: 'solid' | 'crumble' | 'spring';
  used: boolean;
}

export function SkyJumpGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const PW = 74; // platform width
  const PSIZE = 44;

  const px = useRef(W / 2);
  const py = useRef(0); // world y of the player
  const vy = useRef(0);
  const camera = useRef(0); // world y at the top of the screen
  const best = useRef(0); // highest point reached (negative up)
  const platforms = useRef<Platform[]>([]);
  const nextId = useRef(1);
  const highestSpawned = useRef(0);
  const held = useRef({ left: false, right: false });
  const [, redraw] = useState(0);

  const spawnUpTo = (top: number) => {
    while (highestSpawned.current > top) {
      const gap = 52 + Math.random() * 46;
      highestSpawned.current -= gap;
      const r = Math.random();
      platforms.current.push({
        id: nextId.current++,
        x: PW / 2 + Math.random() * (W - PW),
        y: highestSpawned.current,
        kind: r < 0.12 ? 'spring' : r < 0.3 ? 'crumble' : 'solid',
        used: false,
      });
    }
  };

  useEffect(() => {
    px.current = W / 2;
    py.current = -20;
    vy.current = -H * 0.95;
    camera.current = -H;
    best.current = 0;
    platforms.current = [{ id: 0, x: W / 2, y: 30, kind: 'solid', used: false }];
    nextId.current = 1;
    highestSpawned.current = 30;
    api.setScore(0);
    spawnUpTo(-H * 1.5);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    px.current = Math.max(0, Math.min(W, x));
  });

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      px.current += dx * W * 0.95 * dt;
    }
    // Wrap around the sides, like the classic.
    if (px.current < -PSIZE / 2) px.current = W + PSIZE / 2;
    if (px.current > W + PSIZE / 2) px.current = -PSIZE / 2;

    const prevY = py.current;
    vy.current += H * 1.5 * dt;
    py.current += vy.current * dt;

    // Landing (only while falling): cross a platform top this frame.
    if (vy.current > 0) {
      for (const p of platforms.current) {
        if (p.used && p.kind === 'crumble') continue;
        if (
          Math.abs(px.current - p.x) < (PW + PSIZE * 0.6) / 2 &&
          prevY <= p.y - PSIZE * 0.4 &&
          py.current >= p.y - PSIZE * 0.4
        ) {
          if (p.kind === 'spring') {
            vy.current = -H * 1.45;
            playSfx('powerUp');
            haptic.medium();
          } else {
            vy.current = -H * 0.95;
            playSfx('bounce');
            haptic.light();
          }
          if (p.kind === 'crumble') p.used = true;
          break;
        }
      }
    }

    // Camera follows upward only.
    const target = py.current - H * 0.45;
    if (target < camera.current) camera.current = target;
    spawnUpTo(camera.current - H * 0.5);
    platforms.current = platforms.current.filter((p) => p.y < camera.current + H * 1.4);

    // Score = height climbed.
    if (py.current < best.current) {
      best.current = py.current;
      api.setScore(Math.floor(-best.current / 10));
    }

    // Fell below the screen.
    if (py.current > camera.current + H + PSIZE) {
      playSfx('gameOver');
      haptic.heavy();
      api.end({ score: Math.floor(-best.current / 10) });
      return;
    }
    redraw((n) => n + 1);
  });

  const sy = (worldY: number) => worldY - camera.current;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {platforms.current.map((p) => {
            if (p.used && p.kind === 'crumble') return null;
            const color = p.kind === 'solid' ? colors.neonGreen : p.kind === 'crumble' ? '#e8e8f0' : colors.neonYellow;
            return (
              <React.Fragment key={p.id}>
                <View
                  style={{
                    position: 'absolute',
                    left: p.x - PW / 2,
                    top: sy(p.y),
                    width: PW,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: color,
                  }}
                />
                {p.kind === 'spring' && (
                  <View style={{ position: 'absolute', left: p.x - 8, top: sy(p.y) - 10, width: 16, height: 10, borderWidth: 2, borderColor: colors.neonYellow, borderRadius: 3 }} />
                )}
              </React.Fragment>
            );
          })}
          <Image
            source={ACTORS.hopper}
            style={{
              position: 'absolute',
              left: px.current - PSIZE / 2,
              top: sy(py.current) - PSIZE,
              width: PSIZE,
              height: PSIZE,
              transform: [{ scaleY: vy.current < 0 ? 1.06 : 0.96 }],
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => {
          held.current[k as 'left' | 'right'] = true;
        }}
        onUp={(k) => {
          held.current[k as 'left' | 'right'] = false;
        }}
      />
    </View>
  );
}
