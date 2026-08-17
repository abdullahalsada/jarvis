import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors, touchTarget } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Asteroids-style: inertia ship on a wrapping field, rocks split
 * large → 2 medium → 2 small, scored 20/50/100 exactly like the original.
 * Max 4 player shots on screen (the arcade limit) with auto-fire. Mobile
 * controls are three big hold-buttons: rotate left/right and thrust —
 * tuned for older hands instead of drag gestures.
 */
const ROT_SPEED = 3.6; // rad/s
const THRUST = 320; // px/s²
const DRAG = 0.995; // per-frame at 60fps, applied dt-scaled
const BULLET_SPEED = 420;
const BULLET_LIFE = 1.1;
const SIZES = { L: 46, M: 28, S: 16 } as const;
const SCORES = { L: 20, M: 50, S: 100 } as const;

type RockSize = keyof typeof SIZES;

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: RockSize;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function AstroShardsGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const FIELD_H = H - 110; // controls strip at the bottom

  const ship = useRef({ x: W / 2, y: FIELD_H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 });
  const rocks = useRef<Rock[]>([]);
  const bullets = useRef<Bullet[]>([]);
  const held = useRef({ left: false, right: false, thrust: false });
  const lives = useRef(3);
  const score = useRef(0);
  const wave = useRef(1);
  const invincible = useRef(0);
  const fireCooldown = useRef(0);
  const [, redraw] = useState(0);

  const spawnWave = () => {
    rocks.current = [];
    const count = 3 + wave.current;
    for (let i = 0; i < count; i++) {
      // Spawn on the field edge, never on the ship.
      const onVertical = Math.random() > 0.5;
      const speed = 40 + wave.current * 10 + Math.random() * 30;
      const dir = Math.random() * Math.PI * 2;
      rocks.current.push({
        x: onVertical ? Math.random() * W : 0,
        y: onVertical ? 0 : Math.random() * FIELD_H,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        size: 'L',
      });
    }
  };

  useEffect(() => {
    ship.current = { x: W / 2, y: FIELD_H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    bullets.current = [];
    lives.current = 3;
    score.current = 0;
    wave.current = 1;
    invincible.current = 2;
    api.setScore(0);
    api.setLives(3);
    spawnWave();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const wrap = (v: number, max: number) => ((v % max) + max) % max;

  const killRock = (idx: number) => {
    const rock = rocks.current[idx];
    score.current += SCORES[rock.size];
    api.setScore(score.current);
    playSfx('explode');
    haptic.light();
    rocks.current.splice(idx, 1);
    const next: RockSize | null = rock.size === 'L' ? 'M' : rock.size === 'M' ? 'S' : null;
    if (next) {
      for (let i = 0; i < 2; i++) {
        const dir = Math.random() * Math.PI * 2;
        const speed = 70 + wave.current * 12 + Math.random() * 50;
        rocks.current.push({
          x: rock.x,
          y: rock.y,
          vx: Math.cos(dir) * speed,
          vy: Math.sin(dir) * speed,
          size: next,
        });
      }
    }
    if (rocks.current.length === 0) {
      wave.current += 1;
      playSfx('win');
      haptic.success();
      invincible.current = 2;
      spawnWave();
    }
  };

  useGameLoop(api.running, (dt) => {
    const s = ship.current;
    if (held.current.left) s.angle -= ROT_SPEED * dt;
    if (held.current.right) s.angle += ROT_SPEED * dt;
    if (held.current.thrust) {
      s.vx += Math.cos(s.angle) * THRUST * dt;
      s.vy += Math.sin(s.angle) * THRUST * dt;
    }
    const drag = Math.pow(DRAG, dt * 60);
    s.vx *= drag;
    s.vy *= drag;
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, FIELD_H);
    if (invincible.current > 0) invincible.current -= dt;

    // Auto-fire, capped at 4 live shots like the arcade original.
    fireCooldown.current -= dt;
    if (fireCooldown.current <= 0 && bullets.current.length < 4) {
      bullets.current.push({
        x: s.x + Math.cos(s.angle) * 14,
        y: s.y + Math.sin(s.angle) * 14,
        vx: Math.cos(s.angle) * BULLET_SPEED + s.vx,
        vy: Math.sin(s.angle) * BULLET_SPEED + s.vy,
        life: BULLET_LIFE,
      });
      fireCooldown.current = 0.33;
      playSfx('shoot');
    }

    for (const b of bullets.current) {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, FIELD_H);
      b.life -= dt;
    }
    bullets.current = bullets.current.filter((b) => b.life > 0);

    for (const r of rocks.current) {
      r.x = wrap(r.x + r.vx * dt, W);
      r.y = wrap(r.y + r.vy * dt, FIELD_H);
    }

    // Bullets vs rocks
    for (let bi = bullets.current.length - 1; bi >= 0; bi--) {
      const b = bullets.current[bi];
      for (let ri = rocks.current.length - 1; ri >= 0; ri--) {
        const r = rocks.current[ri];
        const rad = SIZES[r.size] / 2;
        if ((b.x - r.x) ** 2 + (b.y - r.y) ** 2 < rad * rad) {
          bullets.current.splice(bi, 1);
          killRock(ri);
          break;
        }
      }
    }

    // Ship vs rocks
    if (invincible.current <= 0) {
      for (const r of rocks.current) {
        const rad = SIZES[r.size] / 2 + 10;
        if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 < rad * rad) {
          lives.current -= 1;
          api.setLives(lives.current);
          playSfx('loseLife');
          haptic.heavy();
          if (lives.current <= 0) {
            api.end({ score: score.current });
            return;
          }
          ship.current = { x: W / 2, y: FIELD_H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
          invincible.current = 2;
          break;
        }
      }
    }
    redraw((n) => n + 1);
  });

  const holdButton = (key: keyof typeof held.current, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => {
        held.current[key] = true;
      }}
      onPressOut={() => {
        held.current[key] = false;
      }}
      style={({ pressed }) => ({
        width: touchTarget + 24,
        height: touchTarget + 24,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: colors.neonCyan,
        backgroundColor: pressed ? colors.neonCyan : colors.bgRaised,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <PixelText size="heading" color={colors.text}>
        {label}
      </PixelText>
    </Pressable>
  );

  const s = ship.current;
  const blink = invincible.current > 0 && Math.floor(invincible.current * 8) % 2 === 0;

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ width: W, height: FIELD_H, overflow: 'hidden' }}>
        {rocks.current.map((r, i) => (
          <Image
            key={i}
            source={ACTORS.meteor}
            style={{
              position: 'absolute',
              left: r.x - SIZES[r.size] * 0.65,
              top: r.y - SIZES[r.size] * 0.65,
              width: SIZES[r.size] * 1.3,
              height: SIZES[r.size] * 1.3,
              transform: [{ rotate: `${(i * 53) % 360}deg` }],
            }}
          />
        ))}
        {bullets.current.map((b, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: b.x - 2,
              top: b.y - 2,
              width: 4,
              height: 4,
              backgroundColor: colors.neonYellow,
            }}
          />
        ))}
        {!blink && (
          <View
            style={{
              position: 'absolute',
              left: s.x - 12,
              top: s.y - 12,
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: `${(s.angle * 180) / Math.PI + 90}deg` }],
            }}>
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 9,
                borderRightWidth: 9,
                borderBottomWidth: 22,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: colors.neonCyan,
              }}
            />
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          alignItems: 'center',
          flex: 1,
        }}>
        {holdButton('left', '↺')}
        {holdButton('thrust', '▲')}
        {holdButton('right', '↻')}
      </View>
    </View>
  );
}
