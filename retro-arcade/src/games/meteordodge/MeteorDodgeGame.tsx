import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Survival dodger: meteors rain down with steadily increasing rate and speed.
 * Score = survival time × multiplier. One hit ends the run — the tension of
 * the "just one more try" handheld era.
 */
interface Meteor {
  x: number;
  y: number;
  size: number;
  vy: number;
  vx: number;
}

export function MeteorDodgeGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const SHIP = 26;
  const SHIP_Y = H - 80;

  const ship = useRef(W / 2);
  const meteors = useRef<Meteor[]>([]);
  const elapsed = useRef(0);
  const spawnTimer = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    ship.current = W / 2;
    meteors.current = [];
    elapsed.current = 0;
    spawnTimer.current = 0;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    ship.current = Math.max(SHIP / 2, Math.min(W - SHIP / 2, x));
  });

  const held = useRef({ left: false, right: false });

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      ship.current = Math.max(SHIP / 2, Math.min(W - SHIP / 2, ship.current + dx * W * 0.9 * dt));
    }
    elapsed.current += dt;
    const difficulty = 1 + elapsed.current / 15; // ramps forever

    // Score: 10 points per second survived, scaled by difficulty.
    api.setScore(Math.floor(elapsed.current * 10 * difficulty));

    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      const size = 14 + Math.random() * 26;
      meteors.current.push({
        x: Math.random() * W,
        y: -size,
        size,
        vy: H * (0.25 + Math.random() * 0.2) * difficulty,
        vx: (Math.random() - 0.5) * W * 0.1,
      });
      spawnTimer.current = Math.max(0.12, 0.6 / difficulty);
    }

    for (const m of meteors.current) {
      m.y += m.vy * dt;
      m.x += m.vx * dt;
    }
    meteors.current = meteors.current.filter((m) => m.y < H + m.size);

    // Collision (circle vs circle, forgiving 80% hitbox for fairness)
    for (const m of meteors.current) {
      const dx = m.x - ship.current;
      const dy = m.y - (SHIP_Y + SHIP / 2);
      const hitDist = (m.size / 2 + SHIP / 2) * 0.8;
      if (dx * dx + dy * dy < hitDist * hitDist) {
        playSfx('explode');
        haptic.heavy();
        api.end({ score: Math.floor(elapsed.current * 10 * difficulty) });
        return;
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {meteors.current.map((m, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: m.x - m.size / 2,
              top: m.y - m.size / 2,
              width: m.size,
              height: m.size,
              backgroundColor: colors.neonOrange,
              borderRadius: 4,
              transform: [{ rotate: `${(i * 37) % 90}deg` }],
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: ship.current - SHIP / 2,
            top: SHIP_Y,
            width: SHIP,
            height: SHIP,
            backgroundColor: colors.neonCyan,
            borderRadius: 4,
          }}
        />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => {
          held.current[k as 'left' | 'right'] = true;
        }}
        onUp={(k) => {
          held.current[k as 'left' | 'right'] = false;
        }}
      />
    </View>
  );
}
