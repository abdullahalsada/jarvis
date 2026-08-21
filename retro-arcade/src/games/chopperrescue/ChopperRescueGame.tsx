import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { DPad, PAD_DPAD } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Choplifter-style rescue mission: hostages wait on the right; fly over,
 * hover low to winch them aboard (3 seats), then land back on the pad to
 * drop them off — 100 points each, +250 for a full group. An enemy turret
 * mid-field lobs aimed flak the whole time. Rounds add hostages and
 * faster flak. 3 lives.
 */
const SEATS = 3;

interface Flak {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function ChopperRescueGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_DPAD;
  const GROUND = H - 26;
  const CH = 46; // chopper size
  const PAD_X = W * 0.14;

  const pos = useRef({ x: W * 0.2, y: H * 0.3 });
  const held = useRef({ left: false, right: false, up: false, down: false });
  const hostages = useRef<number[]>([]); // x positions of the waiting
  const aboard = useRef(0);
  const rescued = useRef(0);
  const flak = useRef<Flak[]>([]);
  const flakCd = useRef(2);
  const lives = useRef(3);
  const score = useRef(0);
  const round = useRef(1);
  const winch = useRef(0); // hover-time accumulator for a pickup
  const [, redraw] = useState(0);

  const spawnHostages = () => {
    const n = 3 + round.current;
    hostages.current = Array.from(
      { length: n },
      (_, i) => W * 0.55 + (i * W * 0.4) / n + Math.random() * 12
    );
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    round.current = 1;
    aboard.current = 0;
    rescued.current = 0;
    flak.current = [];
    flakCd.current = 2;
    pos.current = { x: W * 0.2, y: H * 0.3 };
    api.setScore(0);
    api.setLives(3);
    spawnHostages();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  useGameLoop(api.running, (dt) => {
    const p = pos.current;
    const sp = W * 0.5;
    if (held.current.left) p.x -= sp * dt;
    if (held.current.right) p.x += sp * dt;
    if (held.current.up) p.y -= sp * 0.8 * dt;
    if (held.current.down) p.y += sp * 0.8 * dt;
    p.x = Math.max(CH / 2, Math.min(W - CH / 2, p.x));
    p.y = Math.max(CH / 2, Math.min(GROUND - CH / 2, p.y));

    // Winch: hover low over a hostage to bring them aboard.
    const low = p.y > GROUND - CH * 1.6;
    let picked = -1;
    if (low && aboard.current < SEATS) {
      picked = hostages.current.findIndex((hx) => Math.abs(hx - p.x) < CH * 0.7);
    }
    if (picked >= 0) {
      winch.current += dt;
      if (winch.current > 0.5) {
        winch.current = 0;
        hostages.current.splice(picked, 1);
        aboard.current += 1;
        playSfx('point');
        haptic.medium();
      }
    } else {
      winch.current = 0;
    }

    // Drop-off: touch down on the pad with passengers.
    if (aboard.current > 0 && Math.abs(p.x - PAD_X) < CH && p.y > GROUND - CH * 1.2) {
      score.current += aboard.current * 100 + (aboard.current === SEATS ? 250 : 0);
      rescued.current += aboard.current;
      aboard.current = 0;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
    }

    // Round complete: everyone rescued.
    if (hostages.current.length === 0 && aboard.current === 0) {
      round.current += 1;
      score.current += 300;
      api.setScore(score.current);
      playSfx('powerUp');
      spawnHostages();
    }

    // Turret flak, aimed with a lead on the chopper.
    flakCd.current -= dt;
    if (flakCd.current <= 0) {
      const tx = W * 0.45;
      const dx = p.x - tx;
      const dy = p.y - GROUND;
      const d = Math.hypot(dx, dy) || 1;
      const fsp = H * (0.32 + round.current * 0.04);
      flak.current.push({ x: tx, y: GROUND - 14, vx: (dx / d) * fsp, vy: (dy / d) * fsp });
      flakCd.current = Math.max(0.7, 1.8 - round.current * 0.15);
      playSfx('shoot');
    }
    for (const f of flak.current) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    flak.current = flak.current.filter((f) => f.x > -20 && f.x < W + 20 && f.y > -20 && f.y < H + 20);

    // Flak vs chopper.
    for (const f of flak.current) {
      if (Math.abs(f.x - p.x) < CH * 0.5 && Math.abs(f.y - p.y) < CH * 0.4) {
        f.x = -9999;
        lives.current -= 1;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
        pos.current = { x: W * 0.2, y: H * 0.3 };
      }
    }
    flak.current = flak.current.filter((f) => f.x > -999);
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View pointerEvents="none" style={{ flex: 1 }}>
          {/* Sky + ground */}
          <View style={{ position: 'absolute', top: GROUND, width: W, height: H - GROUND, backgroundColor: '#26331c', borderTopWidth: 2, borderColor: '#3f7d2c' }} />
          {/* Landing pad */}
          <View style={{ position: 'absolute', left: PAD_X - 34, top: GROUND - 6, width: 68, height: 8, backgroundColor: colors.neonCyan, borderRadius: 2 }} />
          {/* Turret */}
          <Image source={ACTORS.cannon} style={{ position: 'absolute', left: W * 0.45 - 18, top: GROUND - 34, width: 36, height: 36 }} />
          {/* Hostages: tiny waving figures */}
          {hostages.current.map((hx, i) => (
            <View key={i} style={{ position: 'absolute', left: hx - 6, top: GROUND - 22 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#ffcf9e' }} />
              <View style={{ width: 10, height: 10, marginLeft: 1, backgroundColor: colors.neonYellow }} />
            </View>
          ))}
          {/* Flak */}
          {flak.current.map((f, i) => (
            <View key={i} style={{ position: 'absolute', left: f.x - 3, top: f.y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.neonRed }} />
          ))}
          {/* Chopper (flips to face travel direction) */}
          <Image
            source={ACTORS.chopper}
            style={{
              position: 'absolute',
              left: pos.current.x - CH / 2,
              top: pos.current.y - CH / 2,
              width: CH,
              height: CH,
              transform: [{ scaleX: held.current.left ? -1 : 1 }],
            }}
          />
          {/* Seat indicator */}
          <View style={{ position: 'absolute', top: 8, right: 12, flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: SEATS }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 2,
                  borderColor: colors.neonCyan,
                  backgroundColor: i < aboard.current ? colors.neonCyan : 'transparent',
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <DPad
        onDown={(k) => {
          held.current[k as keyof typeof held.current] = true;
        }}
        onUp={(k) => {
          held.current[k as keyof typeof held.current] = false;
        }}
      />
    </View>
  );
}
