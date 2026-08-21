import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideXY } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Neon air hockey vs the machine: your mallet follows your finger in the
 * bottom half, the computer defends the top. First to 7 wins the match —
 * win it for a big bonus and a faster rematch. Score is goals × 100 plus
 * 500 per match won.
 */
const PUCK_R = 14;
const MALLET_R = 26;
const WIN_AT = 7;

export function AirHockeyGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GOAL_W = W * 0.36;

  const puck = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const me = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const ai = useRef({ x: 0, y: 0 });
  const myGoals = useRef(0);
  const aiGoals = useRef(0);
  const match = useRef(1);
  const score = useRef(0);
  const freeze = useRef(0); // pause after a goal
  const doneRef = useRef(false);
  const [, redraw] = useState(0);

  const resetPositions = (towardMe: boolean) => {
    puck.current = { x: W / 2, y: towardMe ? H * 0.62 : H * 0.38, vx: 0, vy: 0 };
    me.current = { x: W / 2, y: H * 0.82, px: W / 2, py: H * 0.82 };
    ai.current = { x: W / 2, y: H * 0.14 };
  };

  useEffect(() => {
    myGoals.current = 0;
    aiGoals.current = 0;
    match.current = 1;
    score.current = 0;
    freeze.current = 0;
    doneRef.current = false;
    api.setScore(0);
    resetPositions(true);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideXY((x, y) => {
    if (!api.running) return;
    me.current.x = Math.max(MALLET_R, Math.min(W - MALLET_R, x));
    me.current.y = Math.max(H / 2 + MALLET_R, Math.min(H - MALLET_R - 6, y));
  });

  const collideMallet = (m: { x: number; y: number }, vx: number, vy: number) => {
    const p = puck.current;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d < PUCK_R + MALLET_R && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      p.x = m.x + nx * (PUCK_R + MALLET_R + 1);
      p.y = m.y + ny * (PUCK_R + MALLET_R + 1);
      const rel = vx * nx + vy * ny;
      const base = Math.max(H * 0.35, Math.hypot(p.vx, p.vy) * 0.75);
      p.vx = nx * base + vx * 0.6;
      p.vy = ny * base + vy * 0.6;
      // Clamp puck speed so it stays trackable.
      const sp = Math.hypot(p.vx, p.vy);
      const maxSp = H * 1.3;
      if (sp > maxSp) {
        p.vx = (p.vx / sp) * maxSp;
        p.vy = (p.vy / sp) * maxSp;
      }
      void rel;
      playSfx('bounce');
      haptic.light();
    }
  };

  const goal = (mineScored: boolean) => {
    freeze.current = 0.9;
    if (mineScored) {
      myGoals.current += 1;
      score.current += 100 * match.current;
      api.setScore(score.current);
      playSfx('point');
      haptic.medium();
    } else {
      aiGoals.current += 1;
      playSfx('loseLife');
      haptic.heavy();
    }
    if (myGoals.current >= WIN_AT) {
      score.current += 500 * match.current;
      match.current += 1;
      myGoals.current = 0;
      aiGoals.current = 0;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
    } else if (aiGoals.current >= WIN_AT) {
      doneRef.current = true;
      playSfx('gameOver');
      setTimeout(() => api.end({ score: score.current }), 700);
      return;
    }
    resetPositions(!mineScored);
  };

  useGameLoop(api.running, (dt) => {
    if (doneRef.current) return;
    if (freeze.current > 0) {
      freeze.current -= dt;
      redraw((n) => n + 1);
      return;
    }
    const p = puck.current;
    const m = me.current;

    // Finger velocity for hit power.
    const mvx = (m.x - m.px) / Math.max(dt, 0.001);
    const mvy = (m.y - m.py) / Math.max(dt, 0.001);
    m.px = m.x;
    m.py = m.y;

    // AI: glide toward the puck's x; commit forward when the puck is close.
    const aiSpeed = W * (0.55 + match.current * 0.12);
    const targetX = p.y < H / 2 ? p.x : W / 2 + (p.x - W / 2) * 0.4;
    ai.current.x += Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, targetX - ai.current.x));
    const targetY = p.y < H * 0.4 && p.vy > -H * 0.2 ? Math.min(p.y, H * 0.42) : H * 0.14;
    ai.current.y += Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, targetY - ai.current.y));
    ai.current.x = Math.max(MALLET_R, Math.min(W - MALLET_R, ai.current.x));
    ai.current.y = Math.max(MALLET_R + 6, Math.min(H / 2 - MALLET_R, ai.current.y));

    // Puck physics
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 0.25 * dt;
    p.vy *= 1 - 0.25 * dt;

    if (p.x < PUCK_R + 4) {
      p.x = PUCK_R + 4;
      p.vx = Math.abs(p.vx);
      playSfx('flip');
    }
    if (p.x > W - PUCK_R - 4) {
      p.x = W - PUCK_R - 4;
      p.vx = -Math.abs(p.vx);
      playSfx('flip');
    }

    const inGoalX = Math.abs(p.x - W / 2) < GOAL_W / 2;
    if (p.y < PUCK_R + 4) {
      if (inGoalX) {
        goal(true);
        redraw((n) => n + 1);
        return;
      }
      p.y = PUCK_R + 4;
      p.vy = Math.abs(p.vy);
      playSfx('flip');
    }
    if (p.y > H - PUCK_R - 4) {
      if (inGoalX) {
        goal(false);
        redraw((n) => n + 1);
        return;
      }
      p.y = H - PUCK_R - 4;
      p.vy = -Math.abs(p.vy);
      playSfx('flip');
    }

    collideMallet(m, mvx, mvy);
    collideMallet(ai.current, 0, 0);
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Table */}
        <View style={{ position: 'absolute', left: 2, top: 2, right: 2, bottom: 2, borderWidth: 3, borderColor: colors.neonCyan, borderRadius: 18, backgroundColor: '#0a1420' }} />
        {/* Center line + circle */}
        <View style={{ position: 'absolute', left: 8, top: H / 2 - 1, width: W - 16, height: 2, backgroundColor: 'rgba(0,255,247,0.35)' }} />
        <View style={{ position: 'absolute', left: W / 2 - 40, top: H / 2 - 40, width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(0,255,247,0.35)' }} />
        {/* Goals */}
        <View style={{ position: 'absolute', left: W / 2 - GOAL_W / 2, top: 0, width: GOAL_W, height: 6, backgroundColor: colors.neonRed }} />
        <View style={{ position: 'absolute', left: W / 2 - GOAL_W / 2, bottom: 0, width: GOAL_W, height: 6, backgroundColor: colors.neonGreen }} />
        {/* Scoreboard */}
        <View style={{ position: 'absolute', top: H / 2 - 14, left: 14 }}>
          <PixelText size={12} color={colors.neonRed}>{String(aiGoals.current)}</PixelText>
          <PixelText size={12} color={colors.neonGreen}>{String(myGoals.current)}</PixelText>
        </View>
        {/* AI mallet */}
        <View
          style={{
            position: 'absolute',
            left: ai.current.x - MALLET_R,
            top: ai.current.y - MALLET_R,
            width: MALLET_R * 2,
            height: MALLET_R * 2,
            borderRadius: MALLET_R,
            backgroundColor: '#b32222',
            borderWidth: 4,
            borderColor: colors.neonRed,
          }}>
          <View style={{ position: 'absolute', left: MALLET_R - 10, top: MALLET_R - 10, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.neonRed }} />
        </View>
        {/* My mallet */}
        <View
          style={{
            position: 'absolute',
            left: me.current.x - MALLET_R,
            top: me.current.y - MALLET_R,
            width: MALLET_R * 2,
            height: MALLET_R * 2,
            borderRadius: MALLET_R,
            backgroundColor: '#1b7d3c',
            borderWidth: 4,
            borderColor: colors.neonGreen,
          }}>
          <View style={{ position: 'absolute', left: MALLET_R - 10, top: MALLET_R - 10, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.neonGreen }} />
        </View>
        {/* Puck */}
        <View
          style={{
            position: 'absolute',
            left: puck.current.x - PUCK_R,
            top: puck.current.y - PUCK_R,
            width: PUCK_R * 2,
            height: PUCK_R * 2,
            borderRadius: PUCK_R,
            backgroundColor: '#e8e8f0',
            borderWidth: 3,
            borderColor: '#9a9ab5',
          }}
        />
      </View>
    </View>
  );
}
