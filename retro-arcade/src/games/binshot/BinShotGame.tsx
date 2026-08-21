import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * The eternal classroom sport: toss the paper ball into the bin. Drag back
 * and release to throw — but mind the fan! The wind arrow changes every
 * throw and pushes your ball mid-air. Baskets score 10 (+streak bonus),
 * and the bin wanders further away as you sink them. Three misses and the
 * teacher turns around.
 */
export function BinShotGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const FLOOR = H - 50;
  const BALL_R = 16;
  const START = { x: W * 0.5, y: FLOOR - BALL_R };

  const ball = useRef({ x: START.x, y: START.y, vx: 0, vy: 0, flying: false });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const bin = useRef({ x: W * 0.5, y: H * 0.32 });
  const wind = useRef(0); // px/s² sideways
  const misses = useRef(0);
  const streak = useRef(0);
  const baskets = useRef(0);
  const score = useRef(0);
  const settled = useRef(false);
  const [, redraw] = useState(0);

  const newWind = () => {
    wind.current = (Math.random() - 0.5) * W * (0.5 + Math.min(1, baskets.current / 10) * 0.8);
  };

  const placeBin = () => {
    bin.current = {
      x: W * (0.25 + Math.random() * 0.5),
      y: H * (0.2 + Math.random() * 0.2),
    };
  };

  const resetBall = () => {
    ball.current = { x: START.x, y: START.y, vx: 0, vy: 0, flying: false };
    drag.current = null;
    settled.current = false;
    newWind();
  };

  useEffect(() => {
    misses.current = 0;
    streak.current = 0;
    baskets.current = 0;
    score.current = 0;
    api.setScore(0);
    api.setLives(3);
    placeBin();
    resetBall();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const launch = () => {
    const d = drag.current;
    if (!api.running || !d || ball.current.flying) return;
    const dx = START.x - d.x;
    const dy = START.y - d.y;
    if (Math.hypot(dx, dy) < 16) {
      resetBall();
      return;
    }
    ball.current.flying = true;
    ball.current.vx = dx * 6;
    ball.current.vy = dy * 6;
    playSfx('shoot');
    haptic.light();
  };
  const launchRef = useRef(launch);
  launchRef.current = launch;

  const dragTo = (x: number, y: number) => {
    if (!api.running || ball.current.flying) return;
    const dx = x - START.x;
    const dy = y - START.y;
    const dist = Math.hypot(dx, dy);
    const max = 120;
    const k = dist > max ? max / dist : 1;
    drag.current = { x: START.x + dx * k, y: START.y + dy * k };
    ball.current.x = drag.current.x;
    ball.current.y = drag.current.y;
  };
  const dragRef = useRef(dragTo);
  dragRef.current = dragTo;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => dragRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderMove: (evt) => dragRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderRelease: () => launchRef.current(),
      onPanResponderTerminate: () => launchRef.current(),
    })
  );

  useGameLoop(api.running, (dt) => {
    const b = ball.current;
    if (!b.flying) return;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy += H * 0.9 * dt;
    b.vx += wind.current * dt;

    // In the bin: falling, inside the rim.
    const BIN_W = 64;
    if (
      b.vy > 0 &&
      b.y > bin.current.y - 6 &&
      b.y < bin.current.y + 26 &&
      Math.abs(b.x - bin.current.x) < BIN_W / 2 - BALL_R * 0.4
    ) {
      streak.current += 1;
      baskets.current += 1;
      score.current += 10 + (streak.current >= 3 ? streak.current * 5 : 0);
      api.setScore(score.current);
      playSfx(streak.current >= 3 ? 'match' : 'point');
      haptic.medium();
      placeBin();
      resetBall();
      redraw((n) => n + 1);
      return;
    }

    // Missed: off screen or landed.
    if (b.y > H + BALL_R || b.x < -BALL_R * 2 || b.x > W + BALL_R * 2) {
      streak.current = 0;
      misses.current += 1;
      api.setLives(3 - misses.current);
      playSfx('loseLife');
      haptic.heavy();
      if (misses.current >= 3) {
        api.end({ score: score.current });
        return;
      }
      resetBall();
    }
    redraw((n) => n + 1);
  });

  const windMag = Math.abs(wind.current) / (W * 1.3);
  const BIN_W = 64;

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Classroom floor */}
        <View style={{ position: 'absolute', top: FLOOR + BALL_R, width: W, height: H - FLOOR, backgroundColor: '#3a2c1c', borderTopWidth: 2, borderColor: '#57431f' }} />
        {/* Chalkboard with the wind arrow */}
        <View style={{ position: 'absolute', left: W / 2 - 70, top: 14, width: 140, height: 46, backgroundColor: '#1c3a2c', borderWidth: 3, borderColor: '#8a5a2b', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
          <PixelText size={16} color={colors.text}>
            {wind.current < -10 ? '◀'.repeat(Math.max(1, Math.ceil(windMag * 3))) : wind.current > 10 ? '▶'.repeat(Math.max(1, Math.ceil(windMag * 3))) : '·'}
          </PixelText>
        </View>
        {/* The bin */}
        <View style={{ position: 'absolute', left: bin.current.x - BIN_W / 2, top: bin.current.y, width: BIN_W, height: 54 }}>
          <View style={{ position: 'absolute', top: 0, width: BIN_W, height: 10, borderRadius: 5, backgroundColor: '#9a9ab5', zIndex: 2 }} />
          <View style={{ position: 'absolute', top: 6, left: 5, width: BIN_W - 10, height: 46, backgroundColor: '#4a4a6a', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 2, borderColor: '#6a6a85' }} />
        </View>
        {/* Aim band */}
        {drag.current && (
          <View
            style={{
              position: 'absolute',
              left: Math.min(START.x, drag.current.x),
              top: Math.min(START.y, drag.current.y),
              width: Math.abs(drag.current.x - START.x) || 2,
              height: Math.abs(drag.current.y - START.y) || 2,
              borderWidth: 1,
              borderColor: colors.neonCyan,
              opacity: 0.6,
            }}
          />
        )}
        {/* Paper ball */}
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
          }}>
          <View style={{ position: 'absolute', left: 6, top: 9, width: 14, height: 2, backgroundColor: '#b5b5c8', transform: [{ rotate: '30deg' }] }} />
          <View style={{ position: 'absolute', left: 10, top: 18, width: 12, height: 2, backgroundColor: '#b5b5c8', transform: [{ rotate: '-20deg' }] }} />
        </View>
        {/* Streak */}
        {streak.current >= 3 && (
          <PixelText size={12} color={colors.neonYellow} glow style={{ position: 'absolute', top: 70, alignSelf: 'center' }}>
            {`🔥 ${streak.current}`}
          </PixelText>
        )}
      </View>
    </View>
  );
}
