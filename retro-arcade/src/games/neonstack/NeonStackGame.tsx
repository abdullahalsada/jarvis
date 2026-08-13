import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Falling-block stacker with the classic seven pieces (generic mechanics —
 * original neon styling, no trademarked names/branding). Faithful rules:
 * 10×18 well, line scores 40/100/300/1200 × (level+1) — the arcade scoring
 * table — level up every 10 lines with the gravity curve speeding up.
 * Touch: drag sideways to shift, tap to rotate (with wall kicks),
 * drag down to soft-drop, fling down to hard-drop.
 */
const COLS = 10;
const ROWS = 18;
const LINE_SCORES = [0, 40, 100, 300, 1200];

// Each piece: base cells + color. Rotation happens around cell (1,1).
const PIECES: { cells: [number, number][]; color: string }[] = [
  { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: colors.neonCyan }, // I
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#3c6cff' }, // J
  { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: colors.neonOrange }, // L
  { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: colors.neonYellow }, // O
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: colors.neonGreen }, // S
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: colors.neonPurple }, // T
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: colors.neonRed }, // Z
];

interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}

function cellsOf(p: Piece): [number, number][] {
  return PIECES[p.kind].cells.map(([cx, cy]) => {
    let rx = cx;
    let ry = cy;
    for (let i = 0; i < p.rot % 4; i++) {
      const t = rx;
      rx = 2 - ry; // rotate 90° clockwise around (1,1)
      ry = t;
    }
    return [p.x + rx, p.y + ry];
  });
}

export function NeonStackGame({ api }: { api: GameApi }) {
  const cell = Math.floor(Math.min(api.width / (COLS + 5), api.height / ROWS));
  const boardW = COLS * cell;

  const grid = useRef<(string | null)[]>([]);
  const piece = useRef<Piece>({ kind: 0, rot: 0, x: 3, y: 0 });
  const nextKind = useRef(0);
  const lines = useRef(0);
  const score = useRef(0);
  const over = useRef(false);
  const [, redraw] = useState(0);

  const level = () => Math.floor(lines.current / 10);
  const gravityMs = () => Math.max(90, 750 - level() * 65);

  const collides = (p: Piece) =>
    cellsOf(p).some(
      ([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid.current[y * COLS + x] !== null)
    );

  const rand = () => Math.floor(Math.random() * PIECES.length);

  const spawn = () => {
    piece.current = { kind: nextKind.current, rot: 0, x: 3, y: -1 };
    nextKind.current = rand();
    if (collides({ ...piece.current, y: 0 })) {
      over.current = true;
      api.end({ score: score.current });
    }
  };

  useEffect(() => {
    grid.current = Array(COLS * ROWS).fill(null);
    lines.current = 0;
    score.current = 0;
    over.current = false;
    api.setScore(0);
    nextKind.current = rand();
    spawn();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const tryMove = (dx: number, dy: number, drot = 0): boolean => {
    const moved = {
      ...piece.current,
      x: piece.current.x + dx,
      y: piece.current.y + dy,
      rot: piece.current.rot + drot,
    };
    if (!collides(moved)) {
      piece.current = moved;
      redraw((n) => n + 1);
      return true;
    }
    return false;
  };

  const rotate = () => {
    // Wall kicks: try in place, then one cell left/right.
    if (tryMove(0, 0, 1) || tryMove(-1, 0, 1) || tryMove(1, 0, 1)) {
      playSfx('flip');
      haptic.light();
    }
  };

  const lock = () => {
    for (const [x, y] of cellsOf(piece.current)) {
      if (y >= 0) grid.current[y * COLS + x] = PIECES[piece.current.kind].color;
    }
    playSfx('bounce');
    // Clear full rows.
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid.current.slice(y * COLS, (y + 1) * COLS).every((c) => c !== null)) {
        grid.current.splice(y * COLS, COLS);
        grid.current.unshift(...Array(COLS).fill(null));
        cleared += 1;
        y += 1; // recheck the same row index after shift
      }
    }
    if (cleared > 0) {
      score.current += LINE_SCORES[cleared] * (level() + 1);
      lines.current += cleared;
      api.setScore(score.current);
      playSfx(cleared === 4 ? 'win' : 'match');
      if (cleared === 4) haptic.success();
      else haptic.medium();
    }
    spawn();
  };

  const step = () => {
    if (!tryMove(0, 1)) lock();
  };

  const hardDrop = () => {
    let fell = 0;
    while (tryMove(0, 1)) fell += 1;
    score.current += fell * 2; // hard-drop bonus
    api.setScore(score.current);
    haptic.medium();
    lock();
  };

  useTick(api.running && !over.current, gravityMs(), step);

  // Touch: accumulate horizontal drag into cell moves; vertical drag soft-drops;
  // fast downward fling hard-drops; a no-move tap rotates.
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
          if (tryMove(1, 0)) playSfx('select');
        }
        while (g.dx - acc.current.dx < -stepPx) {
          acc.current.dx -= stepPx;
          acc.current.moved = true;
          if (tryMove(-1, 0)) playSfx('select');
        }
        while (g.dy - acc.current.dy > stepPx) {
          acc.current.dy += stepPx;
          acc.current.moved = true;
          if (tryMove(0, 1)) {
            score.current += 1; // soft-drop point per cell, like the classics
            apiRef.current.setScore(score.current);
          }
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (!apiRef.current.running) return;
        if (!acc.current.moved && Date.now() - acc.current.t0 < 300) {
          rotate();
        } else if (g.vy > 1.2 && g.dy > cell * 2) {
          hardDrop();
        }
      },
    })
  );

  const px = (Math.min(api.width, boardW + 5 * cell) - (boardW + 4 * cell)) / 2;
  const preview = cellsOf({ kind: nextKind.current, rot: 0, x: 0, y: 0 });

  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', paddingTop: 8 }} {...pan.current.panHandlers}>
      <View
        pointerEvents="none"
        style={{
          width: boardW,
          height: ROWS * cell,
          marginLeft: px > 0 ? px : 0,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.bgRaised,
        }}>
        {grid.current.map((c, i) =>
          c ? (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: (i % COLS) * cell,
                top: Math.floor(i / COLS) * cell,
                width: cell - 1,
                height: cell - 1,
                backgroundColor: c,
              }}
            />
          ) : null
        )}
        {!over.current &&
          cellsOf(piece.current).map(([x, y], i) =>
            y >= 0 ? (
              <View
                key={`p${i}`}
                style={{
                  position: 'absolute',
                  left: x * cell,
                  top: y * cell,
                  width: cell - 1,
                  height: cell - 1,
                  backgroundColor: PIECES[piece.current.kind].color,
                }}
              />
            ) : null
          )}
      </View>
      {/* Next-piece preview */}
      <View pointerEvents="none" style={{ marginLeft: cell, width: 4 * cell }}>
        <View
          style={{
            width: 4 * cell,
            height: 4 * cell,
            borderWidth: 2,
            borderColor: colors.border,
            backgroundColor: colors.bgRaised,
          }}>
          {preview.map(([x, y], i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: (x + 0.5) * cell,
                top: (y + 1) * cell,
                width: cell - 1,
                height: cell - 1,
                backgroundColor: PIECES[nextKind.current].color,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
