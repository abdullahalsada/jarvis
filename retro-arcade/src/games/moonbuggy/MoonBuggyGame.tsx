import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Moon-Patrol-style side-scroller: your buggy rolls across the lunar
 * surface at a steadily climbing speed. JUMP the craters, SHOOT the rocks —
 * two big thumb zones, exactly the two verbs of the original. Score is
 * distance plus rocks blasted; checkpoints flash every 500m. Three lives,
 * with a brief shield after each crash.
 */
export function MoonBuggyGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GROUND = H * 0.72;
  const BUGGY_X = W * 0.24;
  const BUGGY_W = 46;
  const BUGGY_H = 24;
  const GRAVITY = H * 1.6;
  const JUMP_V = -H * 0.72;

  interface Obstacle {
    x: number;
    kind: 'crater' | 'rock';
    w: number;
  }
  interface Shot {
    x: number;
  }

  const buggyY = useRef(0); // 0 = on ground (offset above GROUND)
  const buggyVy = useRef(0);
  const obstacles = useRef<Obstacle[]>([]);
  const shots = useRef<Shot[]>([]);
  const distance = useRef(0);
  const rocksShot = useRef(0);
  const lives = useRef(3);
  const shield = useRef(0);
  const spawnGap = useRef(0);
  const lastCheckpoint = useRef(0);
  const checkpointFlash = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    buggyY.current = 0;
    buggyVy.current = 0;
    obstacles.current = [];
    shots.current = [];
    distance.current = 0;
    rocksShot.current = 0;
    lives.current = 3;
    shield.current = 2;
    spawnGap.current = W * 0.8;
    lastCheckpoint.current = 0;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const grounded = () => buggyY.current >= 0;

  const jump = () => {
    if (!api.running || !grounded()) return;
    buggyVy.current = JUMP_V;
    buggyY.current = -1;
    playSfx('flip');
    haptic.light();
  };

  const shoot = () => {
    if (!api.running || shots.current.length >= 2) return;
    shots.current.push({ x: BUGGY_X + BUGGY_W });
    playSfx('shoot');
  };

  const crash = () => {
    playSfx('explode');
    haptic.heavy();
    lives.current -= 1;
    api.setLives(lives.current);
    if (lives.current <= 0) {
      api.end({ score: Math.floor(distance.current) + rocksShot.current * 50 });
      return true;
    }
    shield.current = 2;
    obstacles.current = obstacles.current.filter((o) => o.x > BUGGY_X + W * 0.3);
    return false;
  };

  useGameLoop(api.running, (dt) => {
    const speed = W * Math.min(0.9, 0.32 + distance.current / 4000);
    distance.current += speed * dt * 0.15;
    api.setScore(Math.floor(distance.current) + rocksShot.current * 50);

    if (shield.current > 0) shield.current -= dt;
    if (checkpointFlash.current > 0) checkpointFlash.current -= dt;
    if (distance.current - lastCheckpoint.current >= 500) {
      lastCheckpoint.current += 500;
      checkpointFlash.current = 1.2;
      playSfx('point');
      haptic.medium();
    }

    // Buggy vertical motion
    if (!grounded()) {
      buggyVy.current += GRAVITY * dt;
      buggyY.current += buggyVy.current * dt;
      if (buggyY.current >= 0) {
        buggyY.current = 0;
        buggyVy.current = 0;
      }
    }

    // Spawn obstacles with breathing room that shrinks as speed climbs.
    spawnGap.current -= speed * dt;
    if (spawnGap.current <= 0) {
      const kind = Math.random() < 0.45 ? 'crater' : 'rock';
      obstacles.current.push({
        x: W + 60,
        kind,
        w: kind === 'crater' ? 46 + Math.random() * 28 : 22,
      });
      spawnGap.current = W * (0.5 + Math.random() * 0.45) * Math.max(0.55, 1 - distance.current / 6000);
    }

    for (const o of obstacles.current) o.x -= speed * dt;
    obstacles.current = obstacles.current.filter((o) => o.x + o.w > -20);

    for (const s of shots.current) s.x += W * 1.2 * dt;
    shots.current = shots.current.filter((s) => s.x < W + 20);

    // Shots vs rocks
    for (const s of shots.current) {
      for (let i = obstacles.current.length - 1; i >= 0; i--) {
        const o = obstacles.current[i];
        if (o.kind === 'rock' && s.x > o.x && s.x < o.x + o.w) {
          obstacles.current.splice(i, 1);
          s.x = W + 100;
          rocksShot.current += 1;
          playSfx('explode');
          haptic.light();
          break;
        }
      }
    }

    // Collisions (skipped while shielded)
    if (shield.current <= 0) {
      for (const o of obstacles.current) {
        const overlap = BUGGY_X + BUGGY_W * 0.8 > o.x && BUGGY_X + BUGGY_W * 0.2 < o.x + o.w;
        if (!overlap) continue;
        if (o.kind === 'crater' && grounded()) {
          if (crash()) return;
          break;
        }
        if (o.kind === 'rock' && grounded()) {
          if (crash()) return;
          break;
        }
      }
    }
    redraw((n) => n + 1);
  });

  const blink = shield.current > 0 && Math.floor(shield.current * 8) % 2 === 0;
  const by = GROUND - BUGGY_H + (grounded() ? 0 : buggyY.current);

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Ground */}
        <View
          style={{
            position: 'absolute',
            top: GROUND,
            left: 0,
            right: 0,
            height: H - GROUND,
            backgroundColor: '#1c1c30',
          }}
        />
        {/* Craters (gaps drawn as darker notches) */}
        {obstacles.current.map((o, i) =>
          o.kind === 'crater' ? (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: o.x,
                top: GROUND,
                width: o.w,
                height: 26,
                backgroundColor: colors.bg,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
              }}
            />
          ) : (
            <Image
              key={i}
              source={ACTORS.meteor}
              style={{
                position: 'absolute',
                left: o.x - 4,
                top: GROUND - o.w - 4,
                width: o.w + 8,
                height: o.w + 8,
              }}
            />
          )
        )}
        {/* Shots */}
        {shots.current.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: GROUND - BUGGY_H / 2 - 3,
              width: 10,
              height: 4,
              backgroundColor: colors.neonYellow,
            }}
          />
        ))}
        {/* Buggy */}
        {!blink && (
          <Image
            source={ACTORS.buggy}
            style={{
              position: 'absolute',
              left: BUGGY_X - BUGGY_W * 0.15,
              top: by - BUGGY_H * 0.55,
              width: BUGGY_W * 1.3,
              height: BUGGY_W * 1.3,
            }}
          />
        )}
        {/* Checkpoint flash + control hints */}
        {checkpointFlash.current > 0 && (
          <PixelText size="heading" color={colors.neonGreen} glow style={{ position: 'absolute', top: H * 0.25, alignSelf: 'center' }}>
            {`${lastCheckpoint.current}m`}
          </PixelText>
        )}
        <PixelText size={10} color={colors.textDim} style={{ position: 'absolute', bottom: 10, left: 16 }}>
          ◎ FIRE
        </PixelText>
        <PixelText size={10} color={colors.textDim} style={{ position: 'absolute', bottom: 10, right: 16 }}>
          ↥ JUMP
        </PixelText>
      </View>

      {/* Thumb zones: left = shoot, right = jump. Rendered last so they sit
          above the field but below the shell's Start/pause overlays; inert
          until the round is actually running. */}
      <View
        pointerEvents={api.running ? 'auto' : 'none'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="shoot" onPressIn={shoot} style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="jump" onPressIn={jump} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
