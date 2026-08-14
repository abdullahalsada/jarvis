import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSwipe } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * LCD-era lane racer: three lanes of oncoming traffic, swipe left/right to
 * change lanes — one discrete hop per swipe, exactly like the handheld
 * originals. Speed climbs steadily, traffic thickens, near-misses hum past.
 * Score is distance plus a small bonus per car overtaken. One crash ends it.
 */
const LANES = 3;

interface Car {
  lane: number;
  y: number;
  color: string;
  passed: boolean;
}

const CAR_COLORS = [colors.neonMagenta, colors.neonYellow, colors.neonOrange, colors.neonPurple];

export function RetroRacerGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const ROAD_W = Math.min(W * 0.8, 360);
  const LANE_W = ROAD_W / LANES;
  const roadX = (W - ROAD_W) / 2;
  const CAR_W = LANE_W * 0.62;
  const CAR_H = CAR_W * 1.5;
  const PLAYER_Y = H - CAR_H - 40;

  const lane = useRef(1);
  const cars = useRef<Car[]>([]);
  const distance = useRef(0);
  const spawnTimer = useRef(0);
  const dashOffset = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    lane.current = 1;
    cars.current = [];
    distance.current = 0;
    spawnTimer.current = 1;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSwipe((dir) => {
    if (!api.running) return;
    if (dir === 'left' && lane.current > 0) {
      lane.current -= 1;
      playSfx('select');
      haptic.light();
    }
    if (dir === 'right' && lane.current < LANES - 1) {
      lane.current += 1;
      playSfx('select');
      haptic.light();
    }
  });

  useGameLoop(api.running, (dt) => {
    // Speed ramps from 0.45H/s toward 1.2H/s over ~90 seconds of driving.
    const speed = H * Math.min(1.2, 0.45 + distance.current / 8000);
    distance.current += speed * dt * 0.1;

    dashOffset.current = (dashOffset.current + speed * dt) % 60;

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      // Never block every lane at once: pick 1 (sometimes 2) lanes to fill.
      const open = [0, 1, 2].sort(() => Math.random() - 0.5);
      const count = Math.random() < Math.min(0.5, distance.current / 3000) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        cars.current.push({
          lane: open[i],
          y: -CAR_H,
          color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
          passed: false,
        });
      }
      spawnTimer.current = Math.max(0.45, 1.1 - distance.current / 4000);
    }

    for (const c of cars.current) {
      c.y += speed * dt;
      if (!c.passed && c.y > PLAYER_Y + CAR_H) {
        c.passed = true;
        playSfx('bounce');
      }
    }
    cars.current = cars.current.filter((c) => c.y < H + CAR_H);

    // Score: distance + 5 per overtaken car.
    const overtaken = cars.current.filter((c) => c.passed).length;
    api.setScore(Math.floor(distance.current) + overtaken * 5);

    // Collision: same lane and vertical overlap (slightly forgiving).
    const crash = cars.current.some(
      (c) =>
        c.lane === lane.current &&
        c.y + CAR_H * 0.85 > PLAYER_Y &&
        c.y < PLAYER_Y + CAR_H * 0.85
    );
    if (crash) {
      playSfx('explode');
      haptic.heavy();
      api.end({ score: Math.floor(distance.current) + overtaken * 5 });
      return;
    }
    redraw((n) => n + 1);
  });

  const laneX = (l: number) => roadX + l * LANE_W + (LANE_W - CAR_W) / 2;

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Road */}
        <View
          style={{
            position: 'absolute',
            left: roadX,
            top: 0,
            width: ROAD_W,
            height: H,
            backgroundColor: '#101018',
            borderLeftWidth: 3,
            borderRightWidth: 3,
            borderColor: colors.border,
          }}
        />
        {/* Lane dashes, scrolling */}
        {[1, 2].map((l) =>
          Array.from({ length: Math.ceil(H / 60) + 1 }, (_, i) => (
            <View
              key={`${l}-${i}`}
              style={{
                position: 'absolute',
                left: roadX + l * LANE_W - 2,
                top: i * 60 + dashOffset.current - 60,
                width: 4,
                height: 30,
                backgroundColor: '#2a2a45',
              }}
            />
          ))
        )}
        {cars.current.map((c, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: laneX(c.lane),
              top: c.y,
              width: CAR_W,
              height: CAR_H,
              borderRadius: 6,
              backgroundColor: c.color,
            }}
          />
        ))}
        {/* Player car */}
        <View
          style={{
            position: 'absolute',
            left: laneX(lane.current),
            top: PLAYER_Y,
            width: CAR_W,
            height: CAR_H,
            borderRadius: 6,
            backgroundColor: colors.neonCyan,
          }}>
          <View
            style={{
              marginTop: CAR_H * 0.18,
              alignSelf: 'center',
              width: CAR_W * 0.6,
              height: CAR_H * 0.22,
              borderRadius: 3,
              backgroundColor: colors.bg,
            }}
          />
        </View>
      </View>
    </View>
  );
}
