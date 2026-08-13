import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Space Invaders-style: a 5x8 rack of invaders marches side to side,
 * dropping and reversing at each edge. The march accelerates as invaders die
 * — the original's signature tension (its accidental speed-up bug became the
 * defining mechanic, so we reproduce it deliberately). Bottom-row hits score
 * least, top-row most. Player has 3 lives; invaders fire back; reaching the
 * player's row ends the game. Ship auto-fires so one thumb is enough.
 */
const IROWS = 5;
const ICOLS = 8;
const ROW_SCORE = [30, 20, 20, 10, 10]; // top row worth most, like the original

interface Shot {
  x: number;
  y: number;
  vy: number;
}

export function SpaceDefendersGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const ALIEN = Math.floor(W / 14);
  const GAP = Math.floor(ALIEN * 0.5);
  const SHIP_W = ALIEN * 1.4;
  const SHIP_Y = H - 70;

  const ship = useRef(W / 2);
  const alive = useRef<boolean[]>([]);
  const rack = useRef({ x: 0, y: 0, dir: 1 });
  const playerShots = useRef<Shot[]>([]);
  const alienShots = useRef<Shot[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const wave = useRef(1);
  const fireCooldown = useRef(0);
  const alienFireCooldown = useRef(2);
  const [, redraw] = useState(0);

  const resetWave = () => {
    alive.current = Array(IROWS * ICOLS).fill(true);
    rack.current = { x: (W - ICOLS * (ALIEN + GAP)) / 2, y: 40, dir: 1 };
    playerShots.current = [];
    alienShots.current = [];
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    wave.current = 1;
    ship.current = W / 2;
    api.setScore(0);
    api.setLives(3);
    resetWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, x));
  });

  useGameLoop(api.running, (dt) => {
    const count = alive.current.filter(Boolean).length;

    // March speed: crawls with a full rack, screams with few left.
    const speedScale = 1 + (1 - count / (IROWS * ICOLS)) * 5;
    const march = W * 0.045 * speedScale * (1 + (wave.current - 1) * 0.2);
    rack.current.x += rack.current.dir * march * dt;

    const rackW = ICOLS * (ALIEN + GAP) - GAP;
    if (rack.current.x < 8 || rack.current.x + rackW > W - 8) {
      rack.current.dir *= -1;
      rack.current.x = Math.max(8, Math.min(W - 8 - rackW, rack.current.x));
      rack.current.y += ALIEN * 0.6; // step down at each edge
    }

    // Auto-fire (one shot on screen at a time — an authentic Invaders rule).
    fireCooldown.current -= dt;
    if (fireCooldown.current <= 0 && playerShots.current.length === 0) {
      playerShots.current.push({ x: ship.current, y: SHIP_Y, vy: -H * 0.9 });
      fireCooldown.current = 0.35;
      playSfx('shoot');
    }

    // Alien fire from a random living column.
    alienFireCooldown.current -= dt;
    if (alienFireCooldown.current <= 0) {
      const shooters = alive.current
        .map((a, i) => (a ? i : -1))
        .filter((i) => i >= 0);
      if (shooters.length > 0) {
        const idx = shooters[Math.floor(Math.random() * shooters.length)];
        const col = idx % ICOLS;
        const row = Math.floor(idx / ICOLS);
        alienShots.current.push({
          x: rack.current.x + col * (ALIEN + GAP) + ALIEN / 2,
          y: rack.current.y + row * (ALIEN + GAP) + ALIEN,
          vy: H * 0.35 * (1 + wave.current * 0.1),
        });
      }
      alienFireCooldown.current = Math.max(0.5, 1.6 - wave.current * 0.15);
    }

    // Move shots
    for (const s of playerShots.current) s.y += s.vy * dt;
    for (const s of alienShots.current) s.y += s.vy * dt;
    playerShots.current = playerShots.current.filter((s) => s.y > -20);
    alienShots.current = alienShots.current.filter((s) => s.y < H + 20);

    // Player shot vs invaders
    for (const s of playerShots.current) {
      const col = Math.floor((s.x - rack.current.x) / (ALIEN + GAP));
      const row = Math.floor((s.y - rack.current.y) / (ALIEN + GAP));
      if (row >= 0 && row < IROWS && col >= 0 && col < ICOLS) {
        const idx = row * ICOLS + col;
        const inAlienX =
          s.x >= rack.current.x + col * (ALIEN + GAP) &&
          s.x <= rack.current.x + col * (ALIEN + GAP) + ALIEN;
        if (alive.current[idx] && inAlienX) {
          alive.current[idx] = false;
          s.y = -100; // consume the shot
          score.current += ROW_SCORE[row] * wave.current;
          api.setScore(score.current);
          playSfx('explode');
          haptic.light();
        }
      }
    }

    // Alien shots vs player
    for (const s of alienShots.current) {
      if (
        s.y >= SHIP_Y &&
        s.y <= SHIP_Y + 16 &&
        Math.abs(s.x - ship.current) < SHIP_W / 2
      ) {
        s.y = H + 100;
        lives.current -= 1;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
      }
    }

    // Invaders reaching the player's row = game over, like the original.
    const lowestRow = Math.max(
      ...alive.current.map((a, i) => (a ? Math.floor(i / ICOLS) : -1))
    );
    if (lowestRow >= 0 && rack.current.y + lowestRow * (ALIEN + GAP) + ALIEN >= SHIP_Y) {
      api.end({ score: score.current });
      return;
    }

    if (count === 0) {
      wave.current += 1;
      playSfx('win');
      haptic.success();
      resetWave();
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {alive.current.map((a, i) => {
          if (!a) return null;
          const row = Math.floor(i / ICOLS);
          const col = i % ICOLS;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: rack.current.x + col * (ALIEN + GAP),
                top: rack.current.y + row * (ALIEN + GAP),
                width: ALIEN,
                height: ALIEN,
                backgroundColor: row === 0 ? colors.neonMagenta : row < 3 ? colors.neonCyan : colors.neonGreen,
                borderRadius: 2,
              }}
            />
          );
        })}
        {playerShots.current.map((s, i) => (
          <View
            key={`p${i}`}
            style={{
              position: 'absolute',
              left: s.x - 2,
              top: s.y,
              width: 4,
              height: 12,
              backgroundColor: colors.neonYellow,
            }}
          />
        ))}
        {alienShots.current.map((s, i) => (
          <View
            key={`a${i}`}
            style={{
              position: 'absolute',
              left: s.x - 2,
              top: s.y,
              width: 4,
              height: 12,
              backgroundColor: colors.neonRed,
            }}
          />
        ))}
        {/* Player ship: simple chunky-pixel triangle-ish shape from two rects */}
        <View
          style={{
            position: 'absolute',
            left: ship.current - SHIP_W / 2,
            top: SHIP_Y,
            width: SHIP_W,
            height: 12,
            backgroundColor: colors.neonGreen,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: ship.current - 4,
            top: SHIP_Y - 8,
            width: 8,
            height: 8,
            backgroundColor: colors.neonGreen,
          }}
        />
      </View>
    </View>
  );
}
