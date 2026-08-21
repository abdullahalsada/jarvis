import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Neon pinball: launch the ball, rack up bumper hits, and keep it alive
 * with the flippers — tap the LEFT or RIGHT half of the screen to flip.
 * Bumpers score 50 (and glow), the spinner lane scores 200, and every
 * 2000 points lights a multiplier. Three balls per game.
 */
const BALL_R = 11;

interface Bumper {
  x: number;
  y: number;
  r: number;
  glow: number;
}

export function PinballGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  // Flipper geometry: two paddles angled toward the center drain.
  const FLIP_Y = H - 100;
  const FLIP_LEN = W * 0.24;
  const GAP = W * 0.16; // drain gap between flipper tips

  const ball = useRef({ x: 0, y: 0, vx: 0, vy: 0, live: false });
  const bumpers = useRef<Bumper[]>([]);
  const leftUp = useRef(0); // >0 while flipping (seconds of active window)
  const rightUp = useRef(0);
  const balls = useRef(3);
  const score = useRef(0);
  const mult = useRef(1);
  const launchCd = useRef(0.5);
  const [, redraw] = useState(0);

  const resetBall = () => {
    ball.current = { x: W / 2, y: H * 0.22, vx: (Math.random() - 0.5) * W * 0.4, vy: -H * 0.1, live: true };
  };

  useEffect(() => {
    balls.current = 3;
    score.current = 0;
    mult.current = 1;
    launchCd.current = 0.5;
    bumpers.current = [
      { x: W * 0.3, y: H * 0.3, r: 26, glow: 0 },
      { x: W * 0.7, y: H * 0.3, r: 26, glow: 0 },
      { x: W * 0.5, y: H * 0.45, r: 30, glow: 0 },
      { x: W * 0.22, y: H * 0.55, r: 22, glow: 0 },
      { x: W * 0.78, y: H * 0.55, r: 22, glow: 0 },
    ];
    api.setScore(0);
    api.setLives(3);
    resetBall();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const flip = (side: 'left' | 'right') => {
    if (!api.running) return;
    if (side === 'left') leftUp.current = 0.14;
    else rightUp.current = 0.14;
    playSfx('flip');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    const b = ball.current;
    if (!b.live) {
      launchCd.current -= dt;
      if (launchCd.current <= 0) resetBall();
      redraw((n) => n + 1);
      return;
    }

    leftUp.current = Math.max(0, leftUp.current - dt);
    rightUp.current = Math.max(0, rightUp.current - dt);

    // Physics
    b.vy += H * 0.55 * dt; // gentle gravity for long rallies
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Walls
    if (b.x < BALL_R + 4) {
      b.x = BALL_R + 4;
      b.vx = Math.abs(b.vx) * 0.92;
    }
    if (b.x > W - BALL_R - 4) {
      b.x = W - BALL_R - 4;
      b.vx = -Math.abs(b.vx) * 0.92;
    }
    if (b.y < BALL_R + 4) {
      b.y = BALL_R + 4;
      b.vy = Math.abs(b.vy) * 0.92;
      // Top lane spinner bonus
      score.current += 200 * mult.current;
      api.setScore(score.current);
      playSfx('point');
    }

    // Bumpers: bounce away with energy, score, glow.
    for (const bump of bumpers.current) {
      bump.glow = Math.max(0, bump.glow - dt * 3);
      const dx = b.x - bump.x;
      const dy = b.y - bump.y;
      const d = Math.hypot(dx, dy);
      if (d < bump.r + BALL_R && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        b.x = bump.x + nx * (bump.r + BALL_R + 1);
        b.y = bump.y + ny * (bump.r + BALL_R + 1);
        const sp = Math.max(Math.hypot(b.vx, b.vy), H * 0.35);
        b.vx = nx * sp * 1.06;
        b.vy = ny * sp * 1.06;
        bump.glow = 1;
        score.current += 50 * mult.current;
        api.setScore(score.current);
        if (score.current >= mult.current * 2000) {
          mult.current += 1;
          playSfx('powerUp');
          haptic.medium();
        } else {
          playSfx('bounce');
          haptic.light();
        }
      }
    }

    // Flippers: angled ramps near the bottom. When active they launch the
    // ball up-and-inward; when resting they still deflect it like a wall.
    const inLeftZone = b.x < W / 2 - GAP / 2 + BALL_R && b.x > W / 2 - GAP / 2 - FLIP_LEN - BALL_R;
    const inRightZone = b.x > W / 2 + GAP / 2 - BALL_R && b.x < W / 2 + GAP / 2 + FLIP_LEN + BALL_R;
    const nearFlipY = b.y > FLIP_Y - BALL_R * 1.6 && b.y < FLIP_Y + BALL_R * 2 && b.vy > 0;
    if (nearFlipY && (inLeftZone || inRightZone)) {
      const active = inLeftZone ? leftUp.current > 0 : rightUp.current > 0;
      b.y = FLIP_Y - BALL_R * 1.6;
      if (active) {
        const inward = inLeftZone ? 1 : -1;
        b.vy = -H * (0.75 + Math.random() * 0.12);
        b.vx = inward * W * (0.18 + Math.random() * 0.22);
        playSfx('brick');
        haptic.medium();
      } else {
        // Resting flipper: soft bounce that rolls toward the drain.
        b.vy = -Math.abs(b.vy) * 0.25;
        b.vx += (inLeftZone ? 1 : -1) * W * 0.05;
      }
    }

    // Drain
    if (b.y > H + BALL_R) {
      b.live = false;
      balls.current -= 1;
      launchCd.current = 0.9;
      api.setLives(balls.current);
      playSfx('loseLife');
      haptic.heavy();
      if (balls.current <= 0) {
        api.end({ score: score.current });
        return;
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Table */}
        <View style={{ position: 'absolute', left: 2, top: 2, right: 2, bottom: 0, borderWidth: 3, borderBottomWidth: 0, borderColor: colors.neonMagenta, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#120a1e' }} />
        {/* Bumpers */}
        {bumpers.current.map((bp, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: bp.x - bp.r,
              top: bp.y - bp.r,
              width: bp.r * 2,
              height: bp.r * 2,
              borderRadius: bp.r,
              backgroundColor: bp.glow > 0 ? colors.neonYellow : '#241640',
              borderWidth: 3,
              borderColor: bp.glow > 0 ? colors.neonYellow : colors.neonMagenta,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <PixelText size={11} color={bp.glow > 0 ? colors.bg : colors.neonMagenta}>
              50
            </PixelText>
          </View>
        ))}
        {/* Flippers */}
        <View
          style={{
            position: 'absolute',
            left: W / 2 - GAP / 2 - FLIP_LEN,
            top: FLIP_Y,
            width: FLIP_LEN,
            height: 12,
            borderRadius: 6,
            backgroundColor: leftUp.current > 0 ? colors.neonYellow : colors.neonCyan,
            transform: [{ rotate: leftUp.current > 0 ? '-18deg' : '12deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: W / 2 + GAP / 2,
            top: FLIP_Y,
            width: FLIP_LEN,
            height: 12,
            borderRadius: 6,
            backgroundColor: rightUp.current > 0 ? colors.neonYellow : colors.neonCyan,
            transform: [{ rotate: rightUp.current > 0 ? '18deg' : '-12deg' }],
          }}
        />
        {/* Drain glow */}
        <View style={{ position: 'absolute', left: W / 2 - GAP / 2, top: H - 8, width: GAP, height: 8, backgroundColor: colors.neonRed, opacity: 0.5 }} />
        {/* Ball */}
        {ball.current.live && (
          <View
            style={{
              position: 'absolute',
              left: ball.current.x - BALL_R,
              top: ball.current.y - BALL_R,
              width: BALL_R * 2,
              height: BALL_R * 2,
              borderRadius: BALL_R,
              backgroundColor: '#e8e8f0',
              borderWidth: 2,
              borderColor: '#9a9ab5',
            }}
          />
        )}
        {/* Multiplier */}
        {mult.current > 1 && (
          <PixelText size={12} color={colors.neonYellow} glow style={{ position: 'absolute', top: 12, alignSelf: 'center' }}>
            {`×${mult.current}`}
          </PixelText>
        )}
      </View>
      {/* Tap zones: left/right halves flip */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W / 2 }}>
        <Pressable style={{ flex: 1 }} onPressIn={() => flip('left')} />
      </View>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: W / 2 }}>
        <Pressable style={{ flex: 1 }} onPressIn={() => flip('right')} />
      </View>
    </View>
  );
}
