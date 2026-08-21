import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideXY } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Fruit-slicing frenzy: fruit arcs up from the bottom — swipe through it to
 * slice. Chain several in one swipe for combo bonuses. Don't slice the
 * bombs, and don't let fruit fall: three drops end the game. Waves come
 * thicker and faster as the score climbs.
 */
const FRUITS = [
  { color: '#ff5a5a', shine: '#ff9d9d', r: 26 }, // apple
  { color: '#ffb830', shine: '#ffd98a', r: 28 }, // orange
  { color: '#8ee53f', shine: '#c4f79a', r: 24 }, // lime
  { color: '#b14aed', shine: '#d79af7', r: 30 }, // plum
  { color: '#ffe600', shine: '#fff59a', r: 27 }, // lemon
];

interface Item {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number; // index into FRUITS, or -1 for a bomb
  sliced: boolean;
  /** Post-slice halves fly apart briefly for the visual pop. */
  fade: number;
}

export function FruitSliceGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;

  const items = useRef<Item[]>([]);
  const nextId = useRef(1);
  const spawnCd = useRef(1);
  const blade = useRef<{ x: number; y: number; t: number }[]>([]);
  const combo = useRef(0);
  const comboCd = useRef(0);
  const drops = useRef(0);
  const score = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    items.current = [];
    blade.current = [];
    spawnCd.current = 0.8;
    drops.current = 0;
    score.current = 0;
    combo.current = 0;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideXY((x, y) => {
    if (!api.running) return;
    const now = Date.now();
    blade.current.push({ x, y, t: now });
    if (blade.current.length > 12) blade.current.shift();

    // Slice check: the segment from the previous point to this one.
    const prev = blade.current[blade.current.length - 2];
    if (!prev) return;
    for (const it of items.current) {
      if (it.sliced) continue;
      const r = it.kind < 0 ? 24 : FRUITS[it.kind].r;
      // Distance from the item's center to the swipe segment.
      const dx = x - prev.x;
      const dy = y - prev.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((it.x - prev.x) * dx + (it.y - prev.y) * dy) / len2));
      const px = prev.x + t * dx;
      const py = prev.y + t * dy;
      const d2 = (it.x - px) ** 2 + (it.y - py) ** 2;
      if (d2 < r * r && len2 > 100) {
        it.sliced = true;
        it.fade = 0.4;
        if (it.kind < 0) {
          // Bomb!
          playSfx('explode');
          haptic.heavy();
          drops.current += 1;
          api.setLives(3 - drops.current);
          if (drops.current >= 3) {
            api.end({ score: score.current });
            return;
          }
        } else {
          combo.current += 1;
          comboCd.current = 0.5;
          const bonus = combo.current >= 3 ? combo.current * 5 : 0;
          score.current += 10 + bonus;
          api.setScore(score.current);
          playSfx(combo.current >= 3 ? 'match' : 'point');
          haptic.light();
        }
      }
    }
  });

  useGameLoop(api.running, (dt) => {
    // Combo window decays when the finger rests.
    comboCd.current -= dt;
    if (comboCd.current <= 0) combo.current = 0;
    const now = Date.now();
    blade.current = blade.current.filter((p) => now - p.t < 160);

    // Launch fruit in bursts.
    spawnCd.current -= dt;
    if (spawnCd.current <= 0) {
      const difficulty = Math.min(1, score.current / 600);
      const count = 1 + Math.floor(Math.random() * (2 + difficulty * 2));
      for (let i = 0; i < count; i++) {
        const isBomb = Math.random() < 0.12 + difficulty * 0.08;
        const x = W * (0.15 + Math.random() * 0.7);
        items.current.push({
          id: nextId.current++,
          x,
          y: H + 30,
          vx: (W / 2 - x) * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * W * 0.2,
          vy: -H * (0.95 + Math.random() * 0.25),
          kind: isBomb ? -1 : Math.floor(Math.random() * FRUITS.length),
          sliced: false,
          fade: 0,
        });
      }
      spawnCd.current = Math.max(0.55, 1.4 - difficulty * 0.7);
      playSfx('bounce');
    }

    // Gravity arcs.
    for (const it of items.current) {
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.vy += H * 0.85 * dt;
      if (it.fade > 0) it.fade -= dt;
    }

    // Fruit that falls back off-screen unsliced = a drop.
    for (const it of items.current) {
      if (!it.sliced && it.kind >= 0 && it.y > H + 40 && it.vy > 0) {
        it.sliced = true; // consume so it only counts once
        it.fade = 0;
        drops.current += 1;
        api.setLives(3 - drops.current);
        playSfx('loseLife');
        haptic.medium();
        if (drops.current >= 3) {
          api.end({ score: score.current });
          return;
        }
      }
    }
    items.current = items.current.filter((it) => (it.y < H + 60 || it.vy < 0) && it.fade >= 0);
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {items.current.map((it) => {
          const r = it.kind < 0 ? 24 : FRUITS[it.kind].r;
          if (it.sliced && it.kind >= 0) {
            // Two halves drifting apart.
            if (it.fade <= 0) return null;
            const f = FRUITS[it.kind];
            const gap = (0.4 - it.fade) * 90;
            return (
              <React.Fragment key={it.id}>
                <View style={{ position: 'absolute', left: it.x - r - gap, top: it.y - r / 2, width: r, height: r, borderTopLeftRadius: r, borderBottomLeftRadius: r, backgroundColor: f.color, opacity: it.fade * 2.5 }} />
                <View style={{ position: 'absolute', left: it.x + gap, top: it.y - r / 2, width: r, height: r, borderTopRightRadius: r, borderBottomRightRadius: r, backgroundColor: f.color, opacity: it.fade * 2.5 }} />
              </React.Fragment>
            );
          }
          if (it.sliced && it.kind < 0) {
            if (it.fade <= 0) return null;
            return (
              <View key={it.id} style={{ position: 'absolute', left: it.x - 34, top: it.y - 34, width: 68, height: 68, borderRadius: 34, backgroundColor: colors.neonYellow, opacity: it.fade * 2 }} />
            );
          }
          if (it.kind < 0) {
            return (
              <View key={it.id} style={{ position: 'absolute', left: it.x - r, top: it.y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#16161f', borderWidth: 2, borderColor: colors.neonRed, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', top: -8, width: 4, height: 10, backgroundColor: colors.neonYellow }} />
                <View style={{ width: r * 0.7, height: r * 0.7, borderRadius: r * 0.35, backgroundColor: '#000' }} />
              </View>
            );
          }
          const f = FRUITS[it.kind];
          return (
            <View key={it.id} style={{ position: 'absolute', left: it.x - r, top: it.y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: f.color }}>
              <View style={{ position: 'absolute', left: r * 0.45, top: r * 0.35, width: r * 0.5, height: r * 0.5, borderRadius: r * 0.25, backgroundColor: f.shine, opacity: 0.8 }} />
              <View style={{ position: 'absolute', left: r - 3, top: -6, width: 6, height: 10, borderRadius: 3, backgroundColor: '#2b7d2c' }} />
            </View>
          );
        })}
        {/* Blade trail */}
        {blade.current.map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 5,
              top: p.y - 5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.neonCyan,
              opacity: (i + 1) / blade.current.length,
            }}
          />
        ))}
      </View>
    </View>
  );
}
