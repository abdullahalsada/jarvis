import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Picross-style nonogram: the numbers on each row and column say how many
 * cells in a run are filled — deduce the hidden pixel picture. Tap to
 * fill; switch to ✗ mode to mark empties. Three wrong fills end the
 * puzzle streak. 5×5 grids warm you up, then 8×8. 100 points a solve.
 */
const SIZES = [5, 5, 8, 8, 8];

type CellState = 'empty' | 'fill' | 'mark';

const genPuzzle = (n: number): boolean[] => {
  // ~55% fill keeps clues meaningful.
  let cells: boolean[];
  do {
    cells = Array.from({ length: n * n }, () => Math.random() < 0.55);
  } while (cells.every((c) => !c));
  return cells;
};

const clues = (solution: boolean[], n: number, isRow: boolean, idx: number): number[] => {
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const v = isRow ? solution[idx * n + i] : solution[i * n + idx];
    if (v) run += 1;
    else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out.length > 0 ? out : [0];
};

export function PixelLogicGame({ api }: { api: GameApi }) {
  const [puzzleNo, setPuzzleNo] = useState(0);
  const n = SIZES[Math.min(puzzleNo, SIZES.length - 1)];
  const [solution, setSolution] = useState<boolean[]>(() => genPuzzle(5));
  const [cells, setCells] = useState<CellState[]>(() => Array(25).fill('empty'));
  const [markMode, setMarkMode] = useState(false);
  const mistakes = useRef(0);
  const score = useRef(0);
  const doneRef = useRef(false);

  const load = (no: number) => {
    const size = SIZES[Math.min(no, SIZES.length - 1)];
    setPuzzleNo(no);
    setSolution(genPuzzle(size));
    setCells(Array(size * size).fill('empty'));
    setMarkMode(false);
  };

  useEffect(() => {
    score.current = 0;
    mistakes.current = 0;
    doneRef.current = false;
    api.setScore(0);
    api.setLives(3);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const tap = (i: number) => {
    if (!api.running || doneRef.current) return;
    setCells((prev) => {
      if (prev[i] !== 'empty') return prev;
      const next = [...prev];
      if (markMode) {
        if (solution[i]) {
          // Marking a filled cell is also a mistake.
          return miss(next, i);
        }
        next[i] = 'mark';
        playSfx('flip');
        return next;
      }
      if (!solution[i]) return miss(next, i);
      next[i] = 'fill';
      playSfx('point');
      haptic.light();

      const solved = solution.every((v, j) => !v || next[j] === 'fill');
      if (solved) {
        score.current += 100;
        api.setScore(score.current);
        playSfx('win');
        haptic.success();
        setTimeout(() => load(puzzleNo + 1), 500);
      }
      return next;
    });
  };

  const miss = (next: CellState[], i: number): CellState[] => {
    next[i] = solution[i] ? 'fill' : 'mark';
    mistakes.current += 1;
    api.setLives(3 - mistakes.current);
    playSfx('wrong');
    haptic.heavy();
    if (mistakes.current >= 3) {
      doneRef.current = true;
      api.end({ score: score.current });
    }
    return next;
  };

  const CLUE_SPACE = 64;
  const cell = Math.floor(
    Math.min((api.width - CLUE_SPACE - 16) / n, (api.height - CLUE_SPACE - 130) / n)
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: CLUE_SPACE }} />
        {/* Column clues */}
        {Array.from({ length: n }, (_, c) => (
          <View key={c} style={{ width: cell, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
            {clues(solution, n, false, c).map((v, i) => (
              <PixelText key={i} size={11} color={colors.neonCyan}>
                {String(v)}
              </PixelText>
            ))}
          </View>
        ))}
      </View>
      {Array.from({ length: n }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {/* Row clues */}
          <View style={{ width: CLUE_SPACE, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, gap: 4 }}>
            {clues(solution, n, true, r).map((v, i) => (
              <PixelText key={i} size={11} color={colors.neonCyan}>
                {String(v)}
              </PixelText>
            ))}
          </View>
          {Array.from({ length: n }, (_, c) => {
            const i = r * n + c;
            const st = cells[i];
            return (
              <Pressable
                key={c}
                onPress={() => tap(i)}
                style={{
                  width: cell,
                  height: cell,
                  borderWidth: 1,
                  borderColor: '#2a2a45',
                  backgroundColor: st === 'fill' ? colors.neonGreen : '#101020',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {st === 'mark' && (
                  <PixelText size={cell * 0.5} color={colors.textDim}>
                    ✗
                  </PixelText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      {/* Mode toggle */}
      <View style={{ flexDirection: 'row', marginTop: 18, gap: 10 }}>
        <Pressable
          onPress={() => setMarkMode(false)}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderWidth: 2,
            borderRadius: 8,
            borderColor: colors.neonGreen,
            backgroundColor: markMode ? 'transparent' : colors.neonGreen,
          }}>
          <PixelText size={14} color={markMode ? colors.neonGreen : colors.bg}>
            ■
          </PixelText>
        </Pressable>
        <Pressable
          onPress={() => setMarkMode(true)}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderWidth: 2,
            borderRadius: 8,
            borderColor: colors.textDim,
            backgroundColor: markMode ? colors.textDim : 'transparent',
          }}>
          <PixelText size={14} color={markMode ? colors.bg : colors.textDim}>
            ✗
          </PixelText>
        </Pressable>
        <PixelText size={11} color={colors.textDim} style={{ alignSelf: 'center', marginLeft: 8 }}>
          {`▸ ${puzzleNo + 1}`}
        </PixelText>
      </View>
    </View>
  );
}
