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
 * Battle City-style tank arena: brick walls crumble under fire, steel
 * pillars don't. Enemy tanks roam the maze and shoot when they see you down
 * a row or column. Destroy the whole patrol to bring in a faster wave.
 * Hold a direction to drive, ◎ to fire. 3 lives.
 */
const COLS = 13;

type Dir = 'up' | 'down' | 'left' | 'right';
const DELTA: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const ANGLE: Record<Dir, string> = { up: '0deg', right: '90deg', down: '180deg', left: '270deg' };

interface Tank {
  x: number; // px center
  y: number;
  dir: Dir;
  turnCd: number;
  fireCd: number;
}

interface Bullet {
  x: number;
  y: number;
  dir: Dir;
  mine: boolean;
}

export function TankBattleGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const cell = Math.floor(Math.min(W / COLS, H / 13));
  const ROWS = Math.floor(H / cell);
  const fieldW = COLS * cell;
  const fieldH = ROWS * cell;
  const ox = Math.floor((W - fieldW) / 2);
  const TANK = cell * 0.88;

  const brick = useRef<Set<string>>(new Set());
  const steel = useRef<Set<string>>(new Set());
  const player = useRef<Tank>({ x: 0, y: 0, dir: 'up', turnCd: 0, fireCd: 0 });
  const enemies = useRef<Tank[]>([]);
  const bullets = useRef<Bullet[]>([]);
  const held = useRef<Dir | null>(null);
  const lives = useRef(3);
  const score = useRef(0);
  const wave = useRef(1);
  const [, redraw] = useState(0);

  const key = (c: number, r: number) => `${c},${r}`;

  const buildMap = () => {
    brick.current = new Set();
    steel.current = new Set();
    for (let r = 1; r < ROWS - 2; r++) {
      for (let c = 0; c < COLS; c++) {
        // Keep spawn rows and a center corridor open.
        if (r <= 1 || r >= ROWS - 3) continue;
        if (r % 2 === 1 && c % 4 === 2) steel.current.add(key(c, r));
        else if (Math.random() < 0.24) brick.current.add(key(c, r));
      }
    }
  };

  const spawnEnemies = () => {
    const n = Math.min(6, 2 + wave.current);
    enemies.current = Array.from({ length: n }, (_, i) => ({
      x: ox + (i % 3 === 0 ? 0.5 : i % 3 === 1 ? COLS / 2 : COLS - 0.5) * cell + (i % 3 === 1 ? 0 : i % 3 === 0 ? cell / 2 - cell / 2 : 0),
      y: cell * 0.5 + cell,
      dir: 'down' as Dir,
      turnCd: 0.5 + i * 0.4,
      fireCd: 1.5 + i * 0.5,
    }));
    // Spread the spawns across the top row properly.
    enemies.current.forEach((e, i) => {
      const col = [0, Math.floor(COLS / 2), COLS - 1, 2, COLS - 3, Math.floor(COLS / 2) - 2][i % 6];
      e.x = ox + col * cell + cell / 2;
    });
  };

  const resetPlayer = () => {
    player.current = { x: ox + fieldW / 2, y: fieldH - cell * 1.5, dir: 'up', turnCd: 0, fireCd: 0 };
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    wave.current = 1;
    bullets.current = [];
    api.setScore(0);
    api.setLives(3);
    buildMap();
    spawnEnemies();
    resetPlayer();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Rect vs wall/bounds collision for a tank center at (x, y). */
  const blocked = (x: number, y: number, self: Tank): boolean => {
    const h = TANK / 2 - 1;
    if (x - h < ox || x + h > ox + fieldW || y - h < 0 || y + h > fieldH) return true;
    const c0 = Math.floor((x - h - ox) / cell);
    const c1 = Math.floor((x + h - ox) / cell);
    const r0 = Math.floor((y - h) / cell);
    const r1 = Math.floor((y + h) / cell);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        if (brick.current.has(key(c, r)) || steel.current.has(key(c, r))) return true;
      }
    }
    const all = [player.current, ...enemies.current];
    for (const t of all) {
      if (t === self) continue;
      if (Math.abs(t.x - x) < TANK * 0.95 && Math.abs(t.y - y) < TANK * 0.95) return true;
    }
    return false;
  };

  const fire = (t: Tank, mine: boolean) => {
    bullets.current.push({
      x: t.x + DELTA[t.dir].x * TANK * 0.6,
      y: t.y + DELTA[t.dir].y * TANK * 0.6,
      dir: t.dir,
      mine,
    });
    if (mine) playSfx('shoot');
  };

  const firePlayer = () => {
    if (!api.running) return;
    if (player.current.fireCd <= 0 && bullets.current.filter((b) => b.mine).length < 2) {
      fire(player.current, true);
      player.current.fireCd = 0.35;
      haptic.light();
    }
  };

  useGameLoop(api.running, (dt) => {
    const p = player.current;
    p.fireCd -= dt;

    // Drive while a direction is held.
    if (held.current) {
      p.dir = held.current;
      const sp = cell * 4.2;
      const nx = p.x + DELTA[p.dir].x * sp * dt;
      const ny = p.y + DELTA[p.dir].y * sp * dt;
      if (!blocked(nx, ny, p)) {
        p.x = nx;
        p.y = ny;
      }
    }

    // Enemy AI: drive, turn at blocks/on a timer, shoot when aligned.
    for (const e of enemies.current) {
      e.turnCd -= dt;
      e.fireCd -= dt;
      const sp = cell * (2.2 + wave.current * 0.25);
      const nx = e.x + DELTA[e.dir].x * sp * dt;
      const ny = e.y + DELTA[e.dir].y * sp * dt;
      if (blocked(nx, ny, e) || e.turnCd <= 0) {
        const dirs: Dir[] = ['up', 'down', 'left', 'right'];
        // Bias toward the player's side of the field.
        const prefer: Dir[] = [];
        if (Math.abs(p.x - e.x) > Math.abs(p.y - e.y)) prefer.push(p.x > e.x ? 'right' : 'left');
        else prefer.push(p.y > e.y ? 'down' : 'up');
        const pick = Math.random() < 0.5 ? prefer[0] : dirs[Math.floor(Math.random() * 4)];
        e.dir = pick;
        e.turnCd = 0.8 + Math.random() * 1.4;
      } else {
        e.x = nx;
        e.y = ny;
      }
      // Fire when roughly sharing a row/column with the player.
      if (e.fireCd <= 0 && (Math.abs(e.x - p.x) < cell * 0.7 || Math.abs(e.y - p.y) < cell * 0.7)) {
        // Face the player first so the shot makes sense.
        if (Math.abs(e.x - p.x) < cell * 0.7) e.dir = p.y > e.y ? 'down' : 'up';
        else e.dir = p.x > e.x ? 'right' : 'left';
        fire(e, false);
        e.fireCd = Math.max(0.9, 2 - wave.current * 0.15);
      }
    }

    // Bullets fly, chew bricks, bounce off nothing.
    const bsp = cell * 9;
    for (const b of bullets.current) {
      b.x += DELTA[b.dir].x * bsp * dt;
      b.y += DELTA[b.dir].y * bsp * dt;
      const c = Math.floor((b.x - ox) / cell);
      const r = Math.floor(b.y / cell);
      if (brick.current.delete(key(c, r))) {
        b.mine ? playSfx('brick') : null;
        b.x = -9999;
        continue;
      }
      if (steel.current.has(key(c, r))) {
        b.x = -9999;
        continue;
      }
      if (b.x < ox || b.x > ox + fieldW || b.y < 0 || b.y > fieldH) {
        b.x = -9999;
        continue;
      }
      if (b.mine) {
        for (let i = enemies.current.length - 1; i >= 0; i--) {
          const e = enemies.current[i];
          if (Math.abs(e.x - b.x) < TANK / 2 && Math.abs(e.y - b.y) < TANK / 2) {
            enemies.current.splice(i, 1);
            b.x = -9999;
            score.current += 100 * wave.current;
            api.setScore(score.current);
            playSfx('explode');
            haptic.medium();
            break;
          }
        }
      } else if (Math.abs(p.x - b.x) < TANK / 2 && Math.abs(p.y - b.y) < TANK / 2) {
        b.x = -9999;
        lives.current -= 1;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
        resetPlayer();
      }
    }
    bullets.current = bullets.current.filter((b) => b.x > -999);

    if (enemies.current.length === 0) {
      wave.current += 1;
      score.current += 200;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      buildMap();
      spawnEnemies();
    }
    redraw((n) => n + 1);
  });

  const cellsOf = (set: Set<string>) =>
    [...set].map((k) => k.split(',').map(Number) as [number, number]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {/* Arena floor */}
          <View
            style={{
              position: 'absolute',
              left: ox,
              top: 0,
              width: fieldW,
              height: fieldH,
              backgroundColor: '#0d0d16',
              borderWidth: 2,
              borderColor: colors.border,
            }}
          />
          {cellsOf(brick.current).map(([c, r]) => (
            <View
              key={`b${c},${r}`}
              style={{
                position: 'absolute',
                left: ox + c * cell + 1,
                top: r * cell + 1,
                width: cell - 2,
                height: cell - 2,
                backgroundColor: '#8a4a2b',
                borderWidth: 1,
                borderColor: '#5e3d1c',
              }}
            />
          ))}
          {cellsOf(steel.current).map(([c, r]) => (
            <View
              key={`s${c},${r}`}
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
          ))}
          {bullets.current.map((b, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: b.x - 3,
                top: b.y - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: b.mine ? colors.neonYellow : colors.neonRed,
              }}
            />
          ))}
          {enemies.current.map((e, i) => (
            <Image
              key={i}
              source={ACTORS.tank_red}
              style={{
                position: 'absolute',
                left: e.x - TANK / 2,
                top: e.y - TANK / 2,
                width: TANK,
                height: TANK,
                transform: [{ rotate: ANGLE[e.dir] }],
              }}
            />
          ))}
          <Image
            source={ACTORS.tank_green}
            style={{
              position: 'absolute',
              left: player.current.x - TANK / 2,
              top: player.current.y - TANK / 2,
              width: TANK,
              height: TANK,
              transform: [{ rotate: ANGLE[player.current.dir] }],
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀' },
          { key: 'up', label: '▲' },
          { key: 'fire', label: '◎', wide: true },
          { key: 'down', label: '▼' },
          { key: 'right', label: '▶' },
        ]}
        onDown={(k) => {
          if (k === 'fire') firePlayer();
          else held.current = k as Dir;
        }}
        onUp={(k) => {
          if (k !== 'fire' && held.current === k) held.current = null;
        }}
      />
    </View>
  );
}
