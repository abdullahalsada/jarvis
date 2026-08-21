import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Monster match-3: swap two neighboring monsters to line up three or more
 * of a kind — they pop, the grid tumbles down, and chain reactions rack up
 * multipliers. You have 30 moves; big cascades and 4+ matches earn extra.
 * Tap one monster, then a neighbor (or tap the same one to cancel).
 */
const COLS = 7;
const ROWS = 8;
const KINDS = 5;

const MONSTER_COLORS = [
  { body: '#b14aed', eye: '#ffffff' }, // grape ghoul
  { body: '#39ff14', eye: '#101018' }, // slime
  { body: '#ff9f1c', eye: '#101018' }, // pumpkin imp
  { body: '#00fff7', eye: '#101018' }, // frost sprite
  { body: '#ff3b3b', eye: '#ffffff' }, // lava bat
];

export function MonsterMatchGame({ api }: { api: GameApi }) {
  const [grid, setGrid] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [popping, setPopping] = useState<Set<number>>(new Set());
  const moves = useRef(30);
  const score = useRef(0);
  const busy = useRef(false);
  const doneRef = useRef(false);

  const randomTile = () => Math.floor(Math.random() * KINDS);

  const matchesOf = (g: number[]): Set<number> => {
    const out = new Set<number>();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const v = g[i];
        if (v < 0) continue;
        if (c + 2 < COLS && g[i + 1] === v && g[i + 2] === v) {
          out.add(i);
          out.add(i + 1);
          out.add(i + 2);
        }
        if (r + 2 < ROWS && g[i + COLS] === v && g[i + 2 * COLS] === v) {
          out.add(i);
          out.add(i + COLS);
          out.add(i + 2 * COLS);
        }
      }
    }
    return out;
  };

  const freshGrid = (): number[] => {
    let g: number[];
    do {
      g = Array.from({ length: COLS * ROWS }, randomTile);
    } while (matchesOf(g).size > 0);
    return g;
  };

  useEffect(() => {
    moves.current = 30;
    score.current = 0;
    busy.current = false;
    doneRef.current = false;
    api.setScore(0);
    setGrid(freshGrid());
    setSelected(null);
    setPopping(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Pop matches, collapse, refill, repeat — with a beat between steps. */
  const resolve = (g: number[], chain: number) => {
    const m = matchesOf(g);
    if (m.size === 0) {
      busy.current = false;
      if (moves.current <= 0 && !doneRef.current) {
        doneRef.current = true;
        setTimeout(() => api.end({ score: score.current }), 500);
      }
      return;
    }
    const gained = m.size * 10 * chain + (m.size > 3 ? (m.size - 3) * 20 : 0);
    score.current += gained;
    api.setScore(score.current);
    playSfx(chain > 1 ? 'match' : 'point');
    if (chain > 1) haptic.medium();
    setPopping(new Set(m));
    setTimeout(() => {
      const next = [...g];
      for (const i of m) next[i] = -1;
      // Collapse columns.
      for (let c = 0; c < COLS; c++) {
        let write = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          const v = next[r * COLS + c];
          if (v >= 0) {
            next[write * COLS + c] = v;
            write--;
          }
        }
        for (let r = write; r >= 0; r--) next[r * COLS + c] = randomTile();
      }
      setPopping(new Set());
      setGrid(next);
      setTimeout(() => resolve(next, chain + 1), 160);
    }, 240);
  };

  const tap = (i: number) => {
    if (!api.running || busy.current || doneRef.current) return;
    if (selected === null) {
      setSelected(i);
      playSfx('select');
      return;
    }
    if (selected === i) {
      setSelected(null);
      return;
    }
    const r1 = Math.floor(selected / COLS);
    const c1 = selected % COLS;
    const r2 = Math.floor(i / COLS);
    const c2 = i % COLS;
    const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    if (!adjacent) {
      setSelected(i);
      playSfx('select');
      return;
    }
    const g = [...grid];
    [g[selected], g[i]] = [g[i], g[selected]];
    setSelected(null);
    if (matchesOf(g).size === 0) {
      // Illegal swap: shake it back.
      playSfx('wrong');
      haptic.light();
      return;
    }
    moves.current -= 1;
    busy.current = true;
    setGrid(g);
    setTimeout(() => resolve(g, 1), 120);
  };

  const cell = Math.floor(Math.min((api.width - 20) / COLS, (api.height - 120) / ROWS));
  const bw = COLS * cell;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size={11} color={moves.current <= 5 ? colors.neonRed : colors.textDim} style={{ marginBottom: 8 }}>
        {`↔ ${Math.max(0, moves.current)}`}
      </PixelText>
      <View style={{ width: bw, height: ROWS * cell, backgroundColor: '#141024', borderWidth: 2, borderColor: '#2a2a45', borderRadius: 8 }}>
        {grid.map((v, i) => {
          if (v < 0) return null;
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          const m = MONSTER_COLORS[v];
          const pop = popping.has(i);
          const sel = selected === i;
          const size = cell - 6;
          return (
            <Pressable
              key={i}
              onPress={() => tap(i)}
              style={{
                position: 'absolute',
                left: c * cell + 3,
                top: r * cell + 3,
                width: size,
                height: size,
              }}>
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size * 0.3,
                  backgroundColor: m.body,
                  opacity: pop ? 0.25 : 1,
                  borderWidth: sel ? 3 : 0,
                  borderColor: colors.neonYellow,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pop ? 1.15 : sel ? 1.05 : 1 }],
                }}>
                {/* Simple monster face: two eyes + jagged mouth */}
                <View style={{ flexDirection: 'row', gap: size * 0.16, marginBottom: size * 0.08 }}>
                  <View style={{ width: size * 0.18, height: size * 0.22, borderRadius: size * 0.09, backgroundColor: m.eye }} />
                  <View style={{ width: size * 0.18, height: size * 0.22, borderRadius: size * 0.09, backgroundColor: m.eye }} />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {[0, 1, 2].map((t) => (
                    <View
                      key={t}
                      style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: size * 0.09,
                        borderRightWidth: size * 0.09,
                        borderTopWidth: size * 0.14,
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderTopColor: m.eye,
                      }}
                    />
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
