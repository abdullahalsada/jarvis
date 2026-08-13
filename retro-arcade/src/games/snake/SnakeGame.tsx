import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Classic handheld Snake (Nokia-style): fixed grid, walls are deadly, one
 * food at a time, speed ramps as the snake grows. Direction changes are
 * buffered (up to 2 queued) so fast double-turns register — the detail that
 * makes or breaks authentic Snake feel.
 */
const COLS = 17;
const START_MS = 180;
const MIN_MS = 70;

type Cell = { x: number; y: number };

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function SnakeGame({ api }: { api: GameApi }) {
  const cell = Math.floor(api.width / COLS);
  const rows = Math.max(10, Math.floor(api.height / cell) - 1);

  const snake = useRef<Cell[]>([]);
  const dir = useRef<Dir>('right');
  const queue = useRef<Dir[]>([]);
  const food = useRef<Cell>({ x: 0, y: 0 });
  const score = useRef(0);
  const [, redraw] = useState(0);

  const placeFood = () => {
    let spot: Cell;
    do {
      spot = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * rows) };
    } while (snake.current.some((s) => s.x === spot.x && s.y === spot.y));
    food.current = spot;
  };

  useEffect(() => {
    const cy = Math.floor(rows / 2);
    snake.current = [
      { x: 5, y: cy },
      { x: 4, y: cy },
      { x: 3, y: cy },
    ];
    dir.current = 'right';
    queue.current = [];
    score.current = 0;
    api.setScore(0);
    placeFood();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken, rows]);

  const pan = useSwipe((d) => {
    // Buffer up to 2 turns; ignore direct reversals against the *last queued*
    // heading, matching original handheld behavior.
    const last = queue.current[queue.current.length - 1] ?? dir.current;
    if (d === last || d === OPPOSITE[last]) return;
    if (queue.current.length < 2) queue.current.push(d);
  });

  // Speed: -6ms per food eaten, floor at MIN_MS — the classic ramp.
  const intervalMs = Math.max(MIN_MS, START_MS - (snake.current.length - 3) * 6);

  useTick(api.running, intervalMs, () => {
    if (queue.current.length > 0) dir.current = queue.current.shift()!;
    const head = snake.current[0];
    const d = DELTA[dir.current];
    const next: Cell = { x: head.x + d.x, y: head.y + d.y };

    const hitWall = next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= rows;
    const hitSelf = snake.current.some((s) => s.x === next.x && s.y === next.y);
    if (hitWall || hitSelf) {
      api.end({ score: score.current });
      return;
    }

    snake.current.unshift(next);
    if (next.x === food.current.x && next.y === food.current.y) {
      score.current += 10;
      api.setScore(score.current);
      playSfx('eat');
      haptic.light();
      placeFood();
    } else {
      snake.current.pop();
    }
    redraw((n) => n + 1);
  });

  const boardW = COLS * cell;
  const boardH = rows * cell;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
      <View
        pointerEvents="none"
        style={{
          width: boardW,
          height: boardH,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.bgRaised,
        }}>
        {snake.current.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.x * cell,
              top: s.y * cell,
              width: cell - 1,
              height: cell - 1,
              backgroundColor: i === 0 ? colors.neonGreen : '#2bcc10',
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: food.current.x * cell,
            top: food.current.y * cell,
            width: cell - 1,
            height: cell - 1,
            backgroundColor: colors.neonMagenta,
            borderRadius: cell / 2,
          }}
        />
      </View>
    </View>
  );
}
