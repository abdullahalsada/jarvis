import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Space Invaders-style: a 5x8 rack of invaders marches side to side,
 * dropping and reversing at each edge. The march accelerates as invaders die
 * — the original's signature tension (its accidental speed-up bug became the
 * defining mechanic, so we reproduce it deliberately). Bottom-row hits score
 * least, top-row most. Player has 3 lives; invaders fire back; reaching the
 * player's row ends the game. Ship auto-fires so one thumb is enough.
 *
 * Progression: score milestones upgrade the fighter — Mk2 (twin cannons) and
 * Mk3 (triple spread). Clearing all waves summons the mothership boss;
 * destroying it completes the game.
 */
const IROWS = 5;
const ICOLS = 8;
const ROW_SCORE = [30, 20, 20, 10, 10]; // top row worth most, like the original
/** Score thresholds for the Mk2/Mk3 fighter upgrades. */
const TIER2_AT = 500;
const TIER3_AT = 1500;
/** Waves to clear before the boss shows up. */
const BOSS_AFTER_WAVE = 3;
const BOSS_HP = 30;

interface Shot {
  x: number;
  y: number;
  vy: number;
  vx?: number;
}

interface Boss {
  x: number;
  y: number;
  dir: 1 | -1;
  hp: number;
  fireCd: number;
  /** Brief white flash after a hit. */
  flash: number;
}

export function SpaceDefendersGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
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
  const boss = useRef<Boss | null>(null);
  const shownTier = useRef(1);
  const [, redraw] = useState(0);

  const tier = () =>
    score.current >= TIER3_AT ? 3 : score.current >= TIER2_AT ? 2 : 1;

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
    boss.current = null;
    shownTier.current = 1;
    api.setScore(0);
    api.setLives(3);
    resetWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Ship upgrade fanfare when a score milestone is crossed. */
  const checkUpgrade = () => {
    const t = tier();
    if (t > shownTier.current) {
      shownTier.current = t;
      playSfx('powerUp');
      haptic.success();
    }
  };

  const pan = useSlideX((x) => {
    ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, x));
  });

  const held = useRef({ left: false, right: false });

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, ship.current + dx * W * 0.9 * dt));
    }
    const count = alive.current.filter(Boolean).length;

    if (!boss.current) {
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
    }

    // Auto-fire; the Mk2/Mk3 upgrades fire wider volleys, more in flight.
    fireCooldown.current -= dt;
    const t = tier();
    const maxInFlight = t === 1 ? 1 : t === 2 ? 4 : 6;
    if (fireCooldown.current <= 0 && playerShots.current.length < maxInFlight) {
      const vy = -H * 0.9;
      if (t === 1) {
        playerShots.current.push({ x: ship.current, y: SHIP_Y, vy });
      } else if (t === 2) {
        playerShots.current.push({ x: ship.current - 7, y: SHIP_Y, vy });
        playerShots.current.push({ x: ship.current + 7, y: SHIP_Y, vy });
      } else {
        playerShots.current.push({ x: ship.current, y: SHIP_Y, vy });
        playerShots.current.push({ x: ship.current - 8, y: SHIP_Y, vy, vx: -W * 0.07 });
        playerShots.current.push({ x: ship.current + 8, y: SHIP_Y, vy, vx: W * 0.07 });
      }
      fireCooldown.current = t === 1 ? 0.35 : t === 2 ? 0.3 : 0.24;
      playSfx('shoot');
    }

    // Alien fire from a random living column.
    if (!boss.current) {
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
    }

    // ── Final boss: sweeps the top, rains spread shots, soaks many hits ──
    if (boss.current) {
      const b = boss.current;
      const BOSS_W = ALIEN * 6;
      b.x += b.dir * W * 0.22 * dt;
      if (b.x < BOSS_W / 2 + 8) { b.x = BOSS_W / 2 + 8; b.dir = 1; }
      if (b.x > W - BOSS_W / 2 - 8) { b.x = W - BOSS_W / 2 - 8; b.dir = -1; }
      b.flash = Math.max(0, b.flash - dt);
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        for (const vx of [-W * 0.12, 0, W * 0.12]) {
          alienShots.current.push({ x: b.x, y: b.y + ALIEN, vy: H * 0.4, vx });
        }
        b.fireCd = 1.1;
      }
    }

    // Move shots
    for (const s of playerShots.current) { s.y += s.vy * dt; s.x += (s.vx ?? 0) * dt; }
    for (const s of alienShots.current) { s.y += s.vy * dt; s.x += (s.vx ?? 0) * dt; }
    playerShots.current = playerShots.current.filter((s) => s.y > -20 && s.x > -20 && s.x < W + 20);
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
          checkUpgrade();
          playSfx('explode');
          haptic.light();
        }
      }
    }

    // Player shots vs the boss.
    if (boss.current) {
      const b = boss.current;
      const BOSS_W = ALIEN * 6;
      const BOSS_H = ALIEN * 3;
      for (const s of playerShots.current) {
        if (Math.abs(s.x - b.x) < BOSS_W / 2 && s.y > b.y - BOSS_H / 2 && s.y < b.y + BOSS_H / 2) {
          s.y = -100;
          b.hp -= 1;
          b.flash = 0.08;
          score.current += 25;
          api.setScore(score.current);
          checkUpgrade();
          playSfx('brick');
          haptic.light();
          if (b.hp <= 0) {
            playSfx('explode');
            haptic.success();
            api.end({ score: score.current + 1000, won: true });
            return;
          }
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
    if (!boss.current) {
      const lowestRow = Math.max(
        ...alive.current.map((a, i) => (a ? Math.floor(i / ICOLS) : -1))
      );
      if (lowestRow >= 0 && rack.current.y + lowestRow * (ALIEN + GAP) + ALIEN >= SHIP_Y) {
        api.end({ score: score.current });
        return;
      }

      if (count === 0) {
        playSfx('win');
        haptic.success();
        if (wave.current >= BOSS_AFTER_WAVE) {
          // All waves cleared: the mothership descends.
          alienShots.current = [];
          boss.current = { x: W / 2, y: 90, dir: 1, hp: BOSS_HP, fireCd: 1.5, flash: 0 };
          playSfx('bonusRound');
        } else {
          wave.current += 1;
          resetWave();
        }
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {!boss.current && alive.current.map((a, i) => {
          if (!a) return null;
          const row = Math.floor(i / ICOLS);
          const col = i % ICOLS;
          return (
            // Two invader species: crabs up top, squids below.
            <Image
              key={i}
              source={row < 2 ? ACTORS.invader_magenta : ACTORS.invader_cyan}
              style={{
                position: 'absolute',
                left: rack.current.x + col * (ALIEN + GAP) - ALIEN * 0.25,
                top: rack.current.y + row * (ALIEN + GAP) - ALIEN * 0.25,
                width: ALIEN * 1.5,
                height: ALIEN * 1.5,
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
        {/* Final boss: mothership with health bar */}
        {boss.current && (
          <>
            <View
              style={{
                position: 'absolute',
                left: W / 2 - 60,
                top: 14,
                width: 120,
                height: 8,
                borderWidth: 1,
                borderColor: colors.neonRed,
                borderRadius: 4,
              }}>
              <View
                style={{
                  width: `${(boss.current.hp / BOSS_HP) * 100}%`,
                  height: '100%',
                  backgroundColor: colors.neonRed,
                  borderRadius: 3,
                }}
              />
            </View>
            <Image
              source={ACTORS.boss_saucer}
              style={{
                position: 'absolute',
                left: boss.current.x - ALIEN * 3,
                top: boss.current.y - ALIEN * 1.5,
                width: ALIEN * 6,
                height: ALIEN * 3,
                opacity: boss.current.flash > 0 ? 0.5 : 1,
              }}
            />
          </>
        )}
        {/* Player ship: cannon → Mk2 → Mk3 as the score milestones fall */}
        <Image
          source={tier() === 3 ? ACTORS.ship_mk3 : tier() === 2 ? ACTORS.ship_mk2 : ACTORS.cannon}
          style={{
            position: 'absolute',
            left: ship.current - SHIP_W * 0.75,
            top: SHIP_Y - SHIP_W * 0.75,
            width: SHIP_W * 1.5,
            height: SHIP_W * 1.5,
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
