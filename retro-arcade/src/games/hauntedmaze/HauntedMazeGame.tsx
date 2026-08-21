import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { DPad, PAD_DPAD } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Pac-Man-style maze chase with original theme: collect every orb while two
 * ghosts hunt you. Faithful mechanics: buffered turns (a queued turn executes
 * at the next junction where it fits), power star flips the chase for a few
 * seconds with ghosts worth doubling points (200/400), eaten ghosts respawn
 * at their den. Side tunnels wrap around like the arcade original.
 */
const MAZE = [
  '#############',
  '#o....#....o#',
  '#.##..#..##.#',
  '#...........#',
  '#.##.###.##.#',
  '#....# #....#',
  '####.# #.####',
  '   ......    ',
  '####.# #.####',
  '#....###....#',
  '#.##.....##.#',
  '#..#..#..#..#',
  '##.#..#..#.##',
  '#o....#....o#',
  '#############',
];
const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const TICK_MS = 170;
const FRIGHT_TICKS = 30;

type Cell = { x: number; y: number };

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

const isWall = (x: number, y: number) => {
  const row = MAZE[(y + ROWS) % ROWS];
  return row[(x + COLS) % COLS] === '#';
};
const wrap = (c: Cell): Cell => ({ x: (c.x + COLS) % COLS, y: (c.y + ROWS) % ROWS });

interface Ghost {
  pos: Cell;
  home: Cell;
  color: string;
  eaten: boolean;
}

export function HauntedMazeGame({ api }: { api: GameApi }) {
  const cell = Math.floor(Math.min(api.width / COLS, (api.height - PAD_DPAD) / ROWS));

  const player = useRef<Cell>({ x: 6, y: 10 });
  const dir = useRef<Dir>('left');
  const wanted = useRef<Dir | null>(null);
  const ghosts = useRef<Ghost[]>([]);
  const dots = useRef<Set<string>>(new Set());
  const stars = useRef<Set<string>>(new Set());
  const fright = useRef(0);
  const frightScore = useRef(200);
  const lives = useRef(3);
  const score = useRef(0);
  const [, redraw] = useState(0);

  const key = (c: Cell) => `${c.x},${c.y}`;

  const resetPositions = () => {
    player.current = { x: 6, y: 10 };
    dir.current = 'left';
    wanted.current = null;
    // Den: the open column at x=6 between the two center walls.
    ghosts.current = [
      { pos: { x: 6, y: 5 }, home: { x: 6, y: 5 }, color: colors.neonMagenta, eaten: false },
      { pos: { x: 6, y: 6 }, home: { x: 6, y: 6 }, color: colors.neonCyan, eaten: false },
    ];
    fright.current = 0;
  };

  useEffect(() => {
    dots.current = new Set();
    stars.current = new Set();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = MAZE[y][x];
        if (ch === '.') dots.current.add(`${x},${y}`);
        if (ch === 'o') stars.current.add(`${x},${y}`);
      }
    }
    lives.current = 3;
    score.current = 0;
    api.setScore(0);
    api.setLives(3);
    resetPositions();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  // Instant when the turn is legal right now (no waiting for the next tick),
  // buffered until a junction allows it otherwise; fed by D-pad and swipes.
  const steer = (d: Dir) => {
    if (tryMove(player.current, d)) {
      dir.current = d;
      wanted.current = null;
    } else {
      wanted.current = d;
    }
  };
  const pan = useSwipe(steer);

  const tryMove = (from: Cell, d: Dir): Cell | null => {
    const next = wrap({ x: from.x + DELTA[d].x, y: from.y + DELTA[d].y });
    return isWall(next.x, next.y) ? null : next;
  };

  const collide = () => {
    for (const g of ghosts.current) {
      if (g.eaten) continue;
      if (g.pos.x === player.current.x && g.pos.y === player.current.y) {
        if (fright.current > 0) {
          g.eaten = true;
          score.current += frightScore.current;
          frightScore.current *= 2;
          api.setScore(score.current);
          playSfx('point');
          haptic.medium();
        } else {
          lives.current -= 1;
          api.setLives(lives.current);
          playSfx('loseLife');
          haptic.heavy();
          if (lives.current <= 0) {
            api.end({ score: score.current });
            return true;
          }
          resetPositions();
        }
      }
    }
    return false;
  };

  useTick(api.running, fright.current > 0 ? TICK_MS * 1.25 : TICK_MS, () => {
    // Player: take the buffered turn when it fits, else continue straight.
    if (wanted.current) {
      const turned = tryMove(player.current, wanted.current);
      if (turned) {
        dir.current = wanted.current;
        wanted.current = null;
      }
    }
    const ahead = tryMove(player.current, dir.current);
    if (ahead) player.current = ahead;

    // Orbs and power stars
    const k = key(player.current);
    if (dots.current.delete(k)) {
      score.current += 10;
      api.setScore(score.current);
      playSfx('eat');
      haptic.light();
    }
    if (stars.current.delete(k)) {
      fright.current = FRIGHT_TICKS;
      frightScore.current = 200;
      score.current += 50;
      api.setScore(score.current);
      playSfx('powerUp');
      haptic.medium();
    }
    if (dots.current.size === 0 && stars.current.size === 0) {
      api.end({ score: score.current, won: true });
      return;
    }

    if (collide()) return;

    // Ghosts: chase (or flee when frightened); never reverse unless dead-ended.
    if (fright.current > 0) fright.current -= 1;
    for (const g of ghosts.current) {
      if (g.eaten) {
        g.pos = { ...g.home }; // respawn at den
        g.eaten = false;
        continue;
      }
      const back = OPPOSITE[ghostDir(g)] ?? null;
      const options = DIRS.map((d) => ({ d, next: tryMove(g.pos, d) })).filter(
        (o): o is { d: Dir; next: Cell } => o.next !== null && o.d !== back
      );
      const pool = options.length > 0 ? options : DIRS.map((d) => ({ d, next: tryMove(g.pos, d) })).filter(
        (o): o is { d: Dir; next: Cell } => o.next !== null
      );
      if (pool.length === 0) continue;
      const dist = (c: Cell) => {
        const dx = Math.min(Math.abs(c.x - player.current.x), COLS - Math.abs(c.x - player.current.x));
        const dy = Math.abs(c.y - player.current.y);
        return dx * dx + dy * dy;
      };
      pool.sort((a, b) => (dist(a.next) - dist(b.next)) * (fright.current > 0 ? -1 : 1));
      // Slight randomness so the two ghosts don't stack on one path.
      const pick = Math.random() < 0.8 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
      lastDirs.set(g, pick.d);
      g.pos = pick.next;
    }

    if (collide()) return;
    redraw((n) => n + 1);
  });

  const boardW = COLS * cell;
  const boardH = ROWS * cell;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ width: boardW, height: boardH }}>
        {MAZE.map((row, y) =>
          row.split('').map((ch, x) =>
            ch === '#' ? (
              <View
                key={`${x},${y}`}
                style={{
                  position: 'absolute',
                  left: x * cell,
                  top: y * cell,
                  width: cell,
                  height: cell,
                  backgroundColor: '#1b1b38',
                  borderWidth: 1,
                  borderColor: '#252550',
                }}
              />
            ) : null
          )
        )}
        {[...dots.current].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: x * cell + cell / 2 - 2,
                top: y * cell + cell / 2 - 2,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.neonYellow,
              }}
            />
          );
        })}
        {[...stars.current].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: x * cell + cell / 2 - 6,
                top: y * cell + cell / 2 - 6,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.neonYellow,
              }}
            />
          );
        })}
        {/* Ghosts: real sprites with eyes; frightened ghosts dim and shiver-tilt */}
        {ghosts.current.map((g, i) => (
          <Image
            key={i}
            source={i % 2 === 0 ? ACTORS.ghost_magenta : ACTORS.ghost_cyan}
            style={{
              position: 'absolute',
              left: g.pos.x * cell,
              top: g.pos.y * cell,
              width: cell,
              height: cell,
              opacity: g.eaten ? 0 : fright.current > 0 ? 0.45 : 1,
              // Always an array: toggling transform to undefined crashes RN on
              // device ("forEach of null") when the style diff removes it.
              transform: [{ rotate: fright.current > 0 ? '8deg' : '0deg' }],
            }}
          />
        ))}
        {/* Player: the brave little jack-o'-lantern */}
        <Image
          source={ACTORS.pumpkin}
          style={{
            position: 'absolute',
            left: player.current.x * cell,
            top: player.current.y * cell,
            width: cell,
            height: cell,
          }}
        />
        </View>
      </View>
      <DPad onDown={(k) => steer(k as Dir)} />
    </View>
  );
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const lastDirs = new WeakMap<Ghost, Dir>();
const ghostDir = (g: Ghost): Dir => lastDirs.get(g) ?? 'up';
