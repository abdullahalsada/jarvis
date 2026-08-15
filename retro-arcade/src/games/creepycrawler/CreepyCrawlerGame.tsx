import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Centipede-style with a graveyard theme: a segmented crawler weaves down
 * through a field of tombstones. The signature loop is intact — shooting a
 * middle segment splits the crawler in two, and every killed segment leaves
 * a new tombstone right there, so the field thickens as you fight. Crawlers
 * drop a row and reverse when they hit a stone or the edge. Body 10 pts,
 * head 100. Clearing a wave spawns a longer, faster one. 3 lives.
 */
const COLS = 14;

interface Segment {
  x: number; // grid col (float while moving)
  y: number; // grid row
  dir: 1 | -1;
  head: boolean;
}

interface Shot {
  x: number;
  y: number;
}

export function CreepyCrawlerGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const cell = Math.floor(W / COLS);
  const ROWS = Math.floor(H / cell);
  const PLAYER_ROW = ROWS - 2;

  const stones = useRef<Set<string>>(new Set());
  const crawlers = useRef<Segment[][]>([]);
  const shots = useRef<Shot[]>([]);
  const player = useRef(W / 2);
  const lives = useRef(3);
  const score = useRef(0);
  const wave = useRef(1);
  const fireCooldown = useRef(0);
  const [, redraw] = useState(0);

  const key = (x: number, y: number) => `${x},${y}`;

  const seedStones = () => {
    stones.current = new Set();
    const count = 22;
    while (stones.current.size < count) {
      const x = Math.floor(Math.random() * COLS);
      const y = 2 + Math.floor(Math.random() * (PLAYER_ROW - 5));
      stones.current.add(key(x, y));
    }
  };

  const spawnCrawler = () => {
    const len = Math.min(14, 7 + wave.current);
    const segs: Segment[] = [];
    for (let i = 0; i < len; i++) {
      segs.push({ x: -i - 1, y: 0, dir: 1, head: i === 0 });
    }
    crawlers.current = [segs];
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    wave.current = 1;
    player.current = W / 2;
    shots.current = [];
    api.setScore(0);
    api.setLives(3);
    seedStones();
    spawnCrawler();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    player.current = Math.max(cell / 2, Math.min(W - cell / 2, x));
  });

  const held = useRef({ left: false, right: false });

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      player.current = Math.max(cell / 2, Math.min(W - cell / 2, player.current + dx * W * 0.85 * dt));
    }
    // Crawler speed in cells/s; faster with each wave and as segments thin out.
    const speed = (3 + wave.current * 0.8) * (1 + (1 - crawlerCount() / 14) * 0.8);

    for (const segs of crawlers.current) {
      for (const s of segs) {
        const nx = s.x + s.dir * speed * dt;
        const nextCol = s.dir > 0 ? Math.ceil(nx) : Math.floor(nx);
        const blocked =
          nextCol < 0 || nextCol >= COLS || stones.current.has(key(nextCol, s.y));
        if (blocked && ((s.dir > 0 && nx > s.x) || (s.dir < 0 && nx < s.x))) {
          // Hit an edge or tombstone: drop a row and reverse.
          s.y += 1;
          s.dir = (s.dir * -1) as 1 | -1;
        } else {
          s.x = nx;
        }
      }
    }

    // Player auto-fire, one shot at a time until wave 3 doubles the rate.
    fireCooldown.current -= dt;
    const maxShots = wave.current >= 3 ? 2 : 1;
    if (fireCooldown.current <= 0 && shots.current.length < maxShots) {
      shots.current.push({ x: player.current, y: PLAYER_ROW * cell });
      fireCooldown.current = 0.3;
      playSfx('shoot');
    }
    for (const shot of shots.current) shot.y -= H * 1.1 * dt;
    shots.current = shots.current.filter((s) => s.y > -20);

    // Shots vs tombstones (two hits would be authentic; one keeps it snappy).
    for (const shot of shots.current) {
      const cx = Math.floor(shot.x / cell);
      const cy = Math.floor(shot.y / cell);
      if (stones.current.delete(key(cx, cy))) {
        shot.y = -100;
        score.current += 1;
        api.setScore(score.current);
        playSfx('brick');
      }
    }

    // Shots vs crawler segments — split on middle hits.
    for (const shot of shots.current) {
      const cy = Math.floor(shot.y / cell);
      outer: for (let ci = 0; ci < crawlers.current.length; ci++) {
        const segs = crawlers.current[ci];
        for (let si = 0; si < segs.length; si++) {
          const s = segs[si];
          if (s.y === cy && Math.abs((s.x + 0.5) * cell - shot.x) < cell * 0.6) {
            shot.y = -100;
            score.current += s.head ? 100 : 10;
            api.setScore(score.current);
            playSfx('explode');
            haptic.light();
            // Killed segment becomes a tombstone at its cell.
            const sx = Math.max(0, Math.min(COLS - 1, Math.round(s.x)));
            if (s.y >= 0 && s.y < PLAYER_ROW) stones.current.add(key(sx, s.y));
            // Split: front part keeps its head; rear part gets a new head.
            const front = segs.slice(0, si);
            const rear = segs.slice(si + 1);
            if (rear.length > 0) rear[0].head = true;
            crawlers.current.splice(ci, 1);
            if (front.length > 0) crawlers.current.push(front);
            if (rear.length > 0) crawlers.current.push(rear);
            break outer;
          }
        }
      }
    }

    // Wave cleared?
    if (crawlerCount() === 0) {
      wave.current += 1;
      playSfx('win');
      haptic.success();
      spawnCrawler();
    }

    // Crawler reaches the player row or touches the player.
    for (const segs of crawlers.current) {
      for (const s of segs) {
        const sx = (s.x + 0.5) * cell;
        const sy = (s.y + 0.5) * cell;
        const py = (PLAYER_ROW + 0.5) * cell;
        if (s.y >= PLAYER_ROW || (Math.abs(sx - player.current) < cell * 0.7 && Math.abs(sy - py) < cell * 0.7)) {
          lives.current -= 1;
          api.setLives(lives.current);
          playSfx('loseLife');
          haptic.heavy();
          if (lives.current <= 0) {
            api.end({ score: score.current });
            return;
          }
          spawnCrawler();
          return;
        }
      }
    }
    redraw((n) => n + 1);
  });

  const crawlerCount = () => crawlers.current.reduce((n, segs) => n + segs.length, 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {[...stones.current].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: x * cell + 2,
                top: y * cell + 2,
                width: cell - 4,
                height: cell - 4,
                borderTopLeftRadius: cell / 3,
                borderTopRightRadius: cell / 3,
                backgroundColor: '#4a4a6a',
              }}
            />
          );
        })}
        {crawlers.current.flat().map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.x * cell + 1,
              top: s.y * cell + 1,
              width: cell - 2,
              height: cell - 2,
              borderRadius: (cell - 2) / 2,
              backgroundColor: s.head ? colors.neonMagenta : colors.neonPurple,
            }}
          />
        ))}
        {shots.current.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.x - 2,
              top: s.y,
              width: 4,
              height: 10,
              backgroundColor: colors.neonYellow,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: player.current - cell * 0.4,
            top: PLAYER_ROW * cell,
            width: cell * 0.8,
            height: cell * 0.8,
            borderRadius: 4,
            backgroundColor: colors.neonGreen,
          }}
        />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => {
          held.current[k as 'left' | 'right'] = true;
        }}
        onUp={(k) => {
          held.current[k as 'left' | 'right'] = false;
        }}
      />
    </View>
  );
}
