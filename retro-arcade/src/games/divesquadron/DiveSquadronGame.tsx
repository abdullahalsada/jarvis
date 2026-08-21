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
 * Galaga-style formation shooter: enemies sit in a breathing formation, then
 * peel off in curving dives at your ship — the mechanic that separates it
 * from a plain invaders march. Divers are worth double (formation 50, diving
 * 100, like the original's bonus for risky shots). Missed divers loop back
 * into formation. Clear the formation to bring on a faster wave. 3 lives.
 *
 * Progression: score milestones upgrade the fighter — Mk2 (twin cannons) and
 * Mk3 (triple spread). Clearing all waves summons the mothership boss;
 * destroying it completes the game.
 */
const FCOLS = 8;
const FROWS = 4;
/** Score thresholds for the Mk2/Mk3 fighter upgrades. */
const TIER2_AT = 1600;
const TIER3_AT = 4000;
/** Waves to clear before the boss shows up. */
const BOSS_AFTER_WAVE = 3;
const BOSS_HP = 40;

interface Boss {
  x: number;
  y: number;
  dir: 1 | -1;
  hp: number;
  fireCd: number;
  flash: number;
}

interface BossShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Enemy {
  slot: number; // formation slot index
  state: 'formation' | 'diving';
  x: number;
  y: number;
  t: number; // dive progress 0..1
  diveStartX: number;
  diveTargetX: number;
}

interface Shot {
  x: number;
  y: number;
}

export function DiveSquadronGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const ALIEN = Math.floor(W / 15);
  const GAP = Math.floor(ALIEN * 0.55);
  const SHIP_W = ALIEN * 1.4;
  const SHIP_Y = H - 70;

  const enemies = useRef<Enemy[]>([]);
  const shots = useRef<Shot[]>([]);
  const ship = useRef(W / 2);
  const lives = useRef(3);
  const score = useRef(0);
  const wave = useRef(1);
  const breathe = useRef(0);
  const diveTimer = useRef(3);
  const fireCooldown = useRef(0);
  const boss = useRef<Boss | null>(null);
  const bossShots = useRef<BossShot[]>([]);
  const shownTier = useRef(1);
  const [, redraw] = useState(0);

  const tier = () =>
    score.current >= TIER3_AT ? 3 : score.current >= TIER2_AT ? 2 : 1;

  /** Ship upgrade fanfare when a score milestone is crossed. */
  const checkUpgrade = () => {
    const t = tier();
    if (t > shownTier.current) {
      shownTier.current = t;
      playSfx('powerUp');
      haptic.success();
    }
  };

  const slotPos = (slot: number): { x: number; y: number } => {
    const col = slot % FCOLS;
    const row = Math.floor(slot / FCOLS);
    const rackW = FCOLS * (ALIEN + GAP) - GAP;
    const sway = Math.sin(breathe.current) * ALIEN * 0.6;
    return {
      x: (W - rackW) / 2 + col * (ALIEN + GAP) + sway,
      y: 50 + row * (ALIEN + GAP),
    };
  };

  const spawnWave = () => {
    enemies.current = Array.from({ length: FCOLS * FROWS }, (_, slot) => {
      const p = { slot, state: 'formation' as const, t: 0, diveStartX: 0, diveTargetX: 0 };
      return { ...p, x: 0, y: 0 };
    });
    diveTimer.current = 2.5;
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    wave.current = 1;
    ship.current = W / 2;
    shots.current = [];
    boss.current = null;
    bossShots.current = [];
    shownTier.current = 1;
    api.setScore(0);
    api.setLives(3);
    spawnWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, x));
  });

  const held = useRef({ left: false, right: false });

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, ship.current + dx * W * 0.9 * dt));
    }
    breathe.current += dt * 1.2;

    // Launch dives: 1-2 enemies peel off, more often in later waves.
    diveTimer.current -= dt;
    if (!boss.current && diveTimer.current <= 0) {
      const inFormation = enemies.current.filter((e) => e.state === 'formation');
      const count = Math.min(inFormation.length, wave.current >= 3 ? 2 : 1);
      for (let i = 0; i < count; i++) {
        const e = inFormation[Math.floor(Math.random() * inFormation.length)];
        if (e.state === 'diving') continue;
        e.state = 'diving';
        e.t = 0;
        e.diveStartX = slotPos(e.slot).x;
        e.diveTargetX = ship.current;
      }
      diveTimer.current = Math.max(0.7, 2.2 - wave.current * 0.25);
    }

    const diveDuration = Math.max(1.4, 2.4 - wave.current * 0.15);
    for (const e of enemies.current) {
      if (e.state === 'formation') {
        const p = slotPos(e.slot);
        e.x = p.x;
        e.y = p.y;
      } else {
        e.t += dt / diveDuration;
        if (e.t >= 1) {
          // Missed the player: loop back into formation.
          e.state = 'formation';
          e.t = 0;
          continue;
        }
        // Curving dive: S-curve in x, accelerating plunge then exit in y.
        const startY = slotPos(e.slot).y;
        const curve = Math.sin(e.t * Math.PI * 2) * ALIEN * 2.5;
        e.x = e.diveStartX + (e.diveTargetX - e.diveStartX) * e.t + curve;
        e.y = startY + Math.sin(e.t * Math.PI) * (SHIP_Y + 40 - startY);
      }
    }

    // Auto-fire; the Mk2/Mk3 upgrades fire wider volleys, more in flight.
    fireCooldown.current -= dt;
    const t = tier();
    const maxInFlight = t === 1 ? 2 : t === 2 ? 4 : 6;
    if (fireCooldown.current <= 0 && shots.current.length < maxInFlight) {
      if (t === 1) {
        shots.current.push({ x: ship.current, y: SHIP_Y });
      } else {
        shots.current.push({ x: ship.current - 7, y: SHIP_Y });
        shots.current.push({ x: ship.current + 7, y: SHIP_Y });
        if (t === 3) shots.current.push({ x: ship.current, y: SHIP_Y - 6 });
      }
      fireCooldown.current = t === 1 ? 0.28 : t === 2 ? 0.24 : 0.2;
      playSfx('shoot');
    }
    for (const s of shots.current) s.y -= H * 1.05 * dt;
    shots.current = shots.current.filter((s) => s.y > -20);

    // ── Final boss: sweeps above, fires aimed bursts at the fighter ──
    if (boss.current) {
      const b = boss.current;
      const BOSS_W = ALIEN * 6;
      b.x += b.dir * W * 0.25 * dt;
      if (b.x < BOSS_W / 2 + 8) { b.x = BOSS_W / 2 + 8; b.dir = 1; }
      if (b.x > W - BOSS_W / 2 - 8) { b.x = W - BOSS_W / 2 - 8; b.dir = -1; }
      b.flash = Math.max(0, b.flash - dt);
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        // Aimed two-shot burst toward where the fighter is right now.
        const dx = ship.current - b.x;
        const dy = SHIP_Y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = H * 0.45;
        bossShots.current.push({ x: b.x - 12, y: b.y, vx: (dx / d) * sp, vy: (dy / d) * sp });
        bossShots.current.push({ x: b.x + 12, y: b.y, vx: (dx / d) * sp * 0.85, vy: (dy / d) * sp });
        b.fireCd = 1.0;
      }
      for (const s of bossShots.current) { s.x += s.vx * dt; s.y += s.vy * dt; }
      bossShots.current = bossShots.current.filter((s) => s.y < H + 20 && s.x > -20 && s.x < W + 20);

      // Boss shots vs the fighter.
      for (const s of bossShots.current) {
        if (s.y >= SHIP_Y && s.y <= SHIP_Y + 16 && Math.abs(s.x - ship.current) < SHIP_W / 2) {
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

      // Fighter shots vs the boss.
      const BOSS_H = ALIEN * 3;
      for (const s of shots.current) {
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
            api.end({ score: score.current + 1500, won: true });
            return;
          }
        }
      }
    }

    // Shots vs enemies.
    for (const s of shots.current) {
      for (let i = enemies.current.length - 1; i >= 0; i--) {
        const e = enemies.current[i];
        if (Math.abs(s.x - (e.x + ALIEN / 2)) < ALIEN * 0.7 && Math.abs(s.y - (e.y + ALIEN / 2)) < ALIEN * 0.7) {
          s.y = -100;
          score.current += (e.state === 'diving' ? 100 : 50) * wave.current;
          api.setScore(score.current);
          checkUpgrade();
          playSfx('explode');
          haptic.light();
          enemies.current.splice(i, 1);
          break;
        }
      }
    }

    // Divers vs ship.
    for (const e of enemies.current) {
      if (
        e.state === 'diving' &&
        Math.abs(e.x + ALIEN / 2 - ship.current) < (SHIP_W + ALIEN) / 2 - 4 &&
        e.y + ALIEN > SHIP_Y &&
        e.y < SHIP_Y + 14
      ) {
        e.state = 'formation';
        e.t = 0;
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

    if (!boss.current && enemies.current.length === 0) {
      playSfx('win');
      haptic.success();
      if (wave.current >= BOSS_AFTER_WAVE) {
        // All waves cleared: the mothership descends.
        boss.current = { x: W / 2, y: 90, dir: 1, hp: BOSS_HP, fireCd: 1.5, flash: 0 };
        playSfx('bonusRound');
      } else {
        wave.current += 1;
        spawnWave();
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Formation planes; divers flip nose-down and bats lead the top row */}
        {enemies.current.map((e, i) => (
          <Image
            key={i}
            source={Math.floor(e.slot / FCOLS) === 0 ? ACTORS.bat : ACTORS.plane_enemy}
            style={{
              position: 'absolute',
              left: e.x - ALIEN * 0.25,
              top: e.y - ALIEN * 0.25,
              width: ALIEN * 1.5,
              height: ALIEN * 1.5,
              transform: [{ rotate: e.state === 'diving' ? '180deg' : '0deg' }],
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
              height: 12,
              backgroundColor: colors.neonYellow,
            }}
          />
        ))}
        {/* Final boss: mothership with health bar and aimed shots */}
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
        {bossShots.current.map((s, i) => (
          <View
            key={`b${i}`}
            style={{
              position: 'absolute',
              left: s.x - 3,
              top: s.y - 3,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.neonRed,
            }}
          />
        ))}
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
