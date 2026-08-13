import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Minesweeper mechanics with a séance theme: 9×9 board hiding 10 ghosts.
 * Tap to reveal, long-press to plant a ward (flag). Faithful rules: the
 * first tap is always safe (ghosts relocate), zero-cells flood open, the
 * classic number colors mark neighbor counts. Reveal every safe cell to
 * banish the haunting. No timer — deduction at your own pace.
 */
const N = 9;
const GHOSTS = 10;

const NUM_COLORS = [
  '',
  '#3c6cff', // 1 blue
  '#39ff14', // 2 green
  '#ff3b3b', // 3 red
  '#b14aed', // 4 purple
  '#ff9f1c', // 5
  '#00fff7', // 6
  '#ffe600', // 7
  '#ffffff', // 8
];

interface Cell {
  ghost: boolean;
  state: 'hidden' | 'open' | 'flag';
  count: number;
}

export function GhostSweeperGame({ api }: { api: GameApi }) {
  const [cells, setCells] = useState<Cell[]>([]);
  const firstTap = useRef(true);
  const doneRef = useRef(false);

  const blank = () =>
    Array.from({ length: N * N }, () => ({ ghost: false, state: 'hidden' as const, count: 0 }));

  useEffect(() => {
    setCells(blank());
    firstTap.current = true;
    doneRef.current = false;
    api.setScore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const neighbors = (i: number): number[] => {
    const x = i % N;
    const y = Math.floor(i / N);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
      }
    }
    return out;
  };

  const plant = (board: Cell[], safe: number) => {
    // First-tap-safe: never a ghost on the tapped cell or its neighbors.
    const forbidden = new Set([safe, ...neighbors(safe)]);
    let placed = 0;
    while (placed < GHOSTS) {
      const i = Math.floor(Math.random() * N * N);
      if (!board[i].ghost && !forbidden.has(i)) {
        board[i].ghost = true;
        placed += 1;
      }
    }
    for (let i = 0; i < N * N; i++) {
      board[i].count = neighbors(i).filter((n) => board[n].ghost).length;
    }
  };

  const reveal = (i: number) => {
    if (!api.running || doneRef.current) return;
    setCells((prev) => {
      const b = prev.map((c) => ({ ...c }));
      if (firstTap.current) {
        plant(b, i);
        firstTap.current = false;
      }
      const cell = b[i];
      if (cell.state !== 'hidden') return prev;

      if (cell.ghost) {
        doneRef.current = true;
        b.forEach((c) => {
          if (c.ghost) c.state = 'open';
        });
        playSfx('explode');
        haptic.heavy();
        const opened = b.filter((c) => c.state === 'open' && !c.ghost).length;
        api.end({ score: opened * 10 });
        return b;
      }

      // Flood-open zero regions like the original.
      const stack = [i];
      while (stack.length > 0) {
        const idx = stack.pop()!;
        const c = b[idx];
        if (c.state === 'open' || c.ghost) continue;
        c.state = 'open';
        if (c.count === 0) {
          for (const n of neighbors(idx)) {
            if (b[n].state === 'hidden') stack.push(n);
          }
        }
      }
      playSfx('flip');
      haptic.light();

      const opened = b.filter((c) => c.state === 'open').length;
      api.setScore(opened * 10);
      if (opened === N * N - GHOSTS) {
        doneRef.current = true;
        api.end({ score: opened * 10 + 100, won: true });
      }
      return b;
    });
  };

  const toggleFlag = (i: number) => {
    if (!api.running || doneRef.current || firstTap.current) return;
    setCells((prev) => {
      const b = prev.map((c) => ({ ...c }));
      if (b[i].state === 'hidden') b[i].state = 'flag';
      else if (b[i].state === 'flag') b[i].state = 'hidden';
      else return prev;
      playSfx('select');
      haptic.medium();
      return b;
    });
  };

  const cell = Math.floor(Math.min(api.width - 16, api.height - 16) / N);
  const flags = cells.filter((c) => c.state === 'flag').length;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size="label" color={colors.neonPurple} style={{ marginBottom: 8 }}>
        {`👻 ${GHOSTS - flags}`}
      </PixelText>
      <View style={{ width: cell * N, height: cell * N }}>
        {cells.map((c, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            onPress={() => reveal(i)}
            onLongPress={() => toggleFlag(i)}
            delayLongPress={350}
            style={{
              position: 'absolute',
              left: (i % N) * cell,
              top: Math.floor(i / N) * cell,
              width: cell - 2,
              height: cell - 2,
              backgroundColor:
                c.state === 'open' ? (c.ghost ? '#3a1040' : colors.bgRaised) : colors.bgCard,
              borderWidth: 1,
              borderColor: c.state === 'open' ? colors.border : '#3a3a5e',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {c.state === 'flag' && <PixelText size={cell * 0.5}>⚑</PixelText>}
            {c.state === 'open' && c.ghost && <PixelText size={cell * 0.5}>👻</PixelText>}
            {c.state === 'open' && !c.ghost && c.count > 0 && (
              <PixelText size={cell * 0.45} color={NUM_COLORS[c.count]} style={{ fontWeight: 'bold' }}>
                {String(c.count)}
              </PixelText>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
