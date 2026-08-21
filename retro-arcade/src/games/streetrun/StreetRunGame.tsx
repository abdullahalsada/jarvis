import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSwipe, type Dir } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Endless street runner: three lanes rush toward you — hop lanes with
 * ◀ ▶ (or swipe) and vault wooden crates with ↥. Trash bins are too tall
 * to jump; dodge them. Grab the coins for bonus points. The street gets
 * faster the longer you run. 3 lives, brief mercy after a hit.
 */
const LANES = 3;

interface Thing {
  id: number;
  lane: number;
  y: number; // 0 at horizon, grows toward the player
  kind: 'crate' | 'bin' | 'coin';
}

export function StreetRunGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const ROAD_W = Math.min(W * 0.86, 380);
  const LANE_W = ROAD_W / LANES;
  const roadX = (W - ROAD_W) / 2;
  const PSIZE = 52;
  const PLAYER_Y = H - PSIZE - 30;

  const lane = useRef(1);
  const jumpT = useRef(0); // >0 while airborne
  const things = useRef<Thing[]>([]);
  const nextId = useRef(1);
  const spawnCd = useRef(1);
  const distance = useRef(0);
  const lives = useRef(3);
  const mercy = useRef(0);
  const score = useRef(0);
  const wispBonus = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    lane.current = 1;
    jumpT.current = 0;
    things.current = [];
    spawnCd.current = 1;
    distance.current = 0;
    lives.current = 3;
    mercy.current = 0;
    score.current = 0;
    wispBonus.current = 0;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const steer = (d: Dir) => {
    if (!api.running) return;
    if (d === 'left' && lane.current > 0) {
      lane.current -= 1;
      playSfx('select');
      haptic.light();
    } else if (d === 'right' && lane.current < LANES - 1) {
      lane.current += 1;
      playSfx('select');
      haptic.light();
    } else if (d === 'up') {
      jump();
    }
  };
  const pan = useSwipe(steer);

  const jump = () => {
    if (!api.running || jumpT.current > 0) return;
    jumpT.current = 0.55;
    playSfx('bounce');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    const speed = H * (0.55 + Math.min(0.75, distance.current / 4000));
    distance.current += speed * dt * 0.1;
    if (jumpT.current > 0) jumpT.current -= dt;
    if (mercy.current > 0) mercy.current -= dt;

    spawnCd.current -= dt;
    if (spawnCd.current <= 0) {
      // Never block all three lanes with unjumpable ghosts.
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      const n = Math.random() < Math.min(0.55, distance.current / 2500) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        things.current.push({
          id: nextId.current++,
          lane: lanes[i],
          y: -40,
          kind: r < 0.18 ? 'coin' : r < 0.55 ? 'bin' : 'crate',
        });
      }
      spawnCd.current = Math.max(0.5, 1.25 - distance.current / 4000);
    }

    for (const t of things.current) t.y += speed * dt;
    things.current = things.current.filter((t) => t.y < H + 60);

    const airborne = jumpT.current > 0.12; // top of the arc clears stones
    for (const t of things.current) {
      if (t.lane !== lane.current) continue;
      const hit = t.y > PLAYER_Y - PSIZE * 0.4 && t.y < PLAYER_Y + PSIZE * 0.7;
      if (!hit) continue;
      if (t.kind === 'coin') {
        t.y = H + 999;
        wispBonus.current += 25;
        playSfx('coin');
        haptic.light();
      } else if (t.kind === 'crate' && airborne) {
        // vaulted it
      } else if (mercy.current <= 0) {
        t.y = H + 999;
        lives.current -= 1;
        mercy.current = 1.2;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
      }
    }

    // Score: distance survived plus wisp bonuses.
    score.current = Math.floor(distance.current) + wispBonus.current;
    api.setScore(score.current);
    redraw((n) => n + 1);
  });

  const laneX = (l: number) => roadX + l * LANE_W + LANE_W / 2;
  const jumpLift = jumpT.current > 0 ? Math.sin((1 - jumpT.current / 0.55) * Math.PI) * PSIZE * 1.1 : 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {/* Afternoon sun */}
          <View style={{ position: 'absolute', right: 22, top: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffe600', opacity: 0.75 }} />
          {/* Asphalt */}
          <View
            style={{
              position: 'absolute',
              left: roadX,
              top: 0,
              width: ROAD_W,
              height: H,
              backgroundColor: '#1d1d26',
              borderLeftWidth: 3,
              borderRightWidth: 3,
              borderColor: '#3a3a4a',
            }}
          />
          {[1, 2].map((l) => (
            <View key={l} style={{ position: 'absolute', left: roadX + l * LANE_W - 1, top: 0, width: 2, height: H, backgroundColor: '#34343f' }} />
          ))}
          {things.current.map((t) => {
            if (t.kind === 'crate') {
              return (
                <View
                  key={t.id}
                  style={{
                    position: 'absolute',
                    left: laneX(t.lane) - 22,
                    top: t.y - 20,
                    width: 44,
                    height: 36,
                    backgroundColor: '#8a5a2b',
                    borderWidth: 3,
                    borderColor: '#5e3d1c',
                  }}
                />
              );
            }
            if (t.kind === 'bin') {
              return (
                <View key={t.id} style={{ position: 'absolute', left: laneX(t.lane) - 20, top: t.y - 28 }}>
                  <View style={{ width: 40, height: 8, borderRadius: 4, backgroundColor: '#9a9ab5' }} />
                  <View style={{ width: 34, height: 42, marginLeft: 3, backgroundColor: '#6a6a85', borderWidth: 2, borderColor: '#9a9ab5' }} />
                </View>
              );
            }
            return (
              <View
                key={t.id}
                style={{
                  position: 'absolute',
                  left: laneX(t.lane) - 10,
                  top: t.y - 10,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.neonYellow,
                  shadowColor: colors.neonYellow,
                  shadowOpacity: 0.9,
                  shadowRadius: 8,
                }}
              />
            );
          })}
          {/* The runner (dims briefly after a hit) */}
          <Image
            source={ACTORS.climber}
            style={{
              position: 'absolute',
              left: laneX(lane.current) - PSIZE / 2,
              top: PLAYER_Y - jumpLift,
              width: PSIZE,
              height: PSIZE,
              opacity: mercy.current > 0 ? 0.5 : 1,
            }}
          />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'up', label: '↥', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => steer(k as Dir)}
      />
    </View>
  );
}
