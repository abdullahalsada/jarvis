import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * The classic 15-puzzle: slide numbered tiles into order using the one empty
 * space. Tapping any tile in the gap's row or column slides the whole run —
 * the physical-puzzle feel. Boards are shuffled with random legal moves, so
 * every deal is solvable (a plain random layout is unsolvable half the time).
 * Score rewards economy of moves; there is no clock.
 */
const N = 4;

export function SlideFifteenGame({ api }: { api: GameApi }) {
  const [tiles, setTiles] = useState<number[]>([]); // 0 = the gap
  const [moves, setMoves] = useState(0);

  const shuffled = (): number[] => {
    const b = Array.from({ length: N * N }, (_, i) => (i + 1) % (N * N));
    // 300 random legal moves from solved — always solvable.
    let gap = N * N - 1;
    for (let i = 0; i < 300; i++) {
      const gx = gap % N;
      const gy = Math.floor(gap / N);
      const opts: number[] = [];
      if (gx > 0) opts.push(gap - 1);
      if (gx < N - 1) opts.push(gap + 1);
      if (gy > 0) opts.push(gap - N);
      if (gy < N - 1) opts.push(gap + N);
      const pick = opts[Math.floor(Math.random() * opts.length)];
      [b[gap], b[pick]] = [b[pick], b[gap]];
      gap = pick;
    }
    return b;
  };

  useEffect(() => {
    setTiles(shuffled());
    setMoves(0);
    api.setScore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const tap = (idx: number) => {
    if (!api.running) return;
    setTiles((prev) => {
      const gap = prev.indexOf(0);
      const gx = gap % N;
      const gy = Math.floor(gap / N);
      const tx = idx % N;
      const ty = Math.floor(idx / N);
      if (tx !== gx && ty !== gy) return prev; // not in the gap's row/column
      if (idx === gap) return prev;

      const b = [...prev];
      // Slide the whole run between the tapped tile and the gap.
      const step = tx === gx ? (ty < gy ? -N : N) : tx < gx ? -1 : 1;
      let cur = gap;
      while (cur !== idx) {
        b[cur] = b[cur - step];
        cur -= step;
      }
      b[idx] = 0;

      playSfx('flip');
      haptic.light();
      const m = moves + 1;
      setMoves(m);

      const solved = b.every((v, i) => v === (i + 1) % (N * N));
      if (solved) {
        // Par is ~80 moves for a full shuffle; generous curve, floor 100.
        const score = Math.max(100, 1000 - Math.max(0, m - 80) * 5);
        api.setScore(score);
        api.end({ score, won: true });
      }
      return b;
    });
  };

  const size = Math.floor(Math.min(api.width - spacing.l * 2, api.height - 80) / N);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size="label" color={colors.textDim} style={{ marginBottom: spacing.m }}>
        {`▲ ${moves}`}
      </PixelText>
      <View style={{ width: size * N + 8, height: size * N + 8, padding: 4, backgroundColor: colors.bgRaised, borderWidth: 2, borderColor: colors.border }}>
        {tiles.map((v, i) =>
          v === 0 ? null : (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={String(v)}
              onPressIn={() => tap(i)}
              style={{
                position: 'absolute',
                left: 4 + (i % N) * size,
                top: 4 + Math.floor(i / N) * size,
                width: size - 6,
                height: size - 6,
                margin: 3,
                borderRadius: 4,
                backgroundColor: v === i + 1 ? '#12351f' : colors.bgCard,
                borderWidth: 2,
                borderColor: v === i + 1 ? colors.neonGreen : colors.neonYellow,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <PixelText size={size * 0.4} color={v === i + 1 ? colors.neonGreen : colors.neonYellow} style={{ fontWeight: 'bold' }}>
                {String(v)}
              </PixelText>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}
