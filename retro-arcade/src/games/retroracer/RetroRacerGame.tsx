import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * 90s top-down highway racer. The race opens on a starting grid — five rival
 * cars lined up behind a white START box — with a four-beep countdown before
 * the pack launches. Then it's a gray three-lane highway walled by bright
 * grass, pine trees and blue road signs: swipe (or tap ◀ ▶) to hop lanes and
 * thread through the yellow-and-blue traffic. Score is distance plus a bonus
 * per car overtaken. One crash spins you out — literally — and ends the run.
 */
const LANES = 3;

/** Countdown pacing: a beep every half second, GO on the fifth. */
const BEAT = 0.5;
const GO_AT = BEAT * 4;

interface Car {
  /** Stable identity for React keys — index keys made sprites swap between
   * cars (visible glitching) whenever an off-screen car was filtered out. */
  id: number;
  lane: number;
  y: number;
  sprite: 'racecar_yellow' | 'racecar_cyan';
  passed: boolean;
}

interface Decor {
  id: number;
  y: number;
  side: 0 | 1;
  kind: 'tree' | 'sign';
  dx: number;
}

type Phase = 'grid' | 'race' | 'crash' | 'boom';

export function RetroRacerGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const ROAD_W = Math.min(W * 0.68, 310);
  const LANE_W = ROAD_W / LANES;
  const roadX = (W - ROAD_W) / 2;
  const CAR_W = LANE_W * 0.44;
  const CAR_H = CAR_W * 1.3;
  const PLAYER_Y = H - CAR_H - 40;
  const TREE = Math.min(roadX * 0.8, 46);
  const SIGN = TREE * 0.8;

  const phase = useRef<Phase>('grid');
  const phaseT = useRef(0); // seconds inside the current phase
  const lane = useRef(1);
  const cars = useRef<Car[]>([]);
  const gridCars = useRef<Car[]>([]);
  const decor = useRef<Decor[]>([]);
  const nextId = useRef(1);
  const startLineY = useRef(0);
  const distance = useRef(0);
  const finalScore = useRef(0);
  const spawnTimer = useRef(0);
  const decorPx = useRef(0);
  const dashOffset = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    phase.current = 'grid';
    phaseT.current = 0;
    lane.current = 1;
    cars.current = [];
    distance.current = 0;
    finalScore.current = 0;
    spawnTimer.current = 1.4;
    decorPx.current = 0;
    startLineY.current = PLAYER_Y - CAR_H * 1.6;
    // Starting grid: five rivals parked ahead of the START box in two rows.
    gridCars.current = [0, 1, 2, 0, 2].map((l, i) => ({
      id: nextId.current++,
      lane: l,
      y: PLAYER_Y - CAR_H * (i < 3 ? 3.2 : 4.6),
      sprite: 'racecar_cyan',
      passed: true,
    }));
    // Pre-plant trees down both shoulders so the roadside starts dressed.
    decor.current = [];
    for (let y = -60; y < H; y += 100) {
      for (const side of [0, 1] as const) {
        decor.current.push({
          id: nextId.current++,
          y: y + (side ? 50 : 0),
          side,
          kind: Math.random() < 0.15 ? 'sign' : 'tree',
          dx: (Math.random() - 0.5) * 12,
        });
      }
    }
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const steer = (dir: Dir) => {
    if (!api.running || (phase.current !== 'race' && phase.current !== 'grid')) return;
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
  };
  const pan = useSwipe(steer);

  useGameLoop(api.running, (dt) => {
    switch (phase.current) {
      case 'grid': {
        // Fire the countdown audio on the very first tick, then hold the grid.
        if (phaseT.current === 0) playSfx('raceStart');
        phaseT.current += dt;
        if (phaseT.current >= GO_AT) {
          phase.current = 'race';
          phaseT.current = 0;
          haptic.medium();
        }
        break;
      }
      case 'race': {
        phaseT.current += dt;
        // Speed ramps from 0.45H/s toward 1.2H/s over ~90 seconds of driving.
        const speed = H * Math.min(1.2, 0.45 + distance.current / 8000);
        distance.current += speed * dt * 0.1;
        dashOffset.current = (dashOffset.current + speed * dt) % 60;

        // The rival pack launches ahead and disappears up the road.
        for (const c of gridCars.current) c.y -= H * 0.9 * dt;
        gridCars.current = gridCars.current.filter((c) => c.y > -CAR_H * 2);

        // The START box scrolls away behind us.
        if (startLineY.current < H + 40) startLineY.current += speed * dt;

        // Roadside trees and signs scroll with the road.
        decorPx.current += speed * dt;
        if (decorPx.current >= 100) {
          decorPx.current -= 100;
          for (const side of [0, 1] as const) {
            decor.current.push({
              id: nextId.current++,
              y: -TREE - 10,
              side,
              kind: Math.random() < 0.15 ? 'sign' : 'tree',
              dx: (Math.random() - 0.5) * 12,
            });
          }
        }
        for (const d of decor.current) d.y += speed * dt;
        decor.current = decor.current.filter((d) => d.y < H + TREE);

        // Give the pack a head start before traffic thickens.
        if (gridCars.current.length === 0) spawnTimer.current -= dt;
        if (spawnTimer.current <= 0) {
          // Never block every lane at once: pick 1 (sometimes 2) lanes to fill.
          const open = [0, 1, 2].sort(() => Math.random() - 0.5);
          const count = Math.random() < Math.min(0.5, distance.current / 3000) ? 2 : 1;
          for (let i = 0; i < count; i++) {
            // Don't stack a new car onto one still near the top of the same lane.
            if (cars.current.some((c) => c.lane === open[i] && c.y < CAR_H * 2.2)) continue;
            cars.current.push({
              id: nextId.current++,
              lane: open[i],
              y: -CAR_H,
              sprite: Math.random() < 0.5 ? 'racecar_yellow' : 'racecar_cyan',
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
        const score = Math.floor(distance.current) + overtaken * 5;
        api.setScore(score);

        // Collision: same lane and vertical overlap (slightly forgiving).
        const crash = cars.current.some(
          (c) =>
            c.lane === lane.current &&
            c.y + CAR_H - CAR_H * 0.15 > PLAYER_Y &&
            c.y < PLAYER_Y + CAR_H * 0.85
        );
        if (crash) {
          // The road freezes and the car spins out where it stands.
          phase.current = 'crash';
          phaseT.current = 0;
          finalScore.current = score;
          playSfx('shoot');
          haptic.heavy();
        }
        break;
      }
      case 'crash': {
        phaseT.current += dt;
        if (phaseT.current >= 0.85) {
          phase.current = 'boom';
          phaseT.current = 0;
          playSfx('explode');
        }
        break;
      }
      case 'boom': {
        phaseT.current += dt;
        if (phaseT.current >= 0.7) {
          api.end({ score: finalScore.current });
          return;
        }
        break;
      }
    }
    redraw((n) => n + 1);
  });

  const laneX = (l: number) => roadX + l * LANE_W + (LANE_W - CAR_W) / 2;
  const beeps = phase.current === 'grid' ? Math.min(4, Math.floor(phaseT.current / BEAT) + 1) : 4;
  const showGo = phase.current === 'race' && phaseT.current < 0.7;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1, overflow: 'hidden' }}>
          {/* Grass shoulders */}
          <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: '#1e9e2a' }} />
          {/* Gray highway with white edge lines */}
          <View
            style={{
              position: 'absolute',
              left: roadX,
              top: 0,
              width: ROAD_W,
              height: H,
              backgroundColor: '#6b6b76',
              borderLeftWidth: 4,
              borderRightWidth: 4,
              borderColor: '#e8e8f0',
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
                  height: 28,
                  backgroundColor: '#e8e8f0',
                }}
              />
            ))
          )}
          {/* Roadside pines and blue signs */}
          {decor.current.map((d) => {
            const size = d.kind === 'tree' ? TREE : SIGN;
            const base = d.side === 0 ? (roadX - size) / 2 : roadX + ROAD_W + (roadX - size) / 2;
            return (
              <Image
                key={d.id}
                source={d.kind === 'tree' ? ACTORS.pine_tree : ACTORS.road_sign_blue}
                style={{ position: 'absolute', left: base + d.dx, top: d.y, width: size, height: size }}
              />
            );
          })}
          {/* START box across the road */}
          {startLineY.current < H + 40 && (
            <View
              style={{
                position: 'absolute',
                left: roadX + 4,
                top: startLineY.current,
                width: ROAD_W - 8,
                height: 26,
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <PixelText size={12} color="#101018">
                START
              </PixelText>
            </View>
          )}
          {/* Rival pack on the grid */}
          {gridCars.current.map((c) => (
            <Image
              key={c.id}
              source={ACTORS[c.sprite]}
              style={{ position: 'absolute', left: laneX(c.lane), top: c.y, width: CAR_W, height: CAR_H }}
            />
          ))}
          {/* Traffic to overtake */}
          {cars.current.map((c) => (
            <Image
              key={c.id}
              source={ACTORS[c.sprite]}
              style={{ position: 'absolute', left: laneX(c.lane), top: c.y, width: CAR_W, height: CAR_H }}
            />
          ))}
          {/* Player: the little red car (hidden once it blows up) */}
          {phase.current !== 'boom' && (
            <Image
              source={ACTORS.racecar_red}
              style={{
                position: 'absolute',
                left: laneX(lane.current),
                top: PLAYER_Y,
                width: CAR_W,
                height: CAR_H,
                transform: [
                  { rotate: phase.current === 'crash' ? `${Math.floor(phaseT.current * 1200)}deg` : '0deg' },
                ],
              }}
            />
          )}
          {/* Explosion where the car was */}
          {phase.current === 'boom' && (
            <Image
              source={ACTORS.explosion_burst}
              style={{
                position: 'absolute',
                left: laneX(lane.current) - CAR_W * 0.5,
                top: PLAYER_Y - CAR_H * 0.35,
                width: CAR_W * 2,
                height: CAR_W * 2,
                transform: [{ scale: 1 + phaseT.current * 0.5 }],
              }}
            />
          )}
          {/* Countdown lights + GO! */}
          {phase.current === 'grid' && (
            <View style={{ position: 'absolute', left: 0, right: 0, top: H * 0.16, flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 3,
                    borderColor: '#101018',
                    backgroundColor: i < beeps ? colors.neonYellow : '#3a3a44',
                  }}
                />
              ))}
            </View>
          )}
          {showGo && (
            <View style={{ position: 'absolute', left: 0, right: 0, top: H * 0.16, alignItems: 'center' }}>
              <PixelText size={30} color={colors.neonGreen} glow>
                GO!
              </PixelText>
            </View>
          )}
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => steer(k as Dir)}
      />
    </View>
  );
}
