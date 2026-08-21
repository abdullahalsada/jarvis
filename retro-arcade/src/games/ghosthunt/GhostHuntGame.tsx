import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideXY } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Duck Hunt-style ghost shooting: spirits drift across the graveyard in
 * wobbly flight — tap them before they escape off the far side! Each round
 * releases a pair and gives you limited shells. Ghosts that escape cost a
 * life; bats are fast and worth triple. Rounds get quicker and quicker.
 */
interface Spirit {
  id: number;
  x: number;
  y: number;
  vx: number;
  wobble: number;
  kind: 'ghost' | 'bat';
  hit: boolean;
  fade: number;
}

const SIZE = 54;

export function GhostHuntGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GROUND = H - 70;

  const spirits = useRef<Spirit[]>([]);
  const nextId = useRef(1);
  const shells = useRef(3);
  const round = useRef(0);
  const roundDelay = useRef(0.8);
  const lives = useRef(3);
  const score = useRef(0);
  const shotFlash = useRef<{ x: number; y: number; t: number } | null>(null);
  const [, redraw] = useState(0);

  const launchRound = () => {
    round.current += 1;
    shells.current = 3;
    const speed = W * (0.18 + Math.min(0.4, round.current * 0.02));
    const n = round.current >= 4 ? 2 : 2;
    for (let i = 0; i < n; i++) {
      const fromLeft = Math.random() < 0.5;
      const isBat = Math.random() < 0.2;
      spirits.current.push({
        id: nextId.current++,
        x: fromLeft ? -SIZE : W + SIZE,
        y: 80 + Math.random() * (GROUND - 200),
        vx: (fromLeft ? 1 : -1) * speed * (isBat ? 1.6 : 1) * (0.85 + Math.random() * 0.3),
        wobble: Math.random() * Math.PI * 2,
        kind: isBat ? 'bat' : 'ghost',
        hit: false,
        fade: 0,
      });
    }
  };

  useEffect(() => {
    spirits.current = [];
    round.current = 0;
    roundDelay.current = 0.8;
    lives.current = 3;
    score.current = 0;
    shotFlash.current = null;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  // Tap = fire a shell at that point.
  const pan = useSlideXY((x, y) => {
    if (!api.running) return;
    // Only the initial touch of a gesture counts as a shot; sliding doesn't
    // spray. useSlideXY reports moves too, so gate on a tiny cooldown.
    const now = Date.now();
    if (now - lastShot.current < 220) return;
    lastShot.current = now;
    if (shells.current <= 0) return;
    shells.current -= 1;
    shotFlash.current = { x, y, t: 0.15 };
    playSfx('shoot');
    let hitAny = false;
    for (const s of spirits.current) {
      if (s.hit) continue;
      if (Math.abs(s.x - x) < SIZE * 0.65 && Math.abs(s.y - y) < SIZE * 0.65) {
        s.hit = true;
        s.fade = 0.5;
        hitAny = true;
        score.current += (s.kind === 'bat' ? 30 : 10) * Math.max(1, Math.ceil(round.current / 3));
        api.setScore(score.current);
        playSfx('explode');
        haptic.medium();
        break;
      }
    }
    if (!hitAny) haptic.light();
  });
  const lastShot = useRef(0);

  useGameLoop(api.running, (dt) => {
    // Round pacing: when the sky is clear, wait a beat and release the next.
    const active = spirits.current.filter((s) => !s.hit);
    if (active.length === 0 && spirits.current.every((s) => s.fade <= 0)) {
      roundDelay.current -= dt;
      if (roundDelay.current <= 0) {
        launchRound();
        roundDelay.current = 0.9;
      }
    }

    for (const s of spirits.current) {
      if (s.hit) {
        s.fade -= dt;
        s.y += H * 0.6 * dt; // drop when hit, like the classic
        continue;
      }
      s.wobble += dt * 3.5;
      s.x += s.vx * dt;
      s.y += Math.sin(s.wobble) * 32 * dt;
      // Escaped off the far side.
      if ((s.vx > 0 && s.x > W + SIZE) || (s.vx < 0 && s.x < -SIZE)) {
        s.hit = true;
        s.fade = 0;
        lives.current -= 1;
        api.setLives(lives.current);
        playSfx('loseLife');
        haptic.heavy();
        if (lives.current <= 0) {
          api.end({ score: score.current });
          return;
        }
      }
      // Out of shells with spirits still flying: they get away faster.
      if (shells.current <= 0) s.vx *= 1 + dt * 0.9;
    }
    spirits.current = spirits.current.filter((s) => !s.hit || s.fade > 0);

    if (shotFlash.current) {
      shotFlash.current.t -= dt;
      if (shotFlash.current.t <= 0) shotFlash.current = null;
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Moonlit graveyard */}
        <View style={{ position: 'absolute', right: 24, top: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8e8f0', opacity: 0.9 }} />
        <View style={{ position: 'absolute', top: GROUND, width: W, height: H - GROUND, backgroundColor: '#161228', borderTopWidth: 2, borderColor: '#2a2a45' }} />
        {[0.15, 0.45, 0.8].map((f, i) => (
          <View key={i} style={{ position: 'absolute', left: W * f - 14, top: GROUND - 24, width: 28, height: 24, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: '#3a3a55' }} />
        ))}
        {/* Spirits */}
        {spirits.current.map((s) => (
          <Image
            key={s.id}
            source={s.kind === 'bat' ? ACTORS.bat : ACTORS.ghost_magenta}
            style={{
              position: 'absolute',
              left: s.x - SIZE / 2,
              top: s.y - SIZE / 2,
              width: SIZE,
              height: SIZE,
              opacity: s.hit ? Math.max(0, s.fade * 2) : 1,
              transform: [{ scaleX: s.vx > 0 ? 1 : -1 }, { rotate: s.hit ? '180deg' : '0deg' }],
            }}
          />
        ))}
        {/* Muzzle flash ring at the tap point */}
        {shotFlash.current && (
          <View
            style={{
              position: 'absolute',
              left: shotFlash.current.x - 22,
              top: shotFlash.current.y - 22,
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 3,
              borderColor: colors.neonYellow,
            }}
          />
        )}
        {/* Shell + round readout */}
        <View style={{ position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {Array.from({ length: shells.current }, (_, i) => (
            <View key={i} style={{ width: 10, height: 22, borderRadius: 3, backgroundColor: colors.neonRed, borderWidth: 1, borderColor: colors.neonYellow }} />
          ))}
          <PixelText size={11} color={colors.textDim} style={{ marginLeft: 12, alignSelf: 'center' }}>
            {`▸ ${round.current}`}
          </PixelText>
        </View>
      </View>
    </View>
  );
}
