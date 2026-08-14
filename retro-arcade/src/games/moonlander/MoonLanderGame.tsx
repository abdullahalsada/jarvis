import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, touchTarget } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Lunar-lander mechanics: fight gravity with limited fuel and set down
 * gently on the marked pad. A landing counts only when you're slow enough
 * (both axes) and over the pad. Each successful landing scores by remaining
 * fuel and pad size, then a new, meaner moonscape generates — smaller pad,
 * stronger gravity. Crash once and the mission ends.
 */
export function MoonLanderGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const FIELD_H = H - 110;
  const SHIP = 22;

  const ship = useRef({ x: W / 2, y: 60, vx: 0, vy: 0 });
  const fuel = useRef(100);
  const terrain = useRef<number[]>([]);
  const pad = useRef({ x: 0, w: 80 });
  const level = useRef(1);
  const score = useRef(0);
  const held = useRef({ left: false, right: false, thrust: false });
  const [, redraw] = useState(0);

  const GRAVITY = () => FIELD_H * (0.10 + level.current * 0.012);
  const SAFE_VY = () => FIELD_H * 0.09;
  const SAFE_VX = () => W * 0.08;

  const genTerrain = () => {
    const points = 12;
    const heights: number[] = [];
    for (let i = 0; i <= points; i++) {
      heights.push(FIELD_H * (0.72 + Math.random() * 0.2));
    }
    // Flatten a pad segment.
    const padSeg = 2 + Math.floor(Math.random() * (points - 4));
    const padW = Math.max(46, 90 - level.current * 8);
    heights[padSeg + 1] = heights[padSeg];
    terrain.current = heights;
    pad.current = { x: (padSeg / points) * W, w: padW };
  };

  const resetShip = () => {
    ship.current = { x: W * (0.2 + Math.random() * 0.6), y: 50, vx: 0, vy: 0 };
    fuel.current = 100;
  };

  useEffect(() => {
    level.current = 1;
    score.current = 0;
    api.setScore(0);
    genTerrain();
    resetShip();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const groundAt = (x: number): number => {
    const points = terrain.current.length - 1;
    const seg = Math.max(0, Math.min(points - 1, Math.floor((x / W) * points)));
    const t = (x / W) * points - seg;
    return terrain.current[seg] * (1 - t) + terrain.current[seg + 1] * t;
  };

  useGameLoop(api.running, (dt) => {
    const s = ship.current;
    const thrusting = held.current.thrust && fuel.current > 0;

    s.vy += GRAVITY() * dt;
    if (thrusting) {
      s.vy -= FIELD_H * 0.28 * dt;
      fuel.current = Math.max(0, fuel.current - 9 * dt);
    }
    if (held.current.left && fuel.current > 0) {
      s.vx -= W * 0.12 * dt;
      fuel.current = Math.max(0, fuel.current - 3 * dt);
    }
    if (held.current.right && fuel.current > 0) {
      s.vx += W * 0.12 * dt;
      fuel.current = Math.max(0, fuel.current - 3 * dt);
    }
    s.x = Math.max(SHIP / 2, Math.min(W - SHIP / 2, s.x + s.vx * dt));
    s.y += s.vy * dt;

    const ground = groundAt(s.x);
    if (s.y + SHIP / 2 >= ground) {
      const onPad =
        s.x > pad.current.x && s.x < pad.current.x + pad.current.w &&
        Math.abs(groundAt(pad.current.x + 2) - ground) < 2;
      const gentle = s.vy < SAFE_VY() && Math.abs(s.vx) < SAFE_VX();
      if (onPad && gentle) {
        const gained = 100 + Math.round(fuel.current) * 2 + level.current * 25;
        score.current += gained;
        api.setScore(score.current);
        playSfx('win');
        haptic.success();
        level.current += 1;
        genTerrain();
        resetShip();
      } else {
        playSfx('explode');
        haptic.heavy();
        api.end({ score: score.current });
        return;
      }
    }
    redraw((n) => n + 1);
  });

  const holdButton = (key: keyof typeof held.current, label: string, color: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => {
        held.current[key] = true;
        if (key === 'thrust') playSfx('shoot');
      }}
      onPressOut={() => {
        held.current[key] = false;
      }}
      style={({ pressed }) => ({
        width: touchTarget + 24,
        height: touchTarget + 24,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: pressed ? color : colors.bgRaised,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <PixelText size="heading" color={colors.text}>
        {label}
      </PixelText>
    </Pressable>
  );

  const s = ship.current;
  const gentleNow = s.vy < SAFE_VY() && Math.abs(s.vx) < SAFE_VX();

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ width: W, height: FIELD_H, overflow: 'hidden' }}>
        {/* Terrain as thin vertical slices */}
        {Array.from({ length: 60 }, (_, i) => {
          const x = (i / 60) * W;
          const g = groundAt(x + W / 120);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: g,
                width: W / 60 + 1,
                height: FIELD_H - g,
                backgroundColor: '#1c1c30',
              }}
            />
          );
        })}
        {/* Pad */}
        <View
          style={{
            position: 'absolute',
            left: pad.current.x,
            top: groundAt(pad.current.x + 2) - 4,
            width: pad.current.w,
            height: 6,
            backgroundColor: colors.neonGreen,
          }}
        />
        {/* Ship */}
        <View
          style={{
            position: 'absolute',
            left: s.x - SHIP / 2,
            top: s.y - SHIP / 2,
            width: SHIP,
            height: SHIP,
            borderRadius: 4,
            backgroundColor: gentleNow ? colors.neonCyan : colors.neonOrange,
          }}
        />
        {held.current.thrust && fuel.current > 0 && (
          <View
            style={{
              position: 'absolute',
              left: s.x - 4,
              top: s.y + SHIP / 2,
              width: 8,
              height: 12,
              backgroundColor: colors.neonYellow,
            }}
          />
        )}
        {/* Fuel + velocity readout: cyan means landing-safe */}
        <PixelText size="label" color={colors.textDim} style={{ position: 'absolute', top: 6, left: 12 }}>
          {`⛽ ${Math.round(fuel.current)}  ▼ ${Math.round(s.vy)}`}
        </PixelText>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', flex: 1 }}>
        {holdButton('left', '◀', colors.neonCyan)}
        {holdButton('thrust', '▲', colors.neonOrange)}
        {holdButton('right', '▶', colors.neonCyan)}
      </View>
    </View>
  );
}
