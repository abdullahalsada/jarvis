import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { NeonButton } from '../../components/NeonButton';
import { type GameApi } from '../engine/GameShell';
import { useSwipe, type Dir } from '../engine/controls';
import { DPad, PAD_DPAD } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Sokoban-style crate puzzles: push every crate onto a glowing target.
 * Crates only push (never pull) — one wrong shove into a corner and you'll
 * need the undo. 10 handcrafted warehouses; score 100 per solve plus a
 * move-efficiency bonus. Undo rewinds one push at a time.
 */
// Legend: # wall, . floor, T target, C crate, P player start, X crate-on-target
const LEVELS: string[][] = [
  ['#####', '#P..#', '#.C.#', '#..T#', '#####'],
  ['######', '#P...#', '#.CC.#', '#.TT.#', '######'],
  ['#######', '#..T..#', '#.PC..#', '#..C..#', '#..T..#', '#######'],
  ['#######', '#T....#', '#.C.P.#', '#..C..#', '#....T#', '#######'],
  ['########', '#T...#.#', '#..C...#', '#.P.C..#', '#....T.#', '########'],
  ['########', '#...T..#', '#.#.C..#', '#PC..#.#', '#..T...#', '########'],
  ['########', '#..TT..#', '#..CC..#', '#..P...#', '#..CC..#', '#..TT..#', '########'],
  ['#########', '#..T.T..#', '#..C.C..#', '#...P...#', '#..C.C..#', '#..T.T..#', '#########'],
  ['#########', '#T..#..T#', '#.C...C.#', '#...P...#', '#.C...C.#', '#T..#..T#', '#########'],
  ['##########', '#T...#...#', '#.C..#.C.#', '#..P.....#', '#.C..#.C.#', '#T...#..T#', '#....#.T.#', '##########'],
];

type Board = {
  walls: Set<string>;
  targets: Set<string>;
  crates: Set<string>;
  px: number;
  py: number;
  cols: number;
  rows: number;
};

const parse = (rows: string[]): Board => {
  const b: Board = { walls: new Set(), targets: new Set(), crates: new Set(), px: 1, py: 1, cols: rows[0].length, rows: rows.length };
  rows.forEach((row, y) =>
    row.split('').forEach((ch, x) => {
      const k = `${x},${y}`;
      if (ch === '#') b.walls.add(k);
      if (ch === 'T' || ch === 'X') b.targets.add(k);
      if (ch === 'C' || ch === 'X') b.crates.add(k);
      if (ch === 'P') {
        b.px = x;
        b.py = y;
      }
    })
  );
  return b;
};

const DELTA: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

interface Snapshot {
  crates: string[];
  px: number;
  py: number;
}

export function CratePushGame({ api }: { api: GameApi }) {
  const [level, setLevel] = useState(0);
  const [board, setBoard] = useState<Board>(() => parse(LEVELS[0]));
  const moves = useRef(0);
  const history = useRef<Snapshot[]>([]);
  const score = useRef(0);
  const doneRef = useRef(false);

  const load = (idx: number) => {
    setLevel(idx);
    setBoard(parse(LEVELS[idx]));
    moves.current = 0;
    history.current = [];
  };

  useEffect(() => {
    score.current = 0;
    doneRef.current = false;
    api.setScore(0);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const step = (d: Dir) => {
    if (!api.running || doneRef.current) return;
    setBoard((prev) => {
      const nx = prev.px + DELTA[d].x;
      const ny = prev.py + DELTA[d].y;
      const k1 = `${nx},${ny}`;
      if (prev.walls.has(k1)) return prev;
      const crates = new Set(prev.crates);
      if (crates.has(k1)) {
        const k2 = `${nx + DELTA[d].x},${ny + DELTA[d].y}`;
        if (prev.walls.has(k2) || crates.has(k2)) return prev;
        crates.delete(k1);
        crates.add(k2);
        playSfx('brick');
        haptic.light();
      } else {
        playSfx('flip');
      }
      history.current.push({ crates: [...prev.crates], px: prev.px, py: prev.py });
      if (history.current.length > 200) history.current.shift();
      moves.current += 1;

      const next = { ...prev, crates, px: nx, py: ny };
      const solved = [...next.targets].every((t) => crates.has(t));
      if (solved) {
        const bonus = Math.max(0, 50 - moves.current);
        score.current += 100 + bonus;
        api.setScore(score.current);
        playSfx('win');
        haptic.success();
        if (level + 1 >= LEVELS.length) {
          doneRef.current = true;
          api.end({ score: score.current + 250, won: true });
        } else {
          setTimeout(() => load(level + 1), 450);
        }
      }
      return next;
    });
  };
  const pan = useSwipe(step);

  const undo = () => {
    if (!api.running) return;
    const snap = history.current.pop();
    if (!snap) return;
    setBoard((prev) => ({ ...prev, crates: new Set(snap.crates), px: snap.px, py: snap.py }));
    playSfx('select');
  };

  const cell = Math.floor(
    Math.min(api.width / board.cols, (api.height - PAD_DPAD - 40) / board.rows)
  );
  const bw = board.cols * cell;
  const bh = board.rows * cell;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6 }}>
        <PixelText size={11} color={colors.textDim}>{`▸ ${level + 1}/${LEVELS.length}`}</PixelText>
        <PixelText size={11} color={colors.textDim}>{`↔ ${moves.current}`}</PixelText>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ width: bw, height: bh }}>
          {Array.from({ length: board.rows }, (_, y) =>
            Array.from({ length: board.cols }, (_, x) => {
              const k = `${x},${y}`;
              if (board.walls.has(k)) {
                return (
                  <View
                    key={k}
                    style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell, backgroundColor: '#2a2a45', borderWidth: 1, borderColor: '#3a3a5c' }}
                  />
                );
              }
              return (
                <View
                  key={k}
                  style={{ position: 'absolute', left: x * cell, top: y * cell, width: cell, height: cell, backgroundColor: '#101020' }}
                />
              );
            })
          )}
          {[...board.targets].map((k) => {
            const [x, y] = k.split(',').map(Number);
            return (
              <View
                key={`t${k}`}
                style={{
                  position: 'absolute',
                  left: x * cell + cell * 0.3,
                  top: y * cell + cell * 0.3,
                  width: cell * 0.4,
                  height: cell * 0.4,
                  borderRadius: cell * 0.2,
                  borderWidth: 2,
                  borderColor: colors.neonGreen,
                }}
              />
            );
          })}
          {[...board.crates].map((k) => {
            const [x, y] = k.split(',').map(Number);
            const placed = board.targets.has(k);
            return (
              <View
                key={`c${k}`}
                style={{
                  position: 'absolute',
                  left: x * cell + 2,
                  top: y * cell + 2,
                  width: cell - 4,
                  height: cell - 4,
                  backgroundColor: placed ? '#2b7d2c' : '#8a5a2b',
                  borderWidth: 2,
                  borderColor: placed ? colors.neonGreen : '#5e3d1c',
                }}
              />
            );
          })}
          <Image
            source={ACTORS.miner}
            style={{ position: 'absolute', left: board.px * cell, top: board.py * cell, width: cell, height: cell }}
          />
        </View>
      </View>
      <View style={{ position: 'absolute', right: 14, top: 34 }}>
        <NeonButton label="↩" color={colors.neonYellow} variant="outline" onPress={undo} />
      </View>
      <DPad onDown={(k) => step(k as Dir)} />
    </View>
  );
}
