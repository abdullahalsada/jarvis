import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Galaga-style formation shooter: enemies sit in a breathing formation, then
 * peel off in curving dives at your ship — the mechanic that separates it
 * from a plain invaders march. Divers are worth double (formation 50, diving
 * 100, like the original's bonus for risky shots). Missed divers loop back
 * into formation. Clear the formation to bring on a faster wave. 3 lives.
 */
const FCOLS = 8;
const FROWS = 4;

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
  const H = api.height;
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
  const [, redraw] = useState(0);

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
    api.setScore(0);
    api.setLives(3);
    spawnWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    ship.current = Math.max(SHIP_W / 2, Math.min(W - SHIP_W / 2, x));
  });

  useGameLoop(api.running, (dt) => {
    breathe.current += dt * 1.2;

    // Launch dives: 1-2 enemies peel off, more often in later waves.
    diveTimer.current -= dt;
    if (diveTimer.current <= 0) {
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

    // Auto-fire, two shots on screen.
    fireCooldown.current -= dt;
    if (fireCooldown.current <= 0 && shots.current.length < 2) {
      shots.current.push({ x: ship.current, y: SHIP_Y });
      fireCooldown.current = 0.28;
      playSfx('shoot');
    }
    for (const s of shots.current) s.y -= H * 1.05 * dt;
    shots.current = shots.current.filter((s) => s.y > -20);

    // Shots vs enemies.
    for (const s of shots.current) {
      for (let i = enemies.current.length - 1; i >= 0; i--) {
        const e = enemies.current[i];
        if (Math.abs(s.x - (e.x + ALIEN / 2)) < ALIEN * 0.7 && Math.abs(s.y - (e.y + ALIEN / 2)) < ALIEN * 0.7) {
          s.y = -100;
          score.current += (e.state === 'diving' ? 100 : 50) * wave.current;
          api.setScore(score.current);
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

    if (enemies.current.length === 0) {
      wave.current += 1;
      playSfx('win');
      haptic.success();
      spawnWave();
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {enemies.current.map((e, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: e.x,
              top: e.y,
              width: ALIEN,
              height: ALIEN,
              borderRadius: 3,
              backgroundColor:
                e.state === 'diving'
                  ? colors.neonRed
                  : Math.floor(e.slot / FCOLS) === 0
                    ? colors.neonMagenta
                    : colors.neonCyan,
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
