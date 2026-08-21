import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Connect-Four-style drop duel vs the computer: tap a column, discs fall,
 * first to line up four wins the round. The AI blocks your threats and
 * builds its own — and it looks one move deeper every round you win.
 * Round wins are 100 × round; a draw refills the board. Lose and the
 * match is over.
 */
const COLS = 7;
const ROWS = 6;

type Disc = 0 | 1 | 2; // empty | player | AI

const lines = (() => {
  const out: number[][] = [];
  const idx = (r: number, c: number) => r * COLS + c;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) out.push([idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3)]);
      if (r + 3 < ROWS) out.push([idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c)]);
      if (c + 3 < COLS && r + 3 < ROWS) out.push([idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3)]);
      if (c - 3 >= 0 && r + 3 < ROWS) out.push([idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2), idx(r + 3, c - 3)]);
    }
  }
  return out;
})();

const winner = (b: Disc[]): Disc => {
  for (const L of lines) {
    const v = b[L[0]];
    if (v !== 0 && L.every((i) => b[i] === v)) return v;
  }
  return 0;
};

const dropRow = (b: Disc[], c: number): number => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r * COLS + c] === 0) return r;
  }
  return -1;
};

export function FourStackGame({ api }: { api: GameApi }) {
  const [board, setBoard] = useState<Disc[]>(() => Array(COLS * ROWS).fill(0));
  const [flash, setFlash] = useState<number[]>([]);
  const score = useRef(0);
  const round = useRef(1);
  const busy = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    score.current = 0;
    round.current = 1;
    busy.current = false;
    doneRef.current = false;
    api.setScore(0);
    setBoard(Array(COLS * ROWS).fill(0));
    setFlash([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Column scoring for the AI: win > block > center bias > random. */
  const aiPick = (b: Disc[]): number => {
    const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(b, c) >= 0);
    const tryDrop = (bd: Disc[], c: number, who: Disc): Disc[] => {
      const n = [...bd];
      n[dropRow(bd, c) * COLS + c] = who;
      return n;
    };
    // 1. Winning move.
    for (const c of open) if (winner(tryDrop(b, c, 2)) === 2) return c;
    // 2. Block the player's winning move.
    for (const c of open) if (winner(tryDrop(b, c, 1)) === 1) return c;
    // 3. From round 2 on: avoid handing the player a win right above.
    if (round.current >= 2) {
      const safe = open.filter((c) => {
        const after = tryDrop(b, c, 2);
        return !open.some((c2) => dropRow(after, c2) >= 0 && winner(tryDrop(after, c2, 1)) === 1);
      });
      if (safe.length > 0) {
        safe.sort((a, bc) => Math.abs(a - 3) - Math.abs(bc - 3));
        return safe[Math.floor(Math.random() * Math.min(2, safe.length))];
      }
    }
    open.sort((a, bc) => Math.abs(a - 3) - Math.abs(bc - 3));
    return open[Math.floor(Math.random() * Math.min(3, open.length))];
  };

  const endRound = (result: 'win' | 'lose' | 'draw', b: Disc[]) => {
    if (result === 'win') {
      const winLine = lines.find((L) => b[L[0]] === 1 && L.every((i) => b[i] === 1));
      setFlash(winLine ?? []);
      score.current += 100 * round.current;
      round.current += 1;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
    } else if (result === 'lose') {
      const winLine = lines.find((L) => b[L[0]] === 2 && L.every((i) => b[i] === 2));
      setFlash(winLine ?? []);
      playSfx('gameOver');
      haptic.heavy();
      doneRef.current = true;
      setTimeout(() => api.end({ score: score.current }), 900);
      return;
    } else {
      playSfx('flip');
    }
    busy.current = true;
    setTimeout(() => {
      setBoard(Array(COLS * ROWS).fill(0));
      setFlash([]);
      busy.current = false;
    }, result === 'win' ? 1000 : 500);
  };

  const play = (c: number) => {
    if (!api.running || busy.current || doneRef.current) return;
    setBoard((prev) => {
      const r = dropRow(prev, c);
      if (r < 0) return prev;
      const b = [...prev];
      b[r * COLS + c] = 1;
      playSfx('select');
      haptic.light();
      if (winner(b) === 1) {
        endRound('win', b);
        return b;
      }
      if (b.every((v) => v !== 0)) {
        endRound('draw', b);
        return b;
      }
      busy.current = true;
      setTimeout(() => {
        setBoard((cur) => {
          const c2 = aiPick(cur);
          const r2 = dropRow(cur, c2);
          if (r2 < 0) return cur;
          const b2 = [...cur];
          b2[r2 * COLS + c2] = 2;
          playSfx('bounce');
          if (winner(b2) === 2) {
            endRound('lose', b2);
            return b2;
          }
          if (b2.every((v) => v !== 0)) {
            endRound('draw', b2);
            return b2;
          }
          busy.current = false;
          return b2;
        });
      }, 380);
      return b;
    });
  };

  const cell = Math.floor(Math.min((api.width - 24) / COLS, (api.height - 140) / (ROWS + 1)));
  const bw = COLS * cell;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size={11} color={colors.textDim} style={{ marginBottom: 8 }}>
        {`▸ ${String(round.current)}`}
      </PixelText>
      {/* Drop buttons */}
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {Array.from({ length: COLS }, (_, c) => (
          <Pressable
            key={c}
            onPress={() => play(c)}
            style={{ width: cell, height: cell * 0.8, alignItems: 'center', justifyContent: 'center' }}>
            <PixelText size={cell * 0.4} color={colors.neonCyan}>
              ▼
            </PixelText>
          </Pressable>
        ))}
      </View>
      {/* Board */}
      <View style={{ width: bw, height: ROWS * cell, backgroundColor: '#122a5c', borderRadius: 8, borderWidth: 2, borderColor: '#1c3c7a' }}>
        {board.map((v, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: c * cell + cell * 0.08,
                top: r * cell + cell * 0.08,
                width: cell * 0.84,
                height: cell * 0.84,
                borderRadius: cell * 0.42,
                backgroundColor:
                  v === 1 ? colors.neonYellow : v === 2 ? colors.neonRed : '#0a1020',
                borderWidth: flash.includes(i) ? 3 : 0,
                borderColor: colors.neonGreen,
              }}
            />
          );
        })}
      </View>
      {/* Tap a column above to drop into it (columns are also tappable on the board) */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }} pointerEvents="box-none">
        {Array.from({ length: COLS }, (_, c) => (
          <Pressable
            key={c}
            onPress={() => play(c)}
            style={{ position: 'absolute', left: (api.width - bw) / 2 + c * cell, top: 0, bottom: 0, width: cell }}
          />
        ))}
      </View>
    </View>
  );
}
