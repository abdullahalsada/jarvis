import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Missile-defense mechanics: warheads arc down toward your six cities; tap
 * the sky to launch an interceptor that detonates at that point, and the
 * expanding blast wipes anything it touches. Faithful economy: limited
 * interceptors per wave, 25 points per warhead × wave multiplier, end-of-wave
 * bonus for spare ammo (×5) and surviving cities (×100). The game ends only
 * when every city is gone.
 */
const CITY_COUNT = 6;
const AMMO_PER_WAVE = 30;

interface Warhead {
  x: number;
  y: number;
  tx: number;
  vx: number;
  vy: number;
  dead: boolean;
}

interface Interceptor {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
}

interface Blast {
  x: number;
  y: number;
  r: number;
  age: number;
}

const BLAST_MAX = 46;
const BLAST_LIFE = 1.2;

export function SkyShieldGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GROUND = H - 46;

  const cities = useRef<boolean[]>([]);
  const warheads = useRef<Warhead[]>([]);
  const interceptors = useRef<Interceptor[]>([]);
  const blasts = useRef<Blast[]>([]);
  const ammo = useRef(AMMO_PER_WAVE);
  const wave = useRef(1);
  const toSpawn = useRef(0);
  const spawnTimer = useRef(0);
  const score = useRef(0);
  const betweenWaves = useRef(0);
  const [, redraw] = useState(0);

  const cityX = (i: number) => ((i + (i >= CITY_COUNT / 2 ? 1.6 : 0.4) + 0.5) / (CITY_COUNT + 2)) * W;

  const startWave = () => {
    ammo.current = AMMO_PER_WAVE;
    toSpawn.current = 6 + wave.current * 3;
    spawnTimer.current = 0.5;
  };

  useEffect(() => {
    cities.current = Array(CITY_COUNT).fill(true);
    warheads.current = [];
    interceptors.current = [];
    blasts.current = [];
    wave.current = 1;
    score.current = 0;
    betweenWaves.current = 0;
    api.setScore(0);
    startWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const fire = (x: number, y: number) => {
    if (!api.running || ammo.current <= 0 || y > GROUND - 40 || betweenWaves.current > 0) return;
    ammo.current -= 1;
    const bx = W / 2;
    const by = GROUND;
    const d = Math.hypot(x - bx, y - by) || 1;
    const speed = H * 0.9;
    interceptors.current.push({
      x: bx,
      y: by,
      tx: x,
      ty: y,
      vx: ((x - bx) / d) * speed,
      vy: ((y - by) / d) * speed,
    });
    playSfx('shoot');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    // Wave intermission with bonus scoring.
    if (betweenWaves.current > 0) {
      betweenWaves.current -= dt;
      if (betweenWaves.current <= 0) {
        wave.current += 1;
        startWave();
      }
      redraw((n) => n + 1);
      return;
    }

    // Spawn warheads aimed at random living cities (or the battery).
    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0 && toSpawn.current > 0) {
      toSpawn.current -= 1;
      const targets = cities.current
        .map((alive, i) => (alive ? cityX(i) : -1))
        .filter((x) => x >= 0);
      targets.push(W / 2);
      const tx = targets[Math.floor(Math.random() * targets.length)];
      const sx = Math.random() * W;
      const speed = H * (0.05 + wave.current * 0.012);
      const d = Math.hypot(tx - sx, GROUND) || 1;
      warheads.current.push({
        x: sx,
        y: -6,
        tx,
        vx: ((tx - sx) / d) * speed * 8,
        vy: (GROUND / d) * speed * 8,
        dead: false,
      });
      spawnTimer.current = 1.4 - Math.min(0.9, wave.current * 0.1);
    }

    for (const wh of warheads.current) {
      wh.x += wh.vx * dt;
      wh.y += wh.vy * dt;
    }

    for (const ic of interceptors.current) {
      ic.x += ic.vx * dt;
      ic.y += ic.vy * dt;
    }
    // Detonate interceptors at their target point.
    interceptors.current = interceptors.current.filter((ic) => {
      const arrived =
        (ic.vy < 0 && ic.y <= ic.ty) || Math.hypot(ic.x - ic.tx, ic.y - ic.ty) < 8;
      if (arrived) {
        blasts.current.push({ x: ic.tx, y: ic.ty, r: 4, age: 0 });
        playSfx('explode');
      }
      return !arrived;
    });

    // Blasts grow then fade; anything inside dies.
    for (const bl of blasts.current) {
      bl.age += dt;
      bl.r =
        bl.age < BLAST_LIFE * 0.6
          ? (bl.age / (BLAST_LIFE * 0.6)) * BLAST_MAX
          : ((BLAST_LIFE - bl.age) / (BLAST_LIFE * 0.4)) * BLAST_MAX;
    }
    blasts.current = blasts.current.filter((bl) => bl.age < BLAST_LIFE);

    for (const wh of warheads.current) {
      for (const bl of blasts.current) {
        if ((wh.x - bl.x) ** 2 + (wh.y - bl.y) ** 2 < bl.r * bl.r) {
          wh.dead = true;
          score.current += 25 * wave.current;
          api.setScore(score.current);
          haptic.light();
        }
      }
      // Impact on the ground: destroy the nearest city if close.
      if (!wh.dead && wh.y >= GROUND) {
        wh.dead = true;
        playSfx('loseLife');
        haptic.heavy();
        let nearest = -1;
        let best = 40;
        cities.current.forEach((alive, i) => {
          const d = Math.abs(cityX(i) - wh.x);
          if (alive && d < best) {
            best = d;
            nearest = i;
          }
        });
        if (nearest >= 0) cities.current[nearest] = false;
      }
    }
    warheads.current = warheads.current.filter((wh) => !wh.dead);

    if (cities.current.every((c) => !c)) {
      api.end({ score: score.current });
      return;
    }

    // Wave clear: all spawned and resolved.
    if (toSpawn.current === 0 && warheads.current.length === 0) {
      const bonus = ammo.current * 5 + cities.current.filter(Boolean).length * 100;
      score.current += bonus;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      betweenWaves.current = 2;
    }
    redraw((n) => n + 1);
  });

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={(e) => fire(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      accessibilityRole="button">
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Ground */}
        <View
          style={{
            position: 'absolute',
            top: GROUND,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#1c1033',
          }}
        />
        {/* Battery */}
        <View
          style={{
            position: 'absolute',
            left: W / 2 - 18,
            top: GROUND - 16,
            width: 36,
            height: 16,
            backgroundColor: colors.neonCyan,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          }}
        />
        {cities.current.map((alive, i) =>
          alive ? (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: cityX(i) - 14,
                top: GROUND - 12,
                width: 28,
                height: 12,
                backgroundColor: colors.neonMagenta,
              }}
            />
          ) : (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: cityX(i) - 14,
                top: GROUND - 4,
                width: 28,
                height: 4,
                backgroundColor: '#552233',
              }}
            />
          )
        )}
        {warheads.current.map((wh, i) => (
          <View
            key={`w${i}`}
            style={{
              position: 'absolute',
              left: wh.x - 3,
              top: wh.y - 3,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.neonRed,
            }}
          />
        ))}
        {interceptors.current.map((ic, i) => (
          <View
            key={`i${i}`}
            style={{
              position: 'absolute',
              left: ic.x - 2,
              top: ic.y - 2,
              width: 4,
              height: 4,
              backgroundColor: colors.neonCyan,
            }}
          />
        ))}
        {blasts.current.map((bl, i) => (
          <View
            key={`b${i}`}
            style={{
              position: 'absolute',
              left: bl.x - bl.r,
              top: bl.y - bl.r,
              width: bl.r * 2,
              height: bl.r * 2,
              borderRadius: bl.r,
              backgroundColor: 'rgba(255,230,0,0.7)',
            }}
          />
        ))}
        <PixelText
          size="label"
          color={colors.textDim}
          style={{ position: 'absolute', bottom: 8, left: 12 }}>
          {`▲ ${ammo.current}  ~ ${wave.current}`}
        </PixelText>
      </View>
    </Pressable>
  );
}
