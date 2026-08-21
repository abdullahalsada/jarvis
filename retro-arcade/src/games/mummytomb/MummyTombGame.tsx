import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { PixelText } from '../../components/PixelText';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { DPad, PAD_DPAD } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Tutankham-style tomb raid: gather every treasure in the catacombs while
 * mummies stalk the corridors. You carry a magic zap (▲ on the pad fires it
 * along your facing) that destroys one mummy — you get 3 per tomb, and
 * treasures are 50 each. Clear the tomb to descend deeper: more mummies,
 * fewer zaps. 3 lives.
 */
const MAZE = [
  '#############',
  '#T....#....T#',
  '#.##..#..##.#',
  '#...........#',
  '#.##.###.##.#',
  '#..........T#',
  '####.###.####',
  '#T..........#',
  '#.##.###.##.#',
  '#.....#.....#',
  '#.##..#..##.#',
  '#T.......#.T#',
  '#############',
];
const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const TICK_MS = 190;

type Cell = { x: number; y: number };
const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

const isWall = (x: number, y: number) =>
  x < 0 || x >= COLS || y < 0 || y >= ROWS || MAZE[y][x] === '#';

export function MummyTombGame({ api }: { api: GameApi }) {
  const cell = Math.floor(Math.min(api.width / COLS, (api.height - PAD_DPAD) / ROWS));

  const player = useRef<Cell>({ x: 6, y: 9 });
  const dir = useRef<Dir>('left');
  const wanted = useRef<Dir | null>(null);
  const mummies = useRef<Cell[]>([]);
  const treasures = useRef<Set<string>>(new Set());
  const zaps = useRef(3);
  const zapFlash = useRef<Cell[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const depth = useRef(1);
  const [, redraw] = useState(0);

  const key = (c: Cell) => `${c.x},${c.y}`;

  const seed = () => {
    treasures.current = new Set();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (MAZE[y][x] === 'T') treasures.current.add(`${x},${y}`);
      }
    }
    const dens: Cell[] = [
      { x: 1, y: 1 },
      { x: COLS - 2, y: 1 },
      { x: 1, y: ROWS - 2 },
      { x: COLS - 2, y: ROWS - 2 },
    ];
    mummies.current = dens.slice(0, Math.min(4, 1 + depth.current)).map((c) => ({ ...c }));
    zaps.current = Math.max(1, 4 - depth.current);
    player.current = { x: 6, y: 9 };
    dir.current = 'left';
    wanted.current = null;
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    depth.current = 1;
    zapFlash.current = [];
    api.setScore(0);
    api.setLives(3);
    seed();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const tryMove = (from: Cell, d: Dir): Cell | null => {
    const next = { x: from.x + DELTA[d].x, y: from.y + DELTA[d].y };
    return isWall(next.x, next.y) ? null : next;
  };

  const steer = (d: Dir) => {
    if (tryMove(player.current, d)) {
      dir.current = d;
      wanted.current = null;
    } else {
      wanted.current = d;
    }
  };
  const pan = useSwipe(steer);

  /** The zap: clears the first mummy in the faced direction, line of sight. */
  const zap = () => {
    if (!api.running || zaps.current <= 0) return;
    zaps.current -= 1;
    const path: Cell[] = [];
    let c = { ...player.current };
    for (let i = 0; i < Math.max(COLS, ROWS); i++) {
      c = { x: c.x + DELTA[dir.current].x, y: c.y + DELTA[dir.current].y };
      if (isWall(c.x, c.y)) break;
      path.push({ ...c });
      const hit = mummies.current.findIndex((m) => m.x === c.x && m.y === c.y);
      if (hit >= 0) {
        mummies.current.splice(hit, 1);
        score.current += 150;
        api.setScore(score.current);
        playSfx('explode');
        haptic.medium();
        break;
      }
    }
    zapFlash.current = path;
    setTimeout(() => {
      zapFlash.current = [];
    }, 150);
    playSfx('shoot');
  };

  const caught = (): boolean =>
    mummies.current.some((m) => m.x === player.current.x && m.y === player.current.y);

  const handleCaught = (): boolean => {
    lives.current -= 1;
    api.setLives(lives.current);
    playSfx('loseLife');
    haptic.heavy();
    if (lives.current <= 0) {
      api.end({ score: score.current });
      return true;
    }
    player.current = { x: 6, y: 9 };
    return false;
  };

  useTick(api.running, TICK_MS, () => {
    if (wanted.current) {
      const turned = tryMove(player.current, wanted.current);
      if (turned) {
        dir.current = wanted.current;
        wanted.current = null;
      }
    }
    const ahead = tryMove(player.current, dir.current);
    if (ahead) player.current = ahead;

    const k = key(player.current);
    if (treasures.current.delete(k)) {
      score.current += 50;
      api.setScore(score.current);
      playSfx('coin');
      haptic.light();
    }
    if (treasures.current.size === 0) {
      depth.current += 1;
      score.current += 200;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      seed();
      redraw((n) => n + 1);
      return;
    }

    if (caught() && handleCaught()) return;

    // Mummies shamble toward you (never reverse unless boxed in).
    for (const m of mummies.current) {
      const options = DIRS.map((d) => ({ d, next: tryMove(m, d) })).filter(
        (o): o is { d: Dir; next: Cell } => o.next !== null
      );
      if (options.length === 0) continue;
      const dist = (c: Cell) =>
        Math.abs(c.x - player.current.x) + Math.abs(c.y - player.current.y);
      options.sort((a, b) => dist(a.next) - dist(b.next));
      // Depth makes them smarter: chance of taking the best route grows.
      const smart = Math.min(0.85, 0.5 + depth.current * 0.08);
      const pick = Math.random() < smart ? options[0] : options[Math.floor(Math.random() * options.length)];
      m.x = pick.next.x;
      m.y = pick.next.y;
    }

    if (caught() && handleCaught()) return;
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
                    backgroundColor: '#3a2c14',
                    borderWidth: 1,
                    borderColor: '#57431f',
                  }}
                />
              ) : null
            )
          )}
          {[...treasures.current].map((k) => {
            const [x, y] = k.split(',').map(Number);
            return (
              <Image
                key={k}
                source={ACTORS.gemstone}
                style={{
                  position: 'absolute',
                  left: x * cell + cell * 0.15,
                  top: y * cell + cell * 0.15,
                  width: cell * 0.7,
                  height: cell * 0.7,
                }}
              />
            );
          })}
          {zapFlash.current.map((c, i) => (
            <View
              key={`z${i}`}
              style={{
                position: 'absolute',
                left: c.x * cell + cell * 0.3,
                top: c.y * cell + cell * 0.3,
                width: cell * 0.4,
                height: cell * 0.4,
                borderRadius: cell * 0.2,
                backgroundColor: colors.neonYellow,
              }}
            />
          ))}
          {mummies.current.map((m, i) => (
            <Image
              key={i}
              source={ACTORS.mummy}
              style={{
                position: 'absolute',
                left: m.x * cell,
                top: m.y * cell,
                width: cell,
                height: cell,
              }}
            />
          ))}
          <Image
            source={ACTORS.miner}
            style={{
              position: 'absolute',
              left: player.current.x * cell,
              top: player.current.y * cell,
              width: cell,
              height: cell,
            }}
          />
          {/* Zap counter */}
          <View style={{ position: 'absolute', top: -2, right: 2, flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: zaps.current }, (_, i) => (
              <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neonYellow }} />
            ))}
          </View>
        </View>
      </View>
      <DPad onDown={(k) => steer(k as Dir)} />
      {/* Dedicated zap button beside the D-pad */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="zap"
        onPressIn={zap}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 18,
          bottom: 110,
          width: 64,
          height: 64,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.neonYellow,
          backgroundColor: pressed ? colors.neonYellow : 'rgba(16,16,24,0.85)',
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <PixelText size={24} color={colors.neonYellow}>
          ⚡
        </PixelText>
      </Pressable>
    </View>
  );
}
