import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Columns-style falling-gem matcher: a stack of three gems drops into a
 * 6×13 well. Drag sideways to steer, tap to cycle the gem order, drag down
 * to drop faster. Three or more of a color in any line — across, down, or
 * diagonal — shatters, gravity compacts, and chains multiply the score
 * (30 × gems × chain). Speed and a sixth color arrive as you clear more.
 */
const COLS = 6;
const ROWS = 13;

const GEM_COLORS = [
  colors.neonRed,
  colors.neonGreen,
  colors.neonCyan,
  colors.neonYellow,
  colors.neonPurple,
  colors.neonOrange, // joins at level 3
];

interface Piece {
  col: number;
  /** Row of the TOP gem; the piece occupies row, row+1, row+2. */
  row: number;
  gems: [number, number, number];
}

export function GemColumnsGame({ api }: { api: GameApi }) {
  const cell = Math.floor(Math.min(api.width / (COLS + 2), (api.height - PAD_BAR) / ROWS));
  const boardW = COLS * cell;

  const grid = useRef<(number | null)[]>([]);
  const piece = useRef<Piece>({ col: 2, row: -3, gems: [0, 1, 2] });
  const cleared = useRef(0);
  const score = useRef(0);
  const over = useRef(false);
  const [, redraw] = useState(0);

  const level = () => Math.floor(cleared.current / 30) + 1;
  const colorCount = () => (level() >= 3 ? 6 : 5);
  const gravityMs = () => Math.max(160, 620 - (level() - 1) * 55);

  const at = (col: number, row: number): number | null =>
    row >= 0 && row < ROWS && col >= 0 && col < COLS ? grid.current[row * COLS + col] : null;

  const rand = () => Math.floor(Math.random() * colorCount());

  const spawn = () => {
    piece.current = { col: 2, row: -3, gems: [rand(), rand(), rand()] };
  };

  useEffect(() => {
    grid.current = Array(COLS * ROWS).fill(null);
    cleared.current = 0;
    score.current = 0;
    over.current = false;
    api.setScore(0);
    spawn();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const canOccupy = (col: number, topRow: number): boolean => {
    if (col < 0 || col >= COLS) return false;
    for (let i = 0; i < 3; i++) {
      const r = topRow + i;
      if (r >= ROWS) return false;
      if (r >= 0 && grid.current[r * COLS + col] !== null) return false;
    }
    return true;
  };

  /** Clears all 3+ lines, compacts, chains. Returns total gems shattered. */
  const resolve = () => {
    let chain = 0;
    for (;;) {
      const doomed = new Set<number>();
      const DIRS = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const color = at(col, row);
          if (color === null) continue;
          for (const [dc, dr] of DIRS) {
            let len = 1;
            while (at(col + dc * len, row + dr * len) === color) len++;
            if (len >= 3) {
              for (let i = 0; i < len; i++) {
                doomed.add((row + dr * i) * COLS + (col + dc * i));
              }
            }
          }
        }
      }
      if (doomed.size === 0) break;
      chain += 1;
      doomed.forEach((i) => {
        grid.current[i] = null;
      });
      cleared.current += doomed.size;
      score.current += 30 * doomed.size * chain;
      api.setScore(score.current);
      playSfx(chain > 1 ? 'powerUp' : 'match');
      if (chain > 1) haptic.medium();
      else haptic.light();

      // Gravity: compact every column downward.
      for (let col = 0; col < COLS; col++) {
        const stack: number[] = [];
        for (let row = ROWS - 1; row >= 0; row--) {
          const v = at(col, row);
          if (v !== null) stack.push(v);
        }
        for (let row = ROWS - 1; row >= 0; row--) {
          grid.current[row * COLS + col] = stack[ROWS - 1 - row] ?? null;
        }
      }
    }
  };

  const lock = () => {
    const p = piece.current;
    for (let i = 0; i < 3; i++) {
      const r = p.row + i;
      if (r < 0) {
        // Locked while poking above the well: game over.
        over.current = true;
        api.end({ score: score.current });
        return;
      }
      grid.current[r * COLS + p.col] = p.gems[i];
    }
    playSfx('bounce');
    resolve();
    spawn();
  };

  const step = () => {
    if (canOccupy(piece.current.col, piece.current.row + 1)) {
      piece.current.row += 1;
      redraw((n) => n + 1);
    } else {
      lock();
      redraw((n) => n + 1);
    }
  };

  useTick(api.running && !over.current, gravityMs(), step);

  const move = (dCol: number) => {
    if (canOccupy(piece.current.col + dCol, piece.current.row)) {
      piece.current.col += dCol;
      playSfx('select');
      redraw((n) => n + 1);
    }
  };

  const cycle = () => {
    const [a, b, c] = piece.current.gems;
    piece.current.gems = [c, a, b];
    playSfx('flip');
    haptic.light();
    redraw((n) => n + 1);
  };

  const acc = useRef({ dx: 0, dy: 0, moved: false, t0: 0 });
  const apiRef = useRef(api);
  apiRef.current = api;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        acc.current = { dx: 0, dy: 0, moved: false, t0: Date.now() };
      },
      onPanResponderMove: (_evt, g) => {
        if (!apiRef.current.running) return;
        const stepPx = cell * 1.1;
        while (g.dx - acc.current.dx > stepPx) {
          acc.current.dx += stepPx;
          acc.current.moved = true;
          move(1);
        }
        while (g.dx - acc.current.dx < -stepPx) {
          acc.current.dx -= stepPx;
          acc.current.moved = true;
          move(-1);
        }
        while (g.dy - acc.current.dy > stepPx) {
          acc.current.dy += stepPx;
          acc.current.moved = true;
          step(); // soft drop
        }
      },
      onPanResponderRelease: () => {
        if (!apiRef.current.running) return;
        if (!acc.current.moved && Date.now() - acc.current.t0 < 300) cycle();
      },
    })
  );

  const px = (api.width - boardW) / 2;

  const padDown = (k: string) => {
    if (!api.running || over.current) return;
    if (k === 'left') move(-1);
    else if (k === 'right') move(1);
    else if (k === 'cycle') cycle();
    else if (k === 'drop') step();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 8 }} {...pan.current.panHandlers}>
      <View
        pointerEvents="none"
        style={{
          width: boardW,
          height: ROWS * cell,
          marginLeft: px > 0 ? 0 : undefined,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.bgRaised,
        }}>
        {grid.current.map((v, i) =>
          v === null ? null : (
            <Gem key={i} x={(i % COLS) * cell} y={Math.floor(i / COLS) * cell} size={cell} color={GEM_COLORS[v]} />
          )
        )}
        {!over.current &&
          piece.current.gems.map((g, i) => {
            const r = piece.current.row + i;
            if (r < 0) return null;
            return (
              <Gem
                key={`p${i}`}
                x={piece.current.col * cell}
                y={r * cell}
                size={cell}
                color={GEM_COLORS[g]}
              />
            );
          })}
      </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀' },
          { key: 'cycle', label: '⟳' },
          { key: 'drop', label: '▼' },
          { key: 'right', label: '▶' },
        ]}
        onDown={padDown}
      />
    </View>
  );
}

function Gem({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x + 1,
        top: y + 1,
        width: size - 2,
        height: size - 2,
        borderRadius: size * 0.28,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: size * 0.15,
          backgroundColor: 'rgba(255,255,255,0.45)',
        }}
      />
    </View>
  );
}
