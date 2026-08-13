import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSwipe } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Frogger-style road crosser: hop across five lanes of traffic, a median,
 * then five river lanes riding logs, into one of five home slots. Faithful
 * rules: water without a log is fatal, filled home slots close, filling all
 * five advances the level and speeds up every lane. Forward hops score 10,
 * a home slot 50, clearing the board 200 — the original's scoring. No hop
 * timer: menus and aiming stay pressure-free for older players.
 */
const COLS = 13;
const HOME_SLOTS = [1, 3.75, 6.5, 9.25, 12]; // slot centers in grid columns

interface Lane {
  row: number;
  speed: number; // px/s, signed
  length: number; // entity length in cells
  gap: number; // gap between entities in cells
  kind: 'car' | 'log';
  color: string;
  offset: number;
}

export function RoadHopperGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const ROWS = 13;
  const cell = Math.min(Math.floor(W / COLS), Math.floor(H / ROWS));
  const boardW = COLS * cell;
  const ox = Math.floor((W - boardW) / 2);

  // Row map (top→bottom): 0 homes, 1-5 river, 6 median, 7-11 road, 12 start.
  const lanes = useRef<Lane[]>([]);
  const frog = useRef({ col: 6, row: 12, px: 0 }); // px = continuous x while on a log
  const homes = useRef<boolean[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const level = useRef(1);
  const maxRow = useRef(12);
  const [, redraw] = useState(0);

  const laneDefs = (): Lane[] => {
    const speedup = 1 + (level.current - 1) * 0.15;
    const base = W * 0.08 * speedup;
    return [
      { row: 1, speed: base * 1.3, length: 4, gap: 5, kind: 'log', color: '#8a5a2b', offset: 0 },
      { row: 2, speed: -base * 0.9, length: 3, gap: 4, kind: 'log', color: '#a06a33', offset: 2 },
      { row: 3, speed: base * 1.6, length: 5, gap: 6, kind: 'log', color: '#8a5a2b', offset: 4 },
      { row: 4, speed: -base * 1.1, length: 3, gap: 5, kind: 'log', color: '#a06a33', offset: 1 },
      { row: 5, speed: base * 0.8, length: 4, gap: 4, kind: 'log', color: '#8a5a2b', offset: 3 },
      { row: 7, speed: -base * 1.2, length: 2, gap: 5, kind: 'car', color: colors.neonYellow, offset: 0 },
      { row: 8, speed: base * 1.5, length: 1, gap: 4, kind: 'car', color: colors.neonCyan, offset: 2 },
      { row: 9, speed: -base * 1.8, length: 2, gap: 6, kind: 'car', color: colors.neonMagenta, offset: 4 },
      { row: 10, speed: base, length: 1, gap: 3, kind: 'car', color: colors.neonOrange, offset: 1 },
      { row: 11, speed: -base * 1.4, length: 2, gap: 5, kind: 'car', color: colors.neonRed, offset: 3 },
    ];
  };

  const resetFrog = () => {
    frog.current = { col: 6, row: 12, px: (6 + 0.5) * cell };
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    level.current = 1;
    maxRow.current = 12;
    homes.current = Array(5).fill(false);
    lanes.current = laneDefs();
    api.setScore(0);
    api.setLives(3);
    resetFrog();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const die = () => {
    playSfx('loseLife');
    haptic.heavy();
    lives.current -= 1;
    api.setLives(lives.current);
    maxRow.current = 12;
    if (lives.current <= 0) {
      api.end({ score: score.current });
      return true;
    }
    resetFrog();
    return false;
  };

  /** Entity x-positions (px, left edge) for a lane at the current time. */
  const entities = (lane: Lane, now: number): { left: number; width: number }[] => {
    const span = (lane.length + lane.gap) * cell;
    const width = lane.length * cell;
    const shift = ((now * lane.speed) % span) + lane.offset * cell;
    const out: { left: number; width: number }[] = [];
    for (let x = -span * 2; x < boardW + span; x += span) {
      out.push({ left: x + ((shift % span) + span) % span, width });
    }
    return out;
  };

  const clock = useRef(0);

  const pan = useSwipe((dir) => {
    if (!api.running) return;
    const f = frog.current;
    if (dir === 'left' && f.col > 0) f.col -= 1;
    if (dir === 'right' && f.col < COLS - 1) f.col += 1;
    if (dir === 'down' && f.row < 12) f.row += 1;
    if (dir === 'up' && f.row > 0) {
      f.row -= 1;
      if (f.row < maxRow.current) {
        maxRow.current = f.row;
        score.current += 10;
        api.setScore(score.current);
      }
    }
    f.px = (f.col + 0.5) * cell;
    playSfx('eat');
    haptic.light();

    // Reaching the home row: land in an open slot or perish.
    if (f.row === 0) {
      const idx = HOME_SLOTS.findIndex((c) => Math.abs(c - f.col) <= 0.9);
      if (idx >= 0 && !homes.current[idx]) {
        homes.current[idx] = true;
        score.current += 50;
        api.setScore(score.current);
        playSfx('point');
        haptic.medium();
        if (homes.current.every(Boolean)) {
          score.current += 200;
          api.setScore(score.current);
          level.current += 1;
          homes.current = Array(5).fill(false);
          lanes.current = laneDefs();
          playSfx('win');
          haptic.success();
        }
        maxRow.current = 12;
        resetFrog();
      } else if (die()) {
        return;
      }
    }
  });

  useGameLoop(api.running, (dt) => {
    clock.current += dt;
    const f = frog.current;
    const lane = lanes.current.find((l) => l.row === f.row);

    if (lane) {
      const es = entities(lane, clock.current);
      const frogLeft = f.px - cell * 0.4;
      const frogRight = f.px + cell * 0.4;
      const onEntity = es.find((e) => frogRight > e.left + 4 && frogLeft < e.left + e.width - 4);
      if (lane.kind === 'car') {
        if (onEntity && die()) return;
      } else {
        // River: ride the log or drown.
        if (onEntity) {
          f.px += lane.speed * dt;
          f.col = Math.round(f.px / cell - 0.5);
          if (f.px < 0 || f.px > boardW) {
            if (die()) return;
          }
        } else if (die()) {
          return;
        }
      }
    } else {
      f.px = (f.col + 0.5) * cell;
    }
    redraw((n) => n + 1);
  });

  const rowColor = (row: number) =>
    row === 0 ? '#0d2d0d' : row <= 5 ? '#0a1a3a' : row === 6 || row === 12 ? '#1c1033' : '#101018';

  const f = frog.current;

  return (
    <View style={{ flex: 1, alignItems: 'center' }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ width: boardW, height: ROWS * cell, marginLeft: ox > 0 ? 0 : undefined }}>
        {Array.from({ length: ROWS }, (_, row) => (
          <View
            key={row}
            style={{
              position: 'absolute',
              top: row * cell,
              left: 0,
              width: boardW,
              height: cell,
              backgroundColor: rowColor(row),
            }}
          />
        ))}
        {HOME_SLOTS.map((c, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: 2,
              left: (c - 0.5) * cell,
              width: cell,
              height: cell - 4,
              borderWidth: 2,
              borderColor: homes.current[i] ? colors.neonGreen : colors.border,
              backgroundColor: homes.current[i] ? '#123f12' : colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {homes.current[i] && (
              <View style={{ width: cell * 0.5, height: cell * 0.5, borderRadius: cell * 0.25, backgroundColor: colors.neonGreen }} />
            )}
          </View>
        ))}
        {lanes.current.map((lane) =>
          entities(lane, clock.current).map((e, i) => (
            <View
              key={`${lane.row}-${i}`}
              style={{
                position: 'absolute',
                top: lane.row * cell + 3,
                left: e.left,
                width: e.width,
                height: cell - 6,
                borderRadius: lane.kind === 'log' ? cell / 3 : 3,
                backgroundColor: lane.color,
              }}
            />
          ))
        )}
        <View
          style={{
            position: 'absolute',
            top: f.row * cell + 4,
            left: f.px - (cell - 8) / 2,
            width: cell - 8,
            height: cell - 8,
            borderRadius: 4,
            backgroundColor: colors.neonGreen,
          }}
        />
      </View>
    </View>
  );
}
