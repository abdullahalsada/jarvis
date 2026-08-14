import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useTick } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Cube-hopping mechanics in the Q*bert tradition, original theme: hop
 * diagonally across a pyramid of cubes, painting each one you land on.
 * Paint every cube to clear the level. Bouncing hazards tumble down from
 * the top — share a cube with one and you lose a life; hop off the pyramid
 * and gravity does the rest. 25 points per painted cube (the classic rate),
 * level bonus, hazards multiply and speed up each level. Swipe DIAGONALLY —
 * the four diagonal hops are the whole game, exactly like the arcade stick.
 */
const ROWS = 7;

type Pos = { row: number; idx: number };

interface Hazard {
  pos: Pos;
  /** Ticks to skip before first move (staggers spawns). */
  warmup: number;
}

export function PyramidHopGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const cube = Math.floor(Math.min(W / (ROWS + 1.5), H / (ROWS * 0.8 + 2)));
  const topPad = Math.floor(cube * 1.2);

  const painted = useRef<Set<string>>(new Set());
  const player = useRef<Pos>({ row: 0, idx: 0 });
  const hazards = useRef<Hazard[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const level = useRef(1);
  const hopCooldown = useRef(0);
  const spawnCounter = useRef(0);
  const [, redraw] = useState(0);

  const key = (p: Pos) => `${p.row},${p.idx}`;
  const onPyramid = (p: Pos) => p.row >= 0 && p.row < ROWS && p.idx >= 0 && p.idx <= p.row;
  const totalCubes = (ROWS * (ROWS + 1)) / 2;

  const resetBoard = () => {
    painted.current = new Set();
    player.current = { row: 0, idx: 0 };
    hazards.current = [];
    spawnCounter.current = 0;
    paint(player.current);
  };

  const paint = (p: Pos) => {
    const k = key(p);
    if (!painted.current.has(k)) {
      painted.current.add(k);
      score.current += 25;
      api.setScore(score.current);
      playSfx('eat');
      if (painted.current.size === totalCubes) {
        score.current += 100 * level.current;
        api.setScore(score.current);
        level.current += 1;
        playSfx('win');
        haptic.success();
        resetBoard();
      }
    }
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    level.current = 1;
    api.setScore(0);
    api.setLives(3);
    resetBoard();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const die = () => {
    playSfx('loseLife');
    haptic.heavy();
    lives.current -= 1;
    api.setLives(lives.current);
    if (lives.current <= 0) {
      api.end({ score: score.current });
      return true;
    }
    player.current = { row: 0, idx: 0 };
    hazards.current = [];
    return false;
  };

  const hop = (dRow: number, dIdx: number) => {
    if (!api.running || hopCooldown.current > Date.now()) return;
    hopCooldown.current = Date.now() + 160;
    const next: Pos = { row: player.current.row + dRow, idx: player.current.idx + dIdx };
    playSfx('flip');
    haptic.light();
    if (!onPyramid(next)) {
      if (die()) return;
    } else {
      player.current = next;
      paint(next);
      // Landing on a hazard is just as fatal as it landing on you.
      if (hazards.current.some((h) => h.pos.row === next.row && h.pos.idx === next.idx)) {
        if (die()) return;
      }
    }
    redraw((n) => n + 1);
  };

  // Diagonal swipe control: the quadrant of the drag picks one of the four
  // diagonal hops (down-left, down-right, up-left, up-right).
  const start = useRef({ x: 0, y: 0 });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        start.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
      },
      onPanResponderMove: (evt) => {
        const dx = evt.nativeEvent.pageX - start.current.x;
        const dy = evt.nativeEvent.pageY - start.current.y;
        if (Math.abs(dx) < 22 || Math.abs(dy) < 12) return; // need a clear diagonal
        start.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        if (dy > 0) hop(1, dx > 0 ? 1 : 0);
        else hop(-1, dx > 0 ? 0 : -1);
      },
    })
  );

  // Hazards tumble on a fixed beat that quickens with each level.
  useTick(api.running, Math.max(320, 700 - level.current * 60), () => {
    spawnCounter.current += 1;
    const spawnEvery = Math.max(3, 7 - level.current);
    const maxHazards = Math.min(4, 1 + Math.floor(level.current / 2));
    if (spawnCounter.current % spawnEvery === 0 && hazards.current.length < maxHazards) {
      hazards.current.push({ pos: { row: 0, idx: 0 }, warmup: 1 });
    }

    for (let i = hazards.current.length - 1; i >= 0; i--) {
      const h = hazards.current[i];
      if (h.warmup > 0) {
        h.warmup -= 1;
        continue;
      }
      h.pos = { row: h.pos.row + 1, idx: h.pos.idx + (Math.random() < 0.5 ? 0 : 1) };
      if (!onPyramid(h.pos)) {
        hazards.current.splice(i, 1);
      }
    }

    if (
      hazards.current.some(
        (h) => h.pos.row === player.current.row && h.pos.idx === player.current.idx
      )
    ) {
      if (die()) return;
    }
    redraw((n) => n + 1);
  });

  const cubeX = (p: Pos) => W / 2 + (p.idx - p.row / 2) * cube - cube / 2;
  const cubeY = (p: Pos) => topPad + p.row * cube * 0.78;

  const cells: Pos[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let idx = 0; idx <= row; idx++) cells.push({ row, idx });
  }

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {cells.map((p) => {
          const isPainted = painted.current.has(key(p));
          return (
            <View
              key={key(p)}
              style={{
                position: 'absolute',
                left: cubeX(p),
                top: cubeY(p),
                width: cube - 3,
                height: cube - 3,
                borderRadius: 4,
                backgroundColor: isPainted ? colors.neonYellow : colors.bgCard,
                borderWidth: 2,
                borderColor: isPainted ? colors.neonYellow : colors.border,
              }}
            />
          );
        })}
        {hazards.current.map((h, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: cubeX(h.pos) + cube * 0.22,
              top: cubeY(h.pos) - cube * 0.25,
              width: cube * 0.5,
              height: cube * 0.5,
              borderRadius: cube * 0.25,
              backgroundColor: colors.neonRed,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: cubeX(player.current) + cube * 0.18,
            top: cubeY(player.current) - cube * 0.32,
            width: cube * 0.58,
            height: cube * 0.58,
            borderRadius: cube * 0.29,
            backgroundColor: colors.neonMagenta,
          }}
        />
      </View>
    </View>
  );
}
