import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Carnival-style shooting gallery, midnight edition: three rows of spooks
 * glide across the gallery at different speeds and directions. Tap to
 * shoot — every tap costs a shell, hit or miss, so aim like it's 1980.
 * Back row scores most; the rare golden phantom is worth 100. The round
 * ends when the 25 shells run out; hitting a spook streak of 5 earns 3
 * bonus shells, the old carnival reward loop.
 */
const SHELLS = 25;
const ROW_SCORES = [40, 20, 10]; // back, middle, front

interface Target {
  row: number;
  x: number; // 0..1 across the row, wraps
  golden: boolean;
  size: number;
  alive: boolean;
  respawn: number;
}

export function SpookShootGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const rowY = (row: number) => H * (0.2 + row * 0.16);
  const rowSpeed = (row: number) => (row === 0 ? 0.16 : row === 1 ? -0.12 : 0.09); // fraction of W per s
  const TARGET = 40;

  const targets = useRef<Target[]>([]);
  const shells = useRef(SHELLS);
  const score = useRef(0);
  const streak = useRef(0);
  const flash = useRef(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    targets.current = [];
    for (let row = 0; row < 3; row++) {
      const count = 3 + row; // more targets in the nearer, cheaper rows
      for (let i = 0; i < count; i++) {
        targets.current.push({
          row,
          x: i / count,
          golden: false,
          size: TARGET + row * 6, // nearer rows are bigger (easier, cheaper)
          alive: true,
          respawn: 0,
        });
      }
    }
    // One golden phantom in the back row.
    targets.current.push({ row: 0, x: 0.5, golden: true, size: TARGET - 6, alive: true, respawn: 0 });
    shells.current = SHELLS;
    score.current = 0;
    streak.current = 0;
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  useGameLoop(api.running, (dt) => {
    for (const t of targets.current) {
      t.x = (((t.x + rowSpeed(t.row) * dt * (t.golden ? 1.6 : 1)) % 1) + 1) % 1;
      if (!t.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0) t.alive = true;
      }
    }
    if (flash.current > 0) flash.current -= dt;
    redraw((n) => n + 1);
  });

  const targetX = (t: Target) => t.x * (W + t.size * 2) - t.size;

  const shootAt = (x: number, y: number) => {
    if (!api.running || shells.current <= 0) return;
    shells.current -= 1;
    playSfx('shoot');
    flash.current = 0.08;

    let hit: Target | null = null;
    for (const t of targets.current) {
      if (!t.alive) continue;
      const tx = targetX(t) + t.size / 2;
      const ty = rowY(t.row) + t.size / 2;
      if (Math.abs(x - tx) < t.size * 0.7 && Math.abs(y - ty) < t.size * 0.7) {
        // Prefer the nearest (front-most) target under the tap.
        if (!hit || t.row > hit.row) hit = t;
      }
    }

    if (hit) {
      hit.alive = false;
      hit.respawn = 1.6 + Math.random() * 1.6;
      const gained = hit.golden ? 100 : ROW_SCORES[hit.row];
      score.current += gained;
      api.setScore(score.current);
      playSfx(hit.golden ? 'powerUp' : 'point');
      haptic.medium();
      streak.current += 1;
      if (streak.current % 5 === 0) {
        shells.current += 3; // carnival bonus shells
        playSfx('win');
        haptic.success();
      }
    } else {
      streak.current = 0;
      haptic.light();
    }

    if (shells.current <= 0) {
      setTimeout(() => api.end({ score: score.current }), 500);
    }
    redraw((n) => n + 1);
  };

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={(e) => shootAt(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      accessibilityRole="button">
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Gallery rows */}
        {[0, 1, 2].map((row) => (
          <View
            key={row}
            style={{
              position: 'absolute',
              top: rowY(row) + TARGET + row * 6,
              left: 0,
              right: 0,
              height: 3,
              backgroundColor: colors.border,
            }}
          />
        ))}
        {/* Targets */}
        {targets.current.map((t, i) => {
          if (!t.alive) return null;
          const size = t.size;
          // Gallery targets: bats up top, ghosts mid-row, zombies below;
          // the golden bonus target glows yellow.
          const source = t.row === 0 ? ACTORS.bat : t.row === 1 ? ACTORS.ghost_magenta : ACTORS.zombie;
          return (
            <Image
              key={i}
              source={source}
              style={{
                position: 'absolute',
                left: targetX(t),
                top: rowY(t.row),
                width: size,
                height: size,
                tintColor: t.golden ? colors.neonYellow : undefined,
              }}
            />
          );
        })}
        {/* Muzzle flash */}
        {flash.current > 0 && (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 4,
              backgroundColor: colors.neonYellow,
            }}
          />
        )}
        {/* Shell + streak readout */}
        <PixelText size={12} color={shells.current <= 5 ? colors.neonRed : colors.textDim} style={{ position: 'absolute', bottom: 12, left: 16 }}>
          {`▮ ${shells.current}`}
        </PixelText>
        {streak.current >= 2 && (
          <PixelText size={12} color={colors.neonYellow} style={{ position: 'absolute', bottom: 12, right: 16 }}>
            {`×${streak.current}`}
          </PixelText>
        )}
      </View>
    </Pressable>
  );
}
