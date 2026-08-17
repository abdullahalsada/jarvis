import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors, spacing } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useSwipe, type Dir } from '../engine/controls';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * 2048-style sliding merge puzzle: swipe to slide all tiles, equal neighbors
 * fuse (each merge scores the fused value), a 2 (90%) or 4 (10%) spawns after
 * every move. No clock, no lives — the calm brain-game of the set. Reaching
 * 2048 flashes a win but play continues; game ends when no move is possible.
 */
const N = 4;

const TILE_COLORS: Record<number, string> = {
  2: '#2a2a45',
  4: '#33335c',
  8: '#b14aed',
  16: '#ff2079',
  32: '#ff9f1c',
  64: '#ff3b3b',
  128: '#ffe600',
  256: '#39ff14',
  512: '#00fff7',
  1024: '#3c6cff',
  2048: '#ffffff',
};

export function TileFusionGame({ api }: { api: GameApi }) {
  const [board, setBoard] = useState<number[]>(Array(N * N).fill(0));
  const score = useRef(0);
  const celebrated = useRef(false);
  const [flash, setFlash] = useState(false);

  const addTile = (b: number[]) => {
    const empty = b.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    if (empty.length === 0) return;
    b[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  };

  useEffect(() => {
    const b = Array(N * N).fill(0);
    addTile(b);
    addTile(b);
    setBoard(b);
    score.current = 0;
    celebrated.current = false;
    api.setScore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Slides one row of values toward index 0, merging pairs once. */
  const slideRow = (row: number[]): { row: number[]; gained: number } => {
    const vals = row.filter((v) => v !== 0);
    const out: number[] = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        gained += vals[i] * 2;
        i += 1;
      } else {
        out.push(vals[i]);
      }
    }
    while (out.length < N) out.push(0);
    return { row: out, gained };
  };

  const linesFor = (dir: Dir): number[][] => {
    const lines: number[][] = [];
    for (let i = 0; i < N; i++) {
      const line: number[] = [];
      for (let j = 0; j < N; j++) {
        switch (dir) {
          case 'left': line.push(i * N + j); break;
          case 'right': line.push(i * N + (N - 1 - j)); break;
          case 'up': line.push(j * N + i); break;
          case 'down': line.push((N - 1 - j) * N + i); break;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const canMove = (b: number[]): boolean => {
    if (b.some((v) => v === 0)) return true;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = b[i * N + j];
        if (j + 1 < N && b[i * N + j + 1] === v) return true;
        if (i + 1 < N && b[(i + 1) * N + j] === v) return true;
      }
    }
    return false;
  };

  const pan = useSwipe((dir) => {
    if (!api.running) return;
    setBoard((prev) => {
      const b = [...prev];
      let changed = false;
      let gained = 0;
      for (const line of linesFor(dir)) {
        const { row, gained: g } = slideRow(line.map((idx) => b[idx]));
        gained += g;
        line.forEach((idx, j) => {
          if (b[idx] !== row[j]) changed = true;
          b[idx] = row[j];
        });
      }
      if (!changed) return prev;

      addTile(b);
      if (gained > 0) {
        score.current += gained;
        api.setScore(score.current);
        playSfx('match');
        haptic.light();
      } else {
        playSfx('flip');
      }
      if (!celebrated.current && b.some((v) => v >= 2048)) {
        celebrated.current = true;
        playSfx('win');
        haptic.success();
        setFlash(true);
        setTimeout(() => setFlash(false), 1500);
      }
      if (!canMove(b)) {
        setTimeout(() => api.end({ score: score.current }), 400);
      }
      return b;
    });
  });

  const size = Math.min(api.width - spacing.l * 2, api.height - spacing.l * 2);
  const cell = Math.floor(size / N);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
      <View
        pointerEvents="none"
        style={{
          width: cell * N + 8,
          height: cell * N + 8,
          padding: 4,
          borderWidth: 2,
          borderColor: flash ? colors.neonGreen : colors.border,
          backgroundColor: colors.bgRaised,
        }}>
        {board.map((v, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: 4 + (i % N) * cell,
              top: 4 + Math.floor(i / N) * cell,
              width: cell - 6,
              height: cell - 6,
              margin: 3,
              borderRadius: 4,
              backgroundColor: v === 0 ? colors.bgCard : TILE_COLORS[v] ?? '#ffffff',
              borderTopWidth: v === 0 ? 0 : 2,
              borderLeftWidth: v === 0 ? 0 : 2,
              borderBottomWidth: v === 0 ? 0 : 2,
              borderRightWidth: v === 0 ? 0 : 2,
              borderTopColor: 'rgba(255,255,255,0.45)',
              borderLeftColor: 'rgba(255,255,255,0.25)',
              borderBottomColor: 'rgba(0,0,0,0.4)',
              borderRightColor: 'rgba(0,0,0,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {v > 0 && (
              <PixelText
                size={v >= 1024 ? cell * 0.28 : v >= 128 ? cell * 0.34 : cell * 0.4}
                color={v <= 4 ? colors.text : colors.bg}
                style={{ fontWeight: 'bold' }}>
                {String(v)}
              </PixelText>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
