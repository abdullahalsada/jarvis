import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Ten-pin bowling, LCD-handheld style with real physics-lite pins:
 * drag sideways to line up, fling up to roll (fling angle adds curve).
 * Knocked pins fly and take neighbors with them, so pocket hits earn
 * real strikes. Full traditional scoring — strikes, spares, and the
 * tenth-frame bonus rolls. Perfect game = 300.
 */
const PIN_R = 9;
const BALL_R = 13;

interface Pin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  up: boolean;
}

type Phase = 'aim' | 'rolling' | 'tally';

export function AlleyBowlGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const LANE_W = Math.min(W * 0.7, 300);
  const laneX = (W - LANE_W) / 2;
  const PIN_TOP = 90;
  const SPACING = LANE_W / 7;
  const BALL_Y0 = H - 90;

  const pins = useRef<Pin[]>([]);
  const ball = useRef({ x: W / 2, y: BALL_Y0, vx: 0, vy: 0, active: false });
  const phase = useRef<Phase>('aim');
  /** rolls[f] = pins downed per roll in frame f (10th frame may have 3). */
  const rolls = useRef<number[][]>([[]]);
  const standingAtRollStart = useRef(10);
  const [, redraw] = useState(0);

  const setPins = (keepDowned?: Pin[]) => {
    const fresh: Pin[] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        fresh.push({
          x: W / 2 + (i - row / 2) * SPACING,
          y: PIN_TOP + (3 - row) * SPACING * 0.8,
          vx: 0,
          vy: 0,
          up: true,
        });
      }
    }
    if (keepDowned) {
      // Second roll of a frame: only the surviving pins stand.
      fresh.forEach((p, i) => {
        p.up = keepDowned[i]?.up ?? true;
      });
    }
    pins.current = fresh;
  };

  useEffect(() => {
    rolls.current = [[]];
    ball.current = { x: W / 2, y: BALL_Y0, vx: 0, vy: 0, active: false };
    phase.current = 'aim';
    standingAtRollStart.current = 10;
    api.setScore(0);
    setPins();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  // ── Traditional scoring ──────────────────────────────────────────────────
  const flat = () => rolls.current.flat();
  const scoreTotal = (): number => {
    // Rebuild frame-by-frame from the roll list.
    const all = flat();
    let total = 0;
    let i = 0;
    for (let frame = 0; frame < 10 && i < all.length; frame++) {
      if (all[i] === 10) {
        total += 10 + (all[i + 1] ?? 0) + (all[i + 2] ?? 0);
        i += 1;
      } else if ((all[i] ?? 0) + (all[i + 1] ?? 0) === 10) {
        total += 10 + (all[i + 2] ?? 0);
        i += 2;
      } else {
        total += (all[i] ?? 0) + (all[i + 1] ?? 0);
        i += 2;
      }
    }
    return total;
  };

  const frameIndex = () => rolls.current.length - 1;

  const gameOver = (): boolean => {
    const f = rolls.current;
    if (f.length < 10) return false;
    const tenth = f[9];
    const first = tenth[0] ?? -1;
    const second = tenth[1] ?? -1;
    if (tenth.length >= 3) return true;
    if (tenth.length === 2) {
      // Third roll only after a strike or spare in the tenth.
      return first !== 10 && first + second !== 10;
    }
    return false;
  };

  const finishRoll = () => {
    const standing = pins.current.filter((p) => p.up).length;
    const downed = standingAtRollStart.current - standing;
    rolls.current[frameIndex()].push(downed);
    const total = scoreTotal();
    api.setScore(total);

    if (downed === standingAtRollStart.current) {
      playSfx('win');
      haptic.success();
    } else if (downed > 0) {
      playSfx('point');
      haptic.medium();
    } else {
      playSfx('loseLife');
    }

    if (gameOver()) {
      api.end({ score: total, won: total >= 150 });
      return;
    }

    const frame = rolls.current[frameIndex()];
    const isTenth = frameIndex() === 9;
    const frameDone = isTenth
      ? false // gameOver() above decides the tenth
      : frame[0] === 10 || frame.length === 2;

    if (frameDone) {
      rolls.current.push([]);
      setPins();
      standingAtRollStart.current = 10;
    } else if (isTenth && (frame[frame.length - 1] === 10 || (frame.length === 2 && frame[0] + frame[1] === 10))) {
      // Tenth-frame strike/spare: fresh rack for the bonus roll.
      setPins();
      standingAtRollStart.current = 10;
    } else {
      setPins(pins.current);
      standingAtRollStart.current = standing;
    }

    ball.current = { x: W / 2, y: BALL_Y0, vx: 0, vy: 0, active: false };
    phase.current = 'aim';
    redraw((n) => n + 1);
  };

  // ── Roll physics ─────────────────────────────────────────────────────────
  useGameLoop(api.running, (dt) => {
    if (phase.current !== 'rolling') return;
    const b = ball.current;

    if (b.active) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.x = Math.max(laneX + BALL_R, Math.min(laneX + LANE_W - BALL_R, b.x));

      for (const p of pins.current) {
        if (!p.up) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy < (PIN_R + BALL_R) ** 2) {
          p.up = false;
          const d = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(b.vx, b.vy);
          p.vx = (dx / d) * speed * 0.7 + b.vx * 0.25;
          p.vy = (dy / d) * speed * 0.7 + b.vy * 0.25;
          playSfx('brick');
          haptic.light();
        }
      }
      if (b.y < PIN_TOP - SPACING) b.active = false;
    }

    // Flying pins take their neighbors with them — that's how strikes happen.
    let anyMoving = b.active;
    for (const p of pins.current) {
      if (p.up || (p.vx === 0 && p.vy === 0)) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      if (Math.hypot(p.vx, p.vy) < 20) {
        p.vx = 0;
        p.vy = 0;
      } else {
        anyMoving = true;
      }
      for (const q of pins.current) {
        if (!q.up) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        if (dx * dx + dy * dy < (PIN_R * 2.2) ** 2) {
          q.up = false;
          const d = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(p.vx, p.vy);
          q.vx = (dx / d) * speed * 0.8;
          q.vy = (dy / d) * speed * 0.8;
          playSfx('brick');
        }
      }
    }

    if (!anyMoving) {
      phase.current = 'tally';
      finishRoll();
    }
    redraw((n) => n + 1);
  });

  // ── Controls: drag to aim, fling up to roll ──────────────────────────────
  const apiRef = useRef(api);
  apiRef.current = api;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, g) => {
        if (!apiRef.current.running || phase.current !== 'aim') return;
        ball.current.x = Math.max(
          laneX + BALL_R,
          Math.min(laneX + LANE_W - BALL_R, evt.nativeEvent.locationX)
        );
        redraw((n) => n + 1);
        void g;
      },
      onPanResponderRelease: (_evt, g) => {
        if (!apiRef.current.running || phase.current !== 'aim') return;
        if (g.vy < -0.4) {
          const speed = H * 1.15;
          ball.current.vy = -speed;
          ball.current.vx = Math.max(-speed * 0.25, Math.min(speed * 0.25, g.vx * 120));
          ball.current.active = true;
          phase.current = 'rolling';
          playSfx('shoot');
          haptic.medium();
        }
      },
    })
  );

  const frameNo = Math.min(10, rolls.current.length);
  const currentFrame = rolls.current[frameIndex()] ?? [];

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Lane */}
        <View
          style={{
            position: 'absolute',
            left: laneX,
            top: 40,
            width: LANE_W,
            height: H - 60,
            backgroundColor: '#151522',
            borderLeftWidth: 3,
            borderRightWidth: 3,
            borderColor: colors.border,
          }}
        />
        {/* Frame readout */}
        <PixelText size={11} color={colors.textDim} style={{ position: 'absolute', top: 12, left: 12 }}>
          {`▸ ${frameNo}/10  ${currentFrame.join(' · ')}`}
        </PixelText>
        {/* Pins: real striped bowling pins; downed pins lie tipped and dimmed */}
        {pins.current.map((p, i) => (
          <Image
            key={i}
            source={ACTORS.pin}
            style={{
              position: 'absolute',
              left: p.x - PIN_R * 1.4,
              top: p.y - PIN_R * 1.8,
              width: PIN_R * 2.8,
              height: PIN_R * 3.6,
              opacity: p.up ? 1 : 0.3,
              transform: p.up ? undefined : [{ rotate: i % 2 === 0 ? '75deg' : '-75deg' }],
            }}
          />
        ))}
        {/* Ball: glossy with finger holes */}
        <View
          style={{
            position: 'absolute',
            left: ball.current.x - BALL_R,
            top: ball.current.y - BALL_R,
            width: BALL_R * 2,
            height: BALL_R * 2,
            borderRadius: BALL_R,
            backgroundColor: colors.neonCyan,
          }}>
          <View style={{ position: 'absolute', left: BALL_R * 0.55, top: BALL_R * 0.45, width: BALL_R * 0.3, height: BALL_R * 0.3, borderRadius: BALL_R * 0.15, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View style={{ position: 'absolute', left: BALL_R * 1.05, top: BALL_R * 0.55, width: BALL_R * 0.3, height: BALL_R * 0.3, borderRadius: BALL_R * 0.15, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View style={{ position: 'absolute', left: BALL_R * 0.8, top: BALL_R * 0.95, width: BALL_R * 0.3, height: BALL_R * 0.3, borderRadius: BALL_R * 0.15, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </View>
        {/* Aim hint line */}
        {phase.current === 'aim' && (
          <View
            style={{
              position: 'absolute',
              left: ball.current.x - 1,
              top: PIN_TOP + 3 * SPACING,
              width: 2,
              height: BALL_Y0 - BALL_R - (PIN_TOP + 3 * SPACING),
              backgroundColor: 'rgba(0,255,247,0.18)',
            }}
          />
        )}
      </View>
    </View>
  );
}
