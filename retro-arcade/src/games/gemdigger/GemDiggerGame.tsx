import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { DPad, PAD_DPAD } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Dig-style tunneler: carve tunnels through the earth with swipes and
 * collect every buried gem. Two cave creatures hunt you — but only through
 * open tunnels, so every tunnel you dig is also a road you build for them.
 * That risk/reward loop is the heart of the original. Creatures speed up
 * each level; 3 lives; +10 per gem, +level bonus on clear.
 */
const COLS = 11;
const TICK_MS = 200;
const GEMS = 12;

type Cell = { x: number; y: number };

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function GemDiggerGame({ api }: { api: GameApi }) {
  const fieldH = api.height - PAD_DPAD;
  const cell = Math.floor(Math.min(api.width / COLS, fieldH / 14));
  const ROWS = Math.max(10, Math.min(14, Math.floor(fieldH / cell)));

  const dug = useRef<Set<string>>(new Set());
  const gems = useRef<Set<string>>(new Set());
  const player = useRef<Cell>({ x: 5, y: 1 });
  const wanted = useRef<Dir | null>(null);
  const monsters = useRef<{ pos: Cell; slow: number }[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const level = useRef(1);
  const [, redraw] = useState(0);

  const key = (c: Cell) => `${c.x},${c.y}`;
  const inBounds = (c: Cell) => c.x >= 0 && c.x < COLS && c.y >= 1 && c.y < ROWS;

  const resetPositions = () => {
    player.current = { x: 5, y: 1 };
    wanted.current = null;
    // Monsters start in pre-dug pockets in the lower corners.
    monsters.current = [
      { pos: { x: 1, y: ROWS - 2 }, slow: 0 },
      { pos: { x: COLS - 2, y: ROWS - 2 }, slow: 0 },
    ];
  };

  const setupBoard = () => {
    dug.current = new Set();
    // Starting tunnel: top row segment around the player spawn.
    for (let x = 3; x <= 7; x++) dug.current.add(`${x},1`);
    // Monster pockets.
    dug.current.add(`1,${ROWS - 2}`);
    dug.current.add(`2,${ROWS - 2}`);
    dug.current.add(`${COLS - 2},${ROWS - 2}`);
    dug.current.add(`${COLS - 3},${ROWS - 2}`);

    gems.current = new Set();
    while (gems.current.size < GEMS) {
      const x = Math.floor(Math.random() * COLS);
      const y = 2 + Math.floor(Math.random() * (ROWS - 3));
      const k = `${x},${y}`;
      if (!dug.current.has(k)) gems.current.add(k);
    }
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    level.current = 1;
    api.setScore(0);
    api.setLives(3);
    setupBoard();
    resetPositions();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const steer = (d: Dir) => {
    wanted.current = d;
  };
  const pan = useSwipe(steer);

  const die = (): boolean => {
    lives.current -= 1;
    api.setLives(lives.current);
    playSfx('loseLife');
    haptic.heavy();
    if (lives.current <= 0) {
      api.end({ score: score.current });
      return true;
    }
    resetPositions();
    return false;
  };

  const checkCollision = (): boolean => {
    for (const m of monsters.current) {
      if (m.pos.x === player.current.x && m.pos.y === player.current.y) {
        return die();
      }
    }
    return false;
  };

  useTick(api.running, TICK_MS, () => {
    // Player digs/moves one cell per tick in the swiped direction.
    if (wanted.current) {
      const next = {
        x: player.current.x + DELTA[wanted.current].x,
        y: player.current.y + DELTA[wanted.current].y,
      };
      if (inBounds(next)) {
        const k = key(next);
        if (!dug.current.has(k)) {
          dug.current.add(k); // carve new tunnel
          playSfx('bounce');
        }
        player.current = next;
        if (gems.current.delete(k)) {
          score.current += 10;
          api.setScore(score.current);
          playSfx('eat');
          haptic.light();
          if (gems.current.size === 0) {
            score.current += level.current * 100;
            api.setScore(score.current);
            api.end({ score: score.current, won: true });
            return;
          }
        }
      }
    }
    if (checkCollision()) return;

    // Monsters: greedy chase through dug tunnels only. They move every
    // other tick at level 1, every tick from level 3 — dread, not panic.
    for (const m of monsters.current) {
      m.slow += 1;
      const stride = level.current >= 3 ? 1 : 2;
      if (m.slow % stride !== 0) continue;
      const options = (Object.keys(DELTA) as Dir[])
        .map((d) => ({ x: m.pos.x + DELTA[d].x, y: m.pos.y + DELTA[d].y }))
        .filter((c) => inBounds(c) && dug.current.has(key(c)));
      if (options.length === 0) continue;
      options.sort(
        (a, b) =>
          Math.abs(a.x - player.current.x) +
          Math.abs(a.y - player.current.y) -
          (Math.abs(b.x - player.current.x) + Math.abs(b.y - player.current.y))
      );
      m.pos = Math.random() < 0.85 ? options[0] : options[Math.floor(Math.random() * options.length)];
    }
    if (checkCollision()) return;
    redraw((n) => n + 1);
  });

  const boardW = COLS * cell;
  const boardH = ROWS * cell;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ width: boardW, height: boardH, backgroundColor: '#3d2b17' }}>
        {/* Sky strip on row 0 */}
        <View style={{ position: 'absolute', top: 0, width: boardW, height: cell, backgroundColor: colors.bg }} />
        {[...dug.current].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: x * cell,
                top: y * cell,
                width: cell,
                height: cell,
                backgroundColor: '#17100a',
              }}
            />
          );
        })}
        {[...gems.current].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: x * cell + cell * 0.25,
                top: y * cell + cell * 0.25,
                width: cell * 0.5,
                height: cell * 0.5,
                backgroundColor: colors.neonCyan,
                transform: [{ rotate: '45deg' }],
              }}
            />
          );
        })}
        {monsters.current.map((m, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: m.pos.x * cell + 3,
              top: m.pos.y * cell + 3,
              width: cell - 6,
              height: cell - 6,
              borderRadius: (cell - 6) / 2,
              backgroundColor: i === 0 ? colors.neonRed : colors.neonOrange,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: player.current.x * cell + 3,
            top: player.current.y * cell + 3,
            width: cell - 6,
            height: cell - 6,
            borderRadius: 4,
            backgroundColor: colors.neonGreen,
          }}
        />
        </View>
      </View>
      <DPad onDown={(k) => steer(k as Dir)} />
    </View>
  );
}
