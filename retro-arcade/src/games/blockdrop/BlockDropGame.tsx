import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { useSwipe } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Falling-blocks stacker: seven shapes tumble into the well — steer with
 * ◀ ▶, spin with ↻, and slam with ▼. Full rows vanish (up to four at
 * once for the big bonus) and the well speeds up every ten lines. Stack
 * to the ceiling and it's game over.
 */
const COLS = 10;
const ROWS = 18;

// The seven classic shapes as rotation sets of [col, row] offsets.
const SHAPES: { color: string; rots: number[][][] }[] = [
  { color: '#00fff7', rots: [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]] ] }, // I
  { color: '#ffe600', rots: [ [[1,0],[2,0],[1,1],[2,1]] ] }, // O
  { color: '#b14aed', rots: [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ] }, // T
  { color: '#39ff14', rots: [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]] ] }, // S
  { color: '#ff3b3b', rots: [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]] ] }, // Z
  { color: '#4a90ed', rots: [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ] }, // J
  { color: '#ff9f1c', rots: [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ] }, // L
];

export function BlockDropGame({ api }: { api: GameApi }) {
  const well = useRef<number[]>([]); // -1 empty, else shape index
  const piece = useRef({ shape: 0, rot: 0, c: 3, r: 0 });
  const nextShape = useRef(0);
  const lines = useRef(0);
  const score = useRef(0);
  const over = useRef(false);
  const [, redraw] = useState(0);

  const rand = () => Math.floor(Math.random() * SHAPES.length);

  const cellsFor = (shape: number, rot: number, c: number, r: number) =>
    SHAPES[shape].rots[rot % SHAPES[shape].rots.length].map(([dc, dr]) => [c + dc, r + dr]);

  const fits = (shape: number, rot: number, c: number, r: number) =>
    cellsFor(shape, rot, c, r).every(
      ([cc, rr]) => cc >= 0 && cc < COLS && rr < ROWS && (rr < 0 || well.current[rr * COLS + cc] < 0)
    );

  const spawn = () => {
    piece.current = { shape: nextShape.current, rot: 0, c: 3, r: -1 };
    nextShape.current = rand();
    if (!fits(piece.current.shape, 0, 3, 0)) {
      over.current = true;
      playSfx('gameOver');
      api.end({ score: score.current });
    } else {
      piece.current.r = 0;
    }
  };

  useEffect(() => {
    well.current = Array(COLS * ROWS).fill(-1);
    lines.current = 0;
    score.current = 0;
    over.current = false;
    nextShape.current = rand();
    api.setScore(0);
    spawn();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const move = (dc: number) => {
    if (!api.running || over.current) return;
    const p = piece.current;
    if (fits(p.shape, p.rot, p.c + dc, p.r)) {
      p.c += dc;
      playSfx('flip');
      redraw((n) => n + 1);
    }
  };

  const rotate = () => {
    if (!api.running || over.current) return;
    const p = piece.current;
    const nr = p.rot + 1;
    // Wall kicks: try in place, then one left/right.
    for (const kick of [0, -1, 1, -2, 2]) {
      if (fits(p.shape, nr, p.c + kick, p.r)) {
        p.rot = nr;
        p.c += kick;
        playSfx('select');
        redraw((n) => n + 1);
        return;
      }
    }
  };

  const lock = () => {
    const p = piece.current;
    for (const [cc, rr] of cellsFor(p.shape, p.rot, p.c, p.r)) {
      if (rr >= 0) well.current[rr * COLS + cc] = p.shape;
    }
    // Clear filled rows.
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (well.current.slice(r * COLS, r * COLS + COLS).every((v) => v >= 0)) {
        well.current.splice(r * COLS, COLS);
        well.current.unshift(...Array(COLS).fill(-1));
        cleared += 1;
        r += 1; // recheck the same row index after the shift
      }
    }
    if (cleared > 0) {
      lines.current += cleared;
      score.current += [0, 100, 300, 500, 800][cleared];
      api.setScore(score.current);
      playSfx(cleared >= 4 ? 'win' : 'match');
      haptic.medium();
    } else {
      playSfx('brick');
      haptic.light();
    }
    spawn();
  };

  const drop = (soft = false) => {
    if (!api.running || over.current) return;
    const p = piece.current;
    if (soft) {
      if (fits(p.shape, p.rot, p.c, p.r + 1)) {
        p.r += 1;
        score.current += 1;
        api.setScore(score.current);
      } else {
        lock();
      }
    } else {
      while (fits(p.shape, p.rot, p.c, p.r + 1)) {
        p.r += 1;
        score.current += 2;
      }
      api.setScore(score.current);
      lock();
    }
    redraw((n) => n + 1);
  };

  // Gravity speeds up every 10 lines.
  const interval = Math.max(120, 650 - Math.floor(lines.current / 10) * 60);
  useTick(api.running && !over.current, interval, () => {
    const p = piece.current;
    if (fits(p.shape, p.rot, p.c, p.r + 1)) {
      p.r += 1;
    } else {
      lock();
    }
    redraw((n) => n + 1);
  });

  // Swipes: left/right nudge, down slams, up rotates.
  const pan = useSwipe((d) => {
    if (d === 'left') move(-1);
    else if (d === 'right') move(1);
    else if (d === 'down') drop(false);
    else rotate();
  });

  const cell = Math.floor(Math.min((api.width - 90) / COLS, (api.height - PAD_BAR - 20) / ROWS));
  const bw = COLS * cell;
  const bh = ROWS * cell;
  const p = piece.current;
  const pieceCells = over.current ? [] : cellsFor(p.shape, p.rot, p.c, p.r);
  const nextCells = SHAPES[nextShape.current].rots[0];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ width: bw, height: bh, backgroundColor: '#0c0c16', borderWidth: 2, borderColor: colors.border }}>
          {well.current.map((v, i) =>
            v < 0 ? null : (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: (i % COLS) * cell,
                  top: Math.floor(i / COLS) * cell,
                  width: cell - 1,
                  height: cell - 1,
                  backgroundColor: SHAPES[v].color,
                  borderWidth: 2,
                  borderColor: 'rgba(0,0,0,0.35)',
                }}
              />
            )
          )}
          {pieceCells.map(([cc, rr], i) =>
            rr < 0 ? null : (
              <View
                key={`p${i}`}
                style={{
                  position: 'absolute',
                  left: cc * cell,
                  top: rr * cell,
                  width: cell - 1,
                  height: cell - 1,
                  backgroundColor: SHAPES[p.shape].color,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.4)',
                }}
              />
            )
          )}
        </View>
        {/* Next piece preview */}
        <View pointerEvents="none" style={{ width: 64, alignItems: 'center', gap: 6 }}>
          <View style={{ width: 56, height: 42, backgroundColor: '#0c0c16', borderWidth: 2, borderColor: colors.border }}>
            {nextCells.map(([cc, rr], i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: cc * 12 + 4,
                  top: rr * 12 + 4,
                  width: 11,
                  height: 11,
                  backgroundColor: SHAPES[nextShape.current].color,
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀' },
          { key: 'rotate', label: '↻', wide: true },
          { key: 'down', label: '▼', wide: true },
          { key: 'right', label: '▶' },
        ]}
        onDown={(k) => {
          if (k === 'left') move(-1);
          else if (k === 'right') move(1);
          else if (k === 'rotate') rotate();
          else drop(true);
        }}
      />
    </View>
  );
}
