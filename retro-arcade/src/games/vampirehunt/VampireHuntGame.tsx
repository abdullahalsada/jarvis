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
 * Ghosts'n Goblins-style graveyard stand: zombies shamble in from both
 * sides, bats swoop in sine waves overhead. Face them and throw daggers
 * (◎) — zombies 50, bats 100 (they're harder to hit). Clear the wave
 * quota to advance; each night is thicker and faster. 3 lives.
 */
interface Zombie {
  x: number;
  dir: 1 | -1;
}

interface Bat {
  x: number;
  baseY: number;
  phase: number;
  dir: 1 | -1;
}

interface Dagger {
  x: number;
  y: number;
  dir: 1 | -1;
}

export function VampireHuntGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const GROUND = H - 60;
  const SIZE = 44;

  const px = useRef(W / 2);
  const facing = useRef<1 | -1>(1);
  const held = useRef({ left: false, right: false });
  const zombies = useRef<Zombie[]>([]);
  const bats = useRef<Bat[]>([]);
  const daggers = useRef<Dagger[]>([]);
  const spawnCd = useRef(1);
  const fireCd = useRef(0);
  const kills = useRef(0);
  const lives = useRef(3);
  const score = useRef(0);
  const night = useRef(1);
  const [, redraw] = useState(0);

  const quota = () => 8 + night.current * 3;

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    night.current = 1;
    kills.current = 0;
    zombies.current = [];
    bats.current = [];
    daggers.current = [];
    spawnCd.current = 1;
    px.current = W / 2;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const throwDagger = () => {
    if (!api.running || fireCd.current > 0 || daggers.current.length >= 3) return;
    daggers.current.push({ x: px.current + facing.current * SIZE * 0.5, y: GROUND - SIZE * 0.55, dir: facing.current });
    // A high second dagger for the bats.
    daggers.current.push({ x: px.current + facing.current * SIZE * 0.5, y: GROUND - SIZE * 1.4, dir: facing.current });
    fireCd.current = 0.35;
    playSfx('shoot');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    fireCd.current -= dt;
    const walk = W * 0.5;
    if (held.current.left) {
      px.current = Math.max(SIZE / 2, px.current - walk * dt);
      facing.current = -1;
    }
    if (held.current.right) {
      px.current = Math.min(W - SIZE / 2, px.current + walk * dt);
      facing.current = 1;
    }

    // Spawns from alternating edges.
    spawnCd.current -= dt;
    if (spawnCd.current <= 0) {
      const fromLeft = Math.random() < 0.5;
      if (Math.random() < 0.6) {
        zombies.current.push({ x: fromLeft ? -SIZE : W + SIZE, dir: fromLeft ? 1 : -1 });
      } else {
        bats.current.push({
          x: fromLeft ? -SIZE : W + SIZE,
          baseY: GROUND - SIZE * (1.3 + Math.random() * 1.6),
          phase: Math.random() * Math.PI * 2,
          dir: fromLeft ? 1 : -1,
        });
      }
      spawnCd.current = Math.max(0.5, 1.6 - night.current * 0.15);
    }

    const zsp = W * (0.08 + night.current * 0.02);
    for (const z of zombies.current) z.x += z.dir * zsp * dt;
    const bsp = W * (0.16 + night.current * 0.03);
    for (const b of bats.current) {
      b.x += b.dir * bsp * dt;
      b.phase += dt * 4;
    }
    zombies.current = zombies.current.filter((z) => z.x > -SIZE * 2 && z.x < W + SIZE * 2);
    bats.current = bats.current.filter((b) => b.x > -SIZE * 2 && b.x < W + SIZE * 2);

    // Daggers fly flat.
    for (const d of daggers.current) d.x += d.dir * W * 0.9 * dt;
    daggers.current = daggers.current.filter((d) => d.x > -20 && d.x < W + 20);

    for (const d of daggers.current) {
      let hit = false;
      for (let i = zombies.current.length - 1; i >= 0 && !hit; i--) {
        const z = zombies.current[i];
        if (Math.abs(z.x - d.x) < SIZE * 0.5 && Math.abs(GROUND - SIZE * 0.5 - d.y) < SIZE * 0.6) {
          zombies.current.splice(i, 1);
          hit = true;
          kills.current += 1;
          score.current += 50 * night.current;
        }
      }
      for (let i = bats.current.length - 1; i >= 0 && !hit; i--) {
        const b = bats.current[i];
        const by = b.baseY + Math.sin(b.phase) * SIZE * 0.8;
        if (Math.abs(b.x - d.x) < SIZE * 0.5 && Math.abs(by - d.y) < SIZE * 0.55) {
          bats.current.splice(i, 1);
          hit = true;
          kills.current += 1;
          score.current += 100 * night.current;
        }
      }
      if (hit) {
        d.x = -9999;
        api.setScore(score.current);
        playSfx('explode');
        haptic.light();
      }
    }
    daggers.current = daggers.current.filter((d) => d.x > -999);

    // Touch = a bite.
    const bitten =
      zombies.current.some((z) => Math.abs(z.x - px.current) < SIZE * 0.6) ||
      bats.current.some((b) => {
        const by = b.baseY + Math.sin(b.phase) * SIZE * 0.8;
        return Math.abs(b.x - px.current) < SIZE * 0.6 && by > GROUND - SIZE * 1.1;
      });
    if (bitten) {
      lives.current -= 1;
      api.setLives(lives.current);
      playSfx('loseLife');
      haptic.heavy();
      if (lives.current <= 0) {
        api.end({ score: score.current });
        return;
      }
      zombies.current = [];
      bats.current = [];
      px.current = W / 2;
    }

    // Night cleared.
    if (kills.current >= quota()) {
      kills.current = 0;
      night.current += 1;
      score.current += 250;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      zombies.current = [];
      bats.current = [];
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {/* Graveyard ground + moon */}
          <View style={{ position: 'absolute', right: 24, top: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8e8f0', opacity: 0.9 }} />
          <View style={{ position: 'absolute', top: GROUND, width: W, height: H - GROUND, backgroundColor: '#161228', borderTopWidth: 2, borderColor: '#2a2a45' }} />
          {/* Tombstones (decor) */}
          {[0.12, 0.35, 0.68, 0.88].map((f, i) => (
            <View key={i} style={{ position: 'absolute', left: W * f - 12, top: GROUND - 20, width: 24, height: 20, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: '#3a3a55' }} />
          ))}
          {/* Kill quota */}
          <View style={{ position: 'absolute', top: 8, left: 12 }}>
            <View style={{ width: 110, height: 8, borderWidth: 1, borderColor: colors.neonMagenta, borderRadius: 4 }}>
              <View style={{ width: `${Math.min(100, (kills.current / quota()) * 100)}%`, height: '100%', backgroundColor: colors.neonMagenta, borderRadius: 3 }} />
            </View>
          </View>
          {/* Zombies */}
          {zombies.current.map((z, i) => (
            <Image
              key={i}
              source={ACTORS.zombie}
              style={{
                position: 'absolute',
                left: z.x - SIZE / 2,
                top: GROUND - SIZE,
                width: SIZE,
                height: SIZE,
                transform: [{ scaleX: z.dir }],
              }}
            />
          ))}
          {/* Bats */}
          {bats.current.map((b, i) => (
            <Image
              key={i}
              source={ACTORS.bat}
              style={{
                position: 'absolute',
                left: b.x - SIZE / 2,
                top: b.baseY + Math.sin(b.phase) * SIZE * 0.8 - SIZE / 2,
                width: SIZE,
                height: SIZE,
              }}
            />
          ))}
          {/* Daggers */}
          {daggers.current.map((d, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: d.x - 8,
                top: d.y - 2,
                width: 16,
                height: 4,
                backgroundColor: '#c0c0d2',
                borderRadius: 2,
              }}
            />
          ))}
          {/* The hunter */}
          <Image
            source={ACTORS.hunter}
            style={{
              position: 'absolute',
              left: px.current - SIZE / 2,
              top: GROUND - SIZE,
              width: SIZE,
              height: SIZE,
              transform: [{ scaleX: facing.current }],
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'fire', label: '◎', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => {
          if (k === 'fire') throwDagger();
          else held.current[k as 'left' | 'right'] = true;
        }}
        onUp={(k) => {
          if (k !== 'fire') held.current[k as 'left' | 'right'] = false;
        }}
      />
    </View>
  );
}
