import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Battleship-style naval duel vs the computer: both fleets are placed for
 * you — tap the enemy waters to fire. Hit ships burn red; the AI hunts
 * back with a real target-and-sink strategy, so don't cluster your hopes.
 * Sink all five enemy ships before yours go down. Hits 10, wins 200, and
 * each new battle is worth more.
 */
const N = 8;
const FLEET = [4, 3, 3, 2, 2];

type Shot = 'none' | 'miss' | 'hit';

interface Fleet {
  ships: number[][]; // list of cell indexes per ship
  shots: Shot[];
}

const placeFleet = (): number[][] => {
  const taken = new Set<number>();
  const ships: number[][] = [];
  for (const len of FLEET) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horiz ? N : N - len));
      const c = Math.floor(Math.random() * (horiz ? N - len : N));
      const cells = Array.from({ length: len }, (_, i) =>
        horiz ? r * N + c + i : (r + i) * N + c
      );
      // No touching (including diagonals) keeps boards readable.
      const crowded = cells.some((cell) => {
        const cr = Math.floor(cell / N);
        const cc = cell % N;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = cr + dr;
            const cc2 = cc + dc;
            if (rr >= 0 && rr < N && cc2 >= 0 && cc2 < N && taken.has(rr * N + cc2)) return true;
          }
        }
        return false;
      });
      if (!crowded) {
        cells.forEach((cell) => taken.add(cell));
        ships.push(cells);
        break;
      }
    }
  }
  return ships;
};

export function NavalDuelGame({ api }: { api: GameApi }) {
  const [enemy, setEnemy] = useState<Fleet>({ ships: [], shots: [] });
  const [mine, setMine] = useState<Fleet>({ ships: [], shots: [] });
  const aiQueue = useRef<number[]>([]); // target-mode candidates after a hit
  const score = useRef(0);
  const battle = useRef(1);
  const doneRef = useRef(false);
  const busy = useRef(false);

  const newBattle = () => {
    setEnemy({ ships: placeFleet(), shots: Array(N * N).fill('none') });
    setMine({ ships: placeFleet(), shots: Array(N * N).fill('none') });
    aiQueue.current = [];
    busy.current = false;
  };

  useEffect(() => {
    score.current = 0;
    battle.current = 1;
    doneRef.current = false;
    api.setScore(0);
    newBattle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const sunk = (f: Fleet) => f.ships.every((s) => s.every((c) => f.shots[c] === 'hit'));

  const aiFire = () => {
    setMine((prev) => {
      const shots = [...prev.shots];
      let target: number;
      const open = shots
        .map((s, i) => (s === 'none' ? i : -1))
        .filter((i) => i >= 0);
      if (open.length === 0) return prev;
      const queued = aiQueue.current.filter((i) => shots[i] === 'none');
      if (queued.length > 0) {
        target = queued[Math.floor(Math.random() * queued.length)];
      } else {
        // Hunt on a checkerboard: every ship spans two colors.
        const parity = open.filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0);
        const pool = parity.length > 0 ? parity : open;
        target = pool[Math.floor(Math.random() * pool.length)];
      }
      const isHit = prev.ships.some((s) => s.includes(target));
      shots[target] = isHit ? 'hit' : 'miss';
      if (isHit) {
        playSfx('loseLife');
        haptic.heavy();
        const r = Math.floor(target / N);
        const c = target % N;
        const neigh = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ]
          .filter(([rr, cc]) => rr >= 0 && rr < N && cc >= 0 && cc < N)
          .map(([rr, cc]) => rr * N + cc);
        aiQueue.current.push(...neigh);
      }
      const next = { ...prev, shots };
      if (sunk(next)) {
        doneRef.current = true;
        api.end({ score: score.current });
      }
      return next;
    });
  };

  const fire = (i: number) => {
    if (!api.running || doneRef.current || busy.current) return;
    setEnemy((prev) => {
      if (prev.shots[i] !== 'none') return prev;
      const shots = [...prev.shots];
      const isHit = prev.ships.some((s) => s.includes(i));
      shots[i] = isHit ? 'hit' : 'miss';
      if (isHit) {
        score.current += 10 * battle.current;
        api.setScore(score.current);
        playSfx('explode');
        haptic.medium();
      } else {
        playSfx('flip');
      }
      const next = { ...prev, shots };
      if (sunk(next)) {
        score.current += 200 * battle.current;
        battle.current += 1;
        api.setScore(score.current);
        playSfx('win');
        haptic.success();
        setTimeout(newBattle, 700);
        return next;
      }
      // The enemy answers after a beat.
      busy.current = true;
      setTimeout(() => {
        busy.current = false;
        if (!doneRef.current) aiFire();
      }, 450);
      return next;
    });
  };

  const cell = Math.floor(Math.min((api.width - 24) / N, (api.height - 150) / (N * 2)));
  const bw = N * cell;

  const grid = (f: Fleet, isEnemy: boolean) => (
    <View style={{ width: bw, height: N * cell }}>
      {Array.from({ length: N * N }, (_, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const st = f.shots[i];
        const shipHere = !isEnemy && f.ships.some((s) => s.includes(i));
        const bg =
          st === 'hit'
            ? colors.neonRed
            : st === 'miss'
              ? '#20304a'
              : shipHere
                ? '#3a5a7a'
                : '#0e1a2e';
        const cellStyle = {
          width: cell,
          height: cell,
          borderWidth: 1,
          borderColor: '#1c2c48',
          backgroundColor: bg,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        };
        const dot = st === 'miss' && (
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textDim }} />
        );
        return isEnemy ? (
          <Pressable
            key={i}
            onPress={() => fire(i)}
            style={[{ position: 'absolute', left: c * cell, top: r * cell }, cellStyle]}>
            {dot}
          </Pressable>
        ) : (
          <View key={i} style={[{ position: 'absolute', left: c * cell, top: r * cell }, cellStyle]}>
            {dot}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <PixelText size={11} color={colors.neonRed}>
        {`☠ ${String(battle.current)}`}
      </PixelText>
      {grid(enemy, true)}
      <View style={{ width: bw, height: 2, backgroundColor: colors.border, marginVertical: 4 }} />
      {grid(mine, false)}
    </View>
  );
}
