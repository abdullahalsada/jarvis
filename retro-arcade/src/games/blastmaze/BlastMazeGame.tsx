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
 * Bomberman-style blast maze: a grid of steel pillars and soft crates.
 * Drop a bomb (◎), step away, and the cross-shaped blast clears crates —
 * and anything else it touches, including you. Crates hide points; clear
 * every prowler to advance. Prowlers speed up each round. 3 lives.
 */
const COLS = 11;

type Dir = 'up' | 'down' | 'left' | 'right';
const DELTA: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

interface Prowler {
  x: number; // px center
  y: number;
  dir: Dir;
  turnCd: number;
}

interface Bomb {
  c: number;
  r: number;
  fuse: number;
  /** Passable for the player until they've fully stepped off it once —
   * a distance-based exemption left a window where the trailing edge of
   * the player still overlapped the bomb cell and they got stuck. */
  walkThrough: boolean;
}

interface Flame {
  c: number;
  r: number;
  ttl: number;
}

export function BlastMazeGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const cell = Math.floor(Math.min(W / COLS, H / 13));
  const ROWS = Math.max(9, Math.floor(H / cell) - (Math.floor(H / cell) % 2 === 0 ? 1 : 0));
  const fieldW = COLS * cell;
  const fieldH = ROWS * cell;
  const ox = Math.floor((W - fieldW) / 2);
  const SIZE = cell * 0.82;

  const crates = useRef<Set<string>>(new Set());
  const player = useRef({ x: 0, y: 0 });
  const prowlers = useRef<Prowler[]>([]);
  const bombs = useRef<Bomb[]>([]);
  const flames = useRef<Flame[]>([]);
  const held = useRef<Dir | null>(null);
  const lives = useRef(3);
  const score = useRef(0);
  const round = useRef(1);
  const [, redraw] = useState(0);

  const key = (c: number, r: number) => `${c},${r}`;
  const pillar = (c: number, r: number) => c % 2 === 1 && r % 2 === 1;
  const cellOf = (x: number, y: number) => ({ c: Math.round((x - ox - cell / 2) / cell), r: Math.round((y - cell / 2) / cell) });

  const buildMap = () => {
    crates.current = new Set();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (pillar(c, r)) continue;
        // Keep the player's corner and prowler corners open.
        if (c + r <= 2) continue;
        if (c >= COLS - 2 && r >= ROWS - 2) continue;
        if (c >= COLS - 2 && r <= 1) continue;
        if (c <= 1 && r >= ROWS - 2) continue;
        if (Math.random() < 0.42) crates.current.add(key(c, r));
      }
    }
  };

  const spawnProwlers = () => {
    const corners = [
      { c: COLS - 1, r: 0 },
      { c: COLS - 1, r: ROWS - 1 },
      { c: 0, r: ROWS - 1 },
    ];
    const n = Math.min(5, 2 + round.current);
    prowlers.current = Array.from({ length: n }, (_, i) => {
      const p = corners[i % corners.length];
      return {
        x: ox + p.c * cell + cell / 2,
        y: p.r * cell + cell / 2,
        dir: 'left' as Dir,
        turnCd: 0.4 + i * 0.3,
      };
    });
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    round.current = 1;
    bombs.current = [];
    flames.current = [];
    api.setScore(0);
    api.setLives(3);
    buildMap();
    spawnProwlers();
    player.current = { x: ox + cell / 2, y: cell / 2 };
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const solid = (c: number, r: number) =>
    c < 0 || c >= COLS || r < 0 || r >= ROWS || pillar(c, r) || crates.current.has(key(c, r)) ||
    bombs.current.some((b) => b.c === c && b.r === r);

  /** Circle-ish movement with wall sliding on the grid. */
  const tryMove = (obj: { x: number; y: number }, dir: Dir, sp: number, dt: number, isPlayer = false) => {
    const nx = obj.x + DELTA[dir].x * sp * dt;
    const ny = obj.y + DELTA[dir].y * sp * dt;
    const h = SIZE / 2 - 2;
    const corners = [
      [nx - h, ny - h],
      [nx + h, ny - h],
      [nx - h, ny + h],
      [nx + h, ny + h],
    ];
    const hit = corners.some(([x, y]) => {
      const c = Math.floor((x - ox) / cell);
      const r = Math.floor(y / cell);
      // A freshly-dropped bomb stays passable for the player until they've
      // fully stepped off it (the walkThrough flag, cleared in the loop).
      const passable = isPlayer && bombs.current.some((b) => b.c === c && b.r === r && b.walkThrough);
      return !passable && solid(c, r);
    });
    if (!hit) {
      obj.x = nx;
      obj.y = ny;
      return true;
    }
    return false;
  };

  const dropBomb = () => {
    if (!api.running || bombs.current.length >= 1 + Math.floor(round.current / 3)) return;
    const { c, r } = cellOf(player.current.x, player.current.y);
    if (bombs.current.some((b) => b.c === c && b.r === r)) return;
    bombs.current.push({ c, r, fuse: 2, walkThrough: true });
    playSfx('select');
    haptic.light();
  };

  const explode = (b: Bomb) => {
    playSfx('explode');
    haptic.heavy();
    flames.current.push({ c: b.c, r: b.r, ttl: 0.4 });
    for (const d of Object.values(DELTA)) {
      for (let i = 1; i <= 2; i++) {
        const c = b.c + d.x * i;
        const r = b.r + d.y * i;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS || pillar(c, r)) break;
        flames.current.push({ c, r, ttl: 0.4 });
        if (crates.current.delete(key(c, r))) {
          score.current += 10;
          api.setScore(score.current);
          break; // the blast stops at the crate it destroys
        }
      }
    }
  };

  useGameLoop(api.running, (dt) => {
    const p = player.current;
    if (held.current) tryMove(p, held.current, cell * 3.6, dt, true);

    // Once the player has fully left a bomb's cell, it becomes solid.
    const half = SIZE / 2;
    for (const b of bombs.current) {
      if (!b.walkThrough) continue;
      const cx = ox + b.c * cell + cell / 2;
      const cy = b.r * cell + cell / 2;
      if (Math.abs(p.x - cx) > cell / 2 + half || Math.abs(p.y - cy) > cell / 2 + half) {
        b.walkThrough = false;
      }
    }

    // Bombs tick down; chained flames detonate other bombs instantly.
    for (const b of bombs.current) b.fuse -= dt;
    let exploded = bombs.current.filter((b) => b.fuse <= 0);
    bombs.current = bombs.current.filter((b) => b.fuse > 0);
    while (exploded.length > 0) {
      const b = exploded.shift()!;
      explode(b);
      const chained = bombs.current.filter((q) =>
        flames.current.some((f) => f.c === q.c && f.r === q.r)
      );
      bombs.current = bombs.current.filter((q) => !chained.includes(q));
      exploded.push(...chained);
    }
    for (const f of flames.current) f.ttl -= dt;
    flames.current = flames.current.filter((f) => f.ttl > 0);

    // Prowlers wander the lanes.
    for (const e of prowlers.current) {
      e.turnCd -= dt;
      const sp = cell * (1.6 + round.current * 0.25);
      const moved = e.turnCd > 0 && tryMove(e, e.dir, sp, dt);
      if (!moved) {
        const dirs: Dir[] = ['up', 'down', 'left', 'right'];
        e.dir = dirs[Math.floor(Math.random() * 4)];
        e.turnCd = 0.7 + Math.random() * 1.5;
      }
    }

    // Flames burn prowlers and the player.
    const burned = (x: number, y: number) =>
      flames.current.some((f) => Math.abs(ox + f.c * cell + cell / 2 - x) < cell * 0.6 && Math.abs(f.r * cell + cell / 2 - y) < cell * 0.6);

    for (let i = prowlers.current.length - 1; i >= 0; i--) {
      const e = prowlers.current[i];
      if (burned(e.x, e.y)) {
        prowlers.current.splice(i, 1);
        score.current += 100 * round.current;
        api.setScore(score.current);
        playSfx('point');
        haptic.medium();
      }
    }

    const touched = prowlers.current.some(
      (e) => Math.abs(e.x - p.x) < SIZE * 0.8 && Math.abs(e.y - p.y) < SIZE * 0.8
    );
    if (burned(p.x, p.y) || touched) {
      lives.current -= 1;
      api.setLives(lives.current);
      playSfx('loseLife');
      haptic.heavy();
      if (lives.current <= 0) {
        api.end({ score: score.current });
        return;
      }
      player.current = { x: ox + cell / 2, y: cell / 2 };
      flames.current = [];
      bombs.current = [];
    }

    if (prowlers.current.length === 0) {
      round.current += 1;
      score.current += 300;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      buildMap();
      spawnProwlers();
      bombs.current = [];
      flames.current = [];
      player.current = { x: ox + cell / 2, y: cell / 2 };
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          <View
            style={{
              position: 'absolute',
              left: ox,
              top: 0,
              width: fieldW,
              height: fieldH,
              backgroundColor: '#10241a',
              borderWidth: 2,
              borderColor: colors.border,
            }}
          />
          {/* Steel pillars */}
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) =>
              pillar(c, r) ? (
                <View
                  key={`p${c},${r}`}
                  style={{
                    position: 'absolute',
                    left: ox + c * cell + 1,
                    top: r * cell + 1,
                    width: cell - 2,
                    height: cell - 2,
                    backgroundColor: '#9a9ab5',
                    borderWidth: 2,
                    borderColor: '#c0c0d2',
                  }}
                />
              ) : null
            )
          )}
          {/* Crates */}
          {[...crates.current].map((k) => {
            const [c, r] = k.split(',').map(Number);
            return (
              <View
                key={k}
                style={{
                  position: 'absolute',
                  left: ox + c * cell + 1,
                  top: r * cell + 1,
                  width: cell - 2,
                  height: cell - 2,
                  backgroundColor: '#8a5a2b',
                  borderWidth: 2,
                  borderColor: '#5e3d1c',
                }}
              />
            );
          })}
          {/* Bombs */}
          {bombs.current.map((b, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: ox + b.c * cell + cell * 0.15,
                top: b.r * cell + cell * 0.15,
                width: cell * 0.7,
                height: cell * 0.7,
                borderRadius: cell * 0.35,
                backgroundColor: '#101018',
                borderWidth: 2,
                borderColor: b.fuse < 0.7 ? colors.neonRed : colors.neonYellow,
              }}
            />
          ))}
          {/* Flames */}
          {flames.current.map((f, i) => (
            <View
              key={`f${i}`}
              style={{
                position: 'absolute',
                left: ox + f.c * cell + 2,
                top: f.r * cell + 2,
                width: cell - 4,
                height: cell - 4,
                borderRadius: 6,
                backgroundColor: colors.neonYellow,
                opacity: Math.min(1, f.ttl * 3),
              }}
            />
          ))}
          {/* Prowlers */}
          {prowlers.current.map((e, i) => (
            <Image
              key={i}
              source={ACTORS.ghost_cyan}
              style={{
                position: 'absolute',
                left: e.x - SIZE / 2,
                top: e.y - SIZE / 2,
                width: SIZE,
                height: SIZE,
              }}
            />
          ))}
          {/* The miner */}
          <Image
            source={ACTORS.miner}
            style={{
              position: 'absolute',
              left: player.current.x - SIZE / 2,
              top: player.current.y - SIZE / 2,
              width: SIZE,
              height: SIZE,
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀' },
          { key: 'up', label: '▲' },
          { key: 'bomb', label: '◎', wide: true },
          { key: 'down', label: '▼' },
          { key: 'right', label: '▶' },
        ]}
        onDown={(k) => {
          if (k === 'bomb') dropBomb();
          else held.current = k as Dir;
        }}
        onUp={(k) => {
          if (k !== 'bomb' && held.current === k) held.current = null;
        }}
      />
    </View>
  );
}
