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
 * Slingshot siege: drag the pumpkin back, release, and watch it arc into
 * the skeletons' bone forts. Bone blocks shatter and slow the pumpkin;
 * hit every skeleton to storm the next, tougher castle. Five pumpkins per
 * castle — spares carry bonus points.
 */
interface Block {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  broken: boolean;
}

interface Skeleton {
  id: number;
  x: number;
  y: number;
  down: boolean;
}

export function PumpkinTossGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GROUND = H - 60;
  const SLING = { x: W * 0.18, y: GROUND - 90 };
  const PR = 20; // pumpkin radius

  const blocks = useRef<Block[]>([]);
  const skeletons = useRef<Skeleton[]>([]);
  const nextId = useRef(1);
  const pumpkin = useRef({ x: SLING.x, y: SLING.y, vx: 0, vy: 0, flying: false });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pumpkinsLeft = useRef(5);
  const castle = useRef(1);
  const score = useRef(0);
  const settleT = useRef(0);
  const [, redraw] = useState(0);

  const buildCastle = () => {
    blocks.current = [];
    skeletons.current = [];
    const baseX = W * 0.62;
    const bw = 46;
    const bh = 18;
    const towers = Math.min(3, 1 + Math.floor((castle.current - 1) / 2));
    for (let t = 0; t < towers; t++) {
      const tx = baseX + t * (bw + 34);
      const floors = 2 + Math.min(3, castle.current - 1) - (t % 2);
      for (let f = 0; f < Math.max(1, floors); f++) {
        blocks.current.push({ id: nextId.current++, x: tx, y: GROUND - bh / 2 - f * (bh + 40), w: bw, h: bh, broken: false });
        if (f < Math.max(1, floors)) {
          skeletons.current.push({ id: nextId.current++, x: tx, y: GROUND - bh - 20 - f * (bh + 40), down: false });
        }
      }
    }
    pumpkinsLeft.current = 5;
    resetPumpkin();
  };

  const resetPumpkin = () => {
    pumpkin.current = { x: SLING.x, y: SLING.y, vx: 0, vy: 0, flying: false };
    drag.current = null;
  };

  useEffect(() => {
    score.current = 0;
    castle.current = 1;
    nextId.current = 1;
    api.setScore(0);
    buildCastle();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Fired on finger-up: turn the pull into velocity. */
  const launch = () => {
    const d = drag.current;
    if (!api.running || !d || pumpkin.current.flying) return;
    const dx = SLING.x - d.x;
    const dy = SLING.y - d.y;
    if (Math.hypot(dx, dy) < 14) {
      resetPumpkin();
      return;
    }
    pumpkin.current.flying = true;
    pumpkin.current.vx = dx * 7.5;
    pumpkin.current.vy = dy * 7.5;
    pumpkinsLeft.current -= 1;
    drag.current = null;
    playSfx('shoot');
    haptic.medium();
  };
  const launchRef = useRef(launch);
  launchRef.current = launch;
  const dragTo = (x: number, y: number) => {
    if (!api.running || pumpkin.current.flying) return;
    // Pull vector from the sling to the finger, clamped to a comfy radius.
    const dx = x - SLING.x;
    const dy = y - SLING.y;
    const d = Math.hypot(dx, dy);
    const max = 110;
    const k = d > max ? max / d : 1;
    drag.current = { x: SLING.x + dx * k, y: SLING.y + dy * k };
    pumpkin.current.x = drag.current.x;
    pumpkin.current.y = drag.current.y;
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
    const p = pumpkin.current;
    if (p.flying) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += H * 0.75 * dt;

      // Blocks shatter and brake the pumpkin.
      for (const b of blocks.current) {
        if (b.broken) continue;
        if (Math.abs(p.x - b.x) < b.w / 2 + PR * 0.7 && Math.abs(p.y - b.y) < b.h / 2 + PR * 0.7) {
          b.broken = true;
          p.vx *= 0.55;
          p.vy *= 0.6;
          score.current += 15;
          api.setScore(score.current);
          playSfx('brick');
          haptic.light();
        }
      }
      // Skeletons go down on contact.
      for (const s of skeletons.current) {
        if (s.down) continue;
        if (Math.abs(p.x - s.x) < PR + 20 && Math.abs(p.y - s.y) < PR + 24) {
          s.down = true;
          score.current += 100 * castle.current;
          api.setScore(score.current);
          playSfx('explode');
          haptic.medium();
        }
      }

      // Grounded or gone: next pumpkin (or castle cleared / out of ammo).
      if (p.y > GROUND - PR || p.x > W + PR * 2 || p.x < -PR * 2) {
        settleT.current += dt;
        if (settleT.current > 0.35) {
          settleT.current = 0;
          if (skeletons.current.every((s) => s.down)) {
            score.current += 200 + pumpkinsLeft.current * 50;
            api.setScore(score.current);
            castle.current += 1;
            playSfx('win');
            haptic.success();
            buildCastle();
          } else if (pumpkinsLeft.current <= 0) {
            api.end({ score: score.current });
            return;
          } else {
            resetPumpkin();
          }
        }
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Dusk sky + ground */}
        <View style={{ position: 'absolute', right: 22, top: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffb830', opacity: 0.7 }} />
        <View style={{ position: 'absolute', top: GROUND, width: W, height: H - GROUND, backgroundColor: '#1c1430', borderTopWidth: 2, borderColor: '#2f2450' }} />
        {/* Sling post */}
        <View style={{ position: 'absolute', left: SLING.x - 5, top: SLING.y, width: 10, height: GROUND - SLING.y, backgroundColor: '#5e3d1c' }} />
        <View style={{ position: 'absolute', left: SLING.x - 22, top: SLING.y - 8, width: 44, height: 10, borderRadius: 5, backgroundColor: '#8a5a2b' }} />
        {/* Band while dragging */}
        {drag.current && (
          <View
            style={{
              position: 'absolute',
              left: Math.min(SLING.x, drag.current.x),
              top: Math.min(SLING.y, drag.current.y),
              width: Math.abs(drag.current.x - SLING.x) || 2,
              height: Math.abs(drag.current.y - SLING.y) || 2,
              borderWidth: 1,
              borderColor: colors.neonYellow,
              opacity: 0.6,
            }}
          />
        )}
        {/* Castle */}
        {blocks.current.map((b) =>
          b.broken ? null : (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                left: b.x - b.w / 2,
                top: b.y - b.h / 2,
                width: b.w,
                height: b.h,
                backgroundColor: '#e8e8f0',
                borderWidth: 2,
                borderColor: '#9a9ab5',
                borderRadius: 4,
              }}
            />
          )
        )}
        {skeletons.current.map((s) => (
          <Image
            key={s.id}
            source={ACTORS.skeleton}
            style={{
              position: 'absolute',
              left: s.x - 22,
              top: s.y - 40,
              width: 44,
              height: 44,
              opacity: s.down ? 0.15 : 1,
              transform: [{ rotate: s.down ? '90deg' : '0deg' }],
            }}
          />
        ))}
        {/* The pumpkin */}
        <Image
          source={ACTORS.pumpkin}
          style={{
            position: 'absolute',
            left: pumpkin.current.x - PR,
            top: pumpkin.current.y - PR,
            width: PR * 2,
            height: PR * 2,
          }}
        />
        {/* Ammo */}
        <View style={{ position: 'absolute', bottom: 14, left: 14, flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: Math.max(0, pumpkinsLeft.current) }, (_, i) => (
            <Image key={i} source={ACTORS.pumpkin} style={{ width: 18, height: 18 }} />
          ))}
          <PixelText size={11} color={colors.textDim} style={{ marginLeft: 10, alignSelf: 'center' }}>
            {`🏰 ${castle.current}`}
          </PixelText>
        </View>
      </View>
    </View>
  );
}
