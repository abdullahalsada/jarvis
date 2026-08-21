import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * The back-of-the-notebook classic: take turns drawing walls between dots.
 * Close the fourth wall of a box to claim it — and take another turn!
 * You're cyan, the computer is red. Most boxes wins the round; each round
 * the computer gives away fewer free boxes. Lose a round and it's over.
 */
const N = 5; // dots per side → 4×4 boxes

type Owner = 0 | 1 | 2; // none | player | AI

interface Edges {
  h: boolean[]; // horizontal edges: N rows × (N-1) per row
  v: boolean[]; // vertical edges: (N-1) rows × N per row
}

const hIdx = (r: number, c: number) => r * (N - 1) + c;
const vIdx = (r: number, c: number) => r * N + c;

export function DotsBoxesGame({ api }: { api: GameApi }) {
  const [edges, setEdges] = useState<Edges>({ h: [], v: [] });
  const [boxes, setBoxes] = useState<Owner[]>([]);
  const [turn, setTurn] = useState<1 | 2>(1);
  const round = useRef(1);
  const score = useRef(0);
  const busy = useRef(false);
  const doneRef = useRef(false);

  const freshBoard = () => {
    setEdges({ h: Array(N * (N - 1)).fill(false), v: Array((N - 1) * N).fill(false) });
    setBoxes(Array((N - 1) * (N - 1)).fill(0));
    setTurn(1);
    busy.current = false;
  };

  useEffect(() => {
    round.current = 1;
    score.current = 0;
    doneRef.current = false;
    api.setScore(0);
    freshBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  /** Walls around box (r, c): top/bottom are h-edges, left/right v-edges. */
  const wallsOf = (e: Edges, r: number, c: number) => [
    e.h[hIdx(r, c)],
    e.h[hIdx(r + 1, c)],
    e.v[vIdx(r, c)],
    e.v[vIdx(r, c + 1)],
  ];

  const countWalls = (e: Edges, r: number, c: number) =>
    wallsOf(e, r, c).filter(Boolean).length;

  /** Apply one edge; returns closed box count. Mutates copies passed in. */
  const applyEdge = (e: Edges, b: Owner[], kind: 'h' | 'v', idx: number, who: Owner): number => {
    if (kind === 'h') e.h[idx] = true;
    else e.v[idx] = true;
    let closed = 0;
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const bi = r * (N - 1) + c;
        if (b[bi] === 0 && countWalls(e, r, c) === 4) {
          b[bi] = who;
          closed += 1;
        }
      }
    }
    return closed;
  };

  const allDone = (b: Owner[]) => b.every((x) => x !== 0);

  const finishRound = (b: Owner[]) => {
    const mine = b.filter((x) => x === 1).length;
    const theirs = b.filter((x) => x === 2).length;
    if (mine > theirs) {
      score.current += 100 * round.current + mine * 10;
      round.current += 1;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      setTimeout(freshBoard, 900);
    } else if (mine === theirs) {
      playSfx('flip');
      setTimeout(freshBoard, 900);
    } else {
      playSfx('gameOver');
      haptic.heavy();
      doneRef.current = true;
      setTimeout(() => api.end({ score: score.current }), 900);
    }
  };

  /** AI: close any box it can; otherwise avoid making a 3rd wall; from
   * round 2 it also sacrifices the smallest chain when forced. */
  const aiMove = (e0: Edges, b0: Owner[]) => {
    const e = { h: [...e0.h], v: [...e0.v] };
    const b = [...b0];
    const options: { kind: 'h' | 'v'; idx: number }[] = [];
    e.h.forEach((set, i) => !set && options.push({ kind: 'h', idx: i }));
    e.v.forEach((set, i) => !set && options.push({ kind: 'v', idx: i }));
    if (options.length === 0) return;

    const closes = (o: { kind: 'h' | 'v'; idx: number }) => {
      const te = { h: [...e.h], v: [...e.v] };
      const tb = [...b];
      return applyEdge(te, tb, o.kind, o.idx, 2);
    };
    const makesThird = (o: { kind: 'h' | 'v'; idx: number }) => {
      const te = { h: [...e.h], v: [...e.v] };
      if (o.kind === 'h') te.h[o.idx] = true;
      else te.v[o.idx] = true;
      for (let r = 0; r < N - 1; r++) {
        for (let c = 0; c < N - 1; c++) {
          if (b[r * (N - 1) + c] === 0 && countWalls(te, r, c) === 3) return true;
        }
      }
      return false;
    };

    let pick = options.find((o) => closes(o) > 0);
    if (!pick) {
      const safe = options.filter((o) => !makesThird(o));
      const pool = safe.length > 0 ? safe : options;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }

    const closed = applyEdge(e, b, pick.kind, pick.idx, 2);
    setEdges(e);
    setBoxes(b);
    playSfx('flip');
    if (allDone(b)) {
      finishRound(b);
      return;
    }
    if (closed > 0) {
      // AI goes again.
      setTimeout(() => aiMove(e, b), 420);
    } else {
      busy.current = false;
      setTurn(1);
    }
  };

  const tapEdge = (kind: 'h' | 'v', idx: number) => {
    if (!api.running || busy.current || doneRef.current || turn !== 1) return;
    if (kind === 'h' ? edges.h[idx] : edges.v[idx]) return;
    const e = { h: [...edges.h], v: [...edges.v] };
    const b = [...boxes];
    const closed = applyEdge(e, b, kind, idx, 1);
    setEdges(e);
    setBoxes(b);
    playSfx('select');
    haptic.light();
    if (closed > 0) {
      score.current += closed * 10;
      api.setScore(score.current);
      playSfx('point');
    }
    if (allDone(b)) {
      finishRound(b);
      return;
    }
    if (closed === 0) {
      setTurn(2);
      busy.current = true;
      setTimeout(() => aiMove(e, b), 450);
    }
  };

  const GAP = Math.floor(Math.min((api.width - 60) / (N - 1), (api.height - 180) / (N - 1)));
  const DOT = 12;
  const bw = (N - 1) * GAP;
  const EDGE_T = 8;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 18, marginBottom: 14 }}>
        <PixelText size={12} color={colors.neonCyan}>{`■ ${boxes.filter((b) => b === 1).length}`}</PixelText>
        <PixelText size={11} color={colors.textDim}>{`▸ ${round.current}`}</PixelText>
        <PixelText size={12} color={colors.neonRed}>{`■ ${boxes.filter((b) => b === 2).length}`}</PixelText>
      </View>
      <View style={{ width: bw + DOT, height: bw + DOT }}>
        {/* Claimed boxes */}
        {boxes.map((o, i) => {
          if (o === 0) return null;
          const r = Math.floor(i / (N - 1));
          const c = i % (N - 1);
          return (
            <View
              key={`b${i}`}
              style={{
                position: 'absolute',
                left: c * GAP + DOT / 2 + 3,
                top: r * GAP + DOT / 2 + 3,
                width: GAP - 6,
                height: GAP - 6,
                backgroundColor: o === 1 ? 'rgba(0,255,247,0.25)' : 'rgba(255,59,59,0.25)',
                borderRadius: 4,
              }}
            />
          );
        })}
        {/* Horizontal edges */}
        {Array.from({ length: N }, (_, r) =>
          Array.from({ length: N - 1 }, (_, c) => {
            const set = edges.h[hIdx(r, c)];
            return (
              <Pressable
                key={`h${r},${c}`}
                onPress={() => tapEdge('h', hIdx(r, c))}
                hitSlop={6}
                style={{
                  position: 'absolute',
                  left: c * GAP + DOT,
                  top: r * GAP + DOT / 2 - EDGE_T / 2,
                  width: GAP - DOT,
                  height: EDGE_T,
                  borderRadius: 4,
                  backgroundColor: set ? colors.text : 'rgba(154,154,181,0.18)',
                }}
              />
            );
          })
        )}
        {/* Vertical edges */}
        {Array.from({ length: N - 1 }, (_, r) =>
          Array.from({ length: N }, (_, c) => {
            const set = edges.v[vIdx(r, c)];
            return (
              <Pressable
                key={`v${r},${c}`}
                onPress={() => tapEdge('v', vIdx(r, c))}
                hitSlop={6}
                style={{
                  position: 'absolute',
                  left: c * GAP + DOT / 2 - EDGE_T / 2,
                  top: r * GAP + DOT,
                  width: EDGE_T,
                  height: GAP - DOT,
                  borderRadius: 4,
                  backgroundColor: set ? colors.text : 'rgba(154,154,181,0.18)',
                }}
              />
            );
          })
        )}
        {/* Dots on top */}
        {Array.from({ length: N }, (_, r) =>
          Array.from({ length: N }, (_, c) => (
            <View
              key={`d${r},${c}`}
              style={{
                position: 'absolute',
                left: c * GAP,
                top: r * GAP,
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: colors.neonYellow,
              }}
            />
          ))
        )}
      </View>
      <PixelText size={11} color={turn === 1 ? colors.neonCyan : colors.neonRed} style={{ marginTop: 14 }}>
        {turn === 1 ? '● ● ●' : '○ ○ ○'}
      </PixelText>
    </View>
  );
}
