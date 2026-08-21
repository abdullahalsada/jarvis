import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Donkey Kong-style platform climb: an ape at the top rolls barrels down
 * sloped girders; climb the ladders, hop the barrels, reach the top. Each
 * rescue speeds the barrels up. ◀ ▶ walk, ▲▼ climb ladders, ◎ jump.
 * Jumped barrels score 25; reaching the ape scores 500. 3 lives.
 */
const FLOORS = 5;

interface Barrel {
  x: number;
  y: number; // px, resting on a floor or falling between floors
  floor: number;
  dir: 1 | -1;
  falling: boolean;
  scored: boolean;
}

export function TowerClimbGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const FLOOR_GAP = Math.floor((H - 70) / FLOORS);
  const PSIZE = Math.min(40, FLOOR_GAP * 0.55);
  const floorY = (f: number) => H - 24 - f * FLOOR_GAP; // y of floor line f (0 = bottom)

  // Ladders per gap: alternate sides so the route zig-zags like the original.
  const ladders = useRef<{ x: number; from: number }[]>([]);

  const player = useRef({ x: 0, y: 0, floor: 0, vy: 0, jumping: false, climbing: false });
  const barrels = useRef<Barrel[]>([]);
  const held = useRef({ left: false, right: false, up: false, down: false });
  const spawnCd = useRef(2);
  const lives = useRef(3);
  const score = useRef(0);
  const round = useRef(1);
  const [, redraw] = useState(0);

  const layout = () => {
    ladders.current = Array.from({ length: FLOORS - 1 }, (_, f) => ({
      x: f % 2 === 0 ? W * 0.82 : W * 0.18,
      from: f,
    }));
  };

  const resetPlayer = () => {
    player.current = { x: W * 0.15, y: floorY(0), floor: 0, vy: 0, jumping: false, climbing: false };
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    round.current = 1;
    barrels.current = [];
    spawnCd.current = 1.5;
    api.setScore(0);
    api.setLives(3);
    layout();
    resetPlayer();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const jump = () => {
    if (!api.running) return;
    const p = player.current;
    if (!p.jumping && !p.climbing) {
      p.jumping = true;
      p.vy = -FLOOR_GAP * 3.4;
      playSfx('bounce');
      haptic.light();
    }
  };

  const ladderAt = (x: number, floor: number, goingUp: boolean) =>
    ladders.current.find(
      (l) => Math.abs(l.x - x) < PSIZE * 0.8 && (goingUp ? l.from === floor : l.from === floor - 1)
    );

  useGameLoop(api.running, (dt) => {
    const p = player.current;
    const walk = W * 0.45;

    if (p.climbing) {
      // On a ladder: only vertical movement until reaching a floor line.
      const dy = (held.current.up ? -1 : held.current.down ? 1 : 0) * FLOOR_GAP * 1.8 * dt;
      p.y += dy;
      const above = floorY(p.floor + 1);
      const below = floorY(p.floor);
      if (p.y <= above) {
        p.y = above;
        p.floor += 1;
        p.climbing = false;
      } else if (p.y >= below) {
        p.y = below;
        p.climbing = false;
      }
    } else {
      if (held.current.left) p.x = Math.max(PSIZE / 2, p.x - walk * dt);
      if (held.current.right) p.x = Math.min(W - PSIZE / 2, p.x + walk * dt);
      if (held.current.up && !p.jumping) {
        const l = ladderAt(p.x, p.floor, true);
        if (l) {
          p.climbing = true;
          p.x = l.x;
        }
      }
      if (held.current.down && !p.jumping && p.floor > 0) {
        const l = ladderAt(p.x, p.floor, false);
        if (l) {
          p.climbing = true;
          p.x = l.x;
          p.floor -= 1;
          p.y = floorY(p.floor + 1) + 1;
        }
      }
      if (p.jumping) {
        p.vy += FLOOR_GAP * 9 * dt;
        p.y += p.vy * dt;
        const ground = floorY(p.floor);
        if (p.vy > 0 && p.y >= ground) {
          p.y = ground;
          p.jumping = false;
        }
      } else {
        p.y = floorY(p.floor);
      }
    }

    // Ape rolls barrels; they run along a floor, drop at ladders sometimes.
    spawnCd.current -= dt;
    if (spawnCd.current <= 0) {
      barrels.current.push({
        x: W * 0.15,
        y: floorY(FLOORS - 1),
        floor: FLOORS - 1,
        dir: 1,
        falling: false,
        scored: false,
      });
      spawnCd.current = Math.max(0.9, 2.4 - round.current * 0.25);
      playSfx('select');
    }
    const bsp = W * (0.28 + round.current * 0.05);
    for (const b of barrels.current) {
      if (b.falling) {
        b.y += FLOOR_GAP * 3.2 * dt;
        const target = floorY(b.floor - 1);
        if (b.y >= target) {
          b.y = target;
          b.floor -= 1;
          b.falling = false;
          b.dir = b.floor % 2 === 0 ? 1 : -1;
        }
      } else {
        b.x += b.dir * bsp * dt;
        // Drop down a level at the edges (and sometimes at ladders).
        const l = ladderAt(b.x, b.floor, false);
        if (b.floor > 0 && ((b.x < PSIZE / 2 || b.x > W - PSIZE / 2) || (l && Math.random() < 0.008))) {
          b.falling = true;
        }
        b.x = Math.max(PSIZE / 2 - 2, Math.min(W - PSIZE / 2 + 2, b.x));
      }
      // Score a clean hop when a barrel passes under an airborne player.
      if (!b.scored && p.jumping && b.floor === p.floor && Math.abs(b.x - p.x) < PSIZE && p.y < floorY(p.floor) - PSIZE * 0.5) {
        b.scored = true;
        score.current += 25;
        api.setScore(score.current);
        playSfx('point');
      }
    }
    barrels.current = barrels.current.filter((b) => !(b.floor === 0 && (b.x <= PSIZE / 2 || b.x >= W - PSIZE / 2)));

    // Barrel hits the climber.
    for (const b of barrels.current) {
      if (b.floor === p.floor && Math.abs(b.x - p.x) < PSIZE * 0.65 && Math.abs(b.y - p.y) < PSIZE * 0.65) {
        lives.current -= 1;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
        barrels.current = [];
        resetPlayer();
        break;
      }
    }

    // Reached the ape's floor: rescue made, next round.
    if (p.floor === FLOORS - 1 && Math.abs(p.x - W * 0.15) < PSIZE * 1.2) {
      score.current += 500;
      api.setScore(score.current);
      round.current += 1;
      playSfx('win');
      haptic.success();
      barrels.current = [];
      resetPlayer();
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {/* Girders */}
          {Array.from({ length: FLOORS }, (_, f) => (
            <View
              key={f}
              style={{
                position: 'absolute',
                left: 0,
                top: floorY(f) + 2,
                width: W,
                height: 8,
                backgroundColor: '#c4155c',
                borderTopWidth: 2,
                borderColor: colors.neonMagenta,
              }}
            />
          ))}
          {/* Ladders */}
          {ladders.current.map((l, i) => {
            const top = floorY(l.from + 1) + 6;
            const height = floorY(l.from) - floorY(l.from + 1);
            return (
              <View key={i} style={{ position: 'absolute', left: l.x - 10, top, width: 20, height }}>
                <View style={{ position: 'absolute', left: 0, width: 4, height: '100%', backgroundColor: colors.neonCyan }} />
                <View style={{ position: 'absolute', right: 0, width: 4, height: '100%', backgroundColor: colors.neonCyan }} />
                {Array.from({ length: Math.floor(height / 14) }, (_, r) => (
                  <View key={r} style={{ position: 'absolute', top: r * 14 + 4, width: '100%', height: 3, backgroundColor: colors.neonCyan }} />
                ))}
              </View>
            );
          })}
          {/* The ape, hurling barrels from the top floor */}
          <Image
            source={ACTORS.ape}
            style={{
              position: 'absolute',
              left: W * 0.15 - PSIZE * 0.9,
              top: floorY(FLOORS - 1) - PSIZE * 1.6,
              width: PSIZE * 1.8,
              height: PSIZE * 1.8,
            }}
          />
          {/* Barrels */}
          {barrels.current.map((b, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: b.x - PSIZE * 0.4,
                top: b.y - PSIZE * 0.8,
                width: PSIZE * 0.8,
                height: PSIZE * 0.8,
                borderRadius: PSIZE * 0.4,
                backgroundColor: '#8a5a2b',
                borderWidth: 3,
                borderColor: '#5e3d1c',
              }}
            />
          ))}
          {/* Climber */}
          <Image
            source={ACTORS.climber}
            style={{
              position: 'absolute',
              left: player.current.x - PSIZE * 0.6,
              top: player.current.y - PSIZE * 1.2,
              width: PSIZE * 1.2,
              height: PSIZE * 1.2,
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀' },
          { key: 'up', label: '▲' },
          { key: 'jump', label: '↥', wide: true },
          { key: 'down', label: '▼' },
          { key: 'right', label: '▶' },
        ]}
        onDown={(k) => {
          if (k === 'jump') jump();
          else held.current[k as 'left' | 'right' | 'up' | 'down'] = true;
        }}
        onUp={(k) => {
          if (k !== 'jump') held.current[k as 'left' | 'right' | 'up' | 'down'] = false;
        }}
      />
    </View>
  );
}
