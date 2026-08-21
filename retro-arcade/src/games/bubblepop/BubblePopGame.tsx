import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Bubble shooter: drag to aim (the dotted line bounces off the walls),
 * release to fire. Stick three or more of a color together and they pop —
 * bubbles left hanging fall for bonus points. The ceiling creeps down
 * every six shots; if the field reaches the line, it's over.
 */
const COLS = 9;
const BUBBLE_COLORS = ['#ff3b3b', '#ffe600', '#39ff14', '#00fff7', '#b14aed'];

interface Cell {
  row: number;
  col: number;
}

export function BubblePopGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const R = Math.floor(W / (COLS * 2)); // bubble radius
  const ROW_H = R * 1.74;
  const DEADLINE = H - 140;

  // grid.get('row,col') = color index. Odd rows are offset half a bubble.
  const grid = useRef<Map<string, number>>(new Map());
  const shooter = useRef({ angle: -Math.PI / 2 });
  const flying = useRef<{ x: number; y: number; vx: number; vy: number; color: number } | null>(null);
  const nextColor = useRef(0);
  const shots = useRef(0);
  const falling = useRef<{ x: number; y: number; vy: number; color: number }[]>([]);
  const score = useRef(0);
  const doneRef = useRef(false);
  const [, redraw] = useState(0);

  const key = (r: number, c: number) => `${r},${c}`;
  const cellX = (r: number, c: number) => c * R * 2 + R + (r % 2 === 1 ? R : 0);
  const cellY = (r: number) => r * ROW_H + R + 6;

  const colorsInPlay = (): number[] => {
    const set = new Set(grid.current.values());
    return set.size > 0 ? [...set] : [0];
  };

  const pickColor = () => {
    const pool = colorsInPlay();
    return pool[Math.floor(Math.random() * pool.length)];
  };

  useEffect(() => {
    grid.current = new Map();
    for (let r = 0; r < 6; r++) {
      const cols = r % 2 === 1 ? COLS - 1 : COLS;
      for (let c = 0; c < cols; c++) {
        grid.current.set(key(r, c), Math.floor(Math.random() * BUBBLE_COLORS.length));
      }
    }
    flying.current = null;
    falling.current = [];
    shots.current = 0;
    score.current = 0;
    doneRef.current = false;
    nextColor.current = pickColor();
    api.setScore(0);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const SHOOTER_POS = { x: W / 2, y: H - 70 };

  const aim = (x: number, y: number) => {
    if (!api.running) return;
    const dx = x - SHOOTER_POS.x;
    const dy = y - SHOOTER_POS.y;
    let ang = Math.atan2(dy, dx);
    // Clamp to upward directions only.
    ang = Math.min(-0.18, Math.max(-Math.PI + 0.18, ang));
    shooter.current.angle = ang;
  };
  const aimRef = useRef(aim);
  aimRef.current = aim;

  const fire = () => {
    if (!api.running || flying.current || doneRef.current) return;
    const sp = H * 1.35;
    flying.current = {
      x: SHOOTER_POS.x,
      y: SHOOTER_POS.y,
      vx: Math.cos(shooter.current.angle) * sp,
      vy: Math.sin(shooter.current.angle) * sp,
      color: nextColor.current,
    };
    nextColor.current = pickColor();
    playSfx('shoot');
    haptic.light();
  };
  const fireRef = useRef(fire);
  fireRef.current = fire;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => aimRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderMove: (evt) => aimRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderRelease: () => fireRef.current(),
      onPanResponderTerminate: () => fireRef.current(),
    })
  );

  const neighbors = (r: number, c: number): Cell[] => {
    const odd = r % 2 === 1;
    const deltas = odd
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    return deltas.map(([dr, dc]) => ({ row: r + dr, col: c + dc }));
  };

  const settle = (fx: number, fy: number, color: number) => {
    // Snap to the nearest empty cell.
    let best: Cell | null = null;
    let bestD = Infinity;
    const maxRow = Math.ceil((H - 160) / ROW_H);
    for (let r = 0; r <= maxRow; r++) {
      const cols = r % 2 === 1 ? COLS - 1 : COLS;
      for (let c = 0; c < cols; c++) {
        if (grid.current.has(key(r, c))) continue;
        const d = (cellX(r, c) - fx) ** 2 + (cellY(r) - fy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { row: r, col: c };
        }
      }
    }
    if (!best) return;
    grid.current.set(key(best.row, best.col), color);

    // Find the same-color cluster.
    const cluster: string[] = [];
    const seen = new Set<string>([key(best.row, best.col)]);
    const stack: Cell[] = [best];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      cluster.push(key(cur.row, cur.col));
      for (const n of neighbors(cur.row, cur.col)) {
        const k = key(n.row, n.col);
        if (!seen.has(k) && grid.current.get(k) === color) {
          seen.add(k);
          stack.push(n);
        }
      }
    }

    if (cluster.length >= 3) {
      for (const k of cluster) {
        const [r, c] = k.split(',').map(Number);
        falling.current.push({ x: cellX(r, c), y: cellY(r), vy: -H * 0.12, color: grid.current.get(k)! });
        grid.current.delete(k);
      }
      score.current += cluster.length * 10;
      playSfx('match');
      haptic.medium();

      // Drop anything no longer connected to the top row.
      const anchored = new Set<string>();
      const q: Cell[] = [];
      for (let c = 0; c < COLS; c++) {
        if (grid.current.has(key(0, c))) {
          anchored.add(key(0, c));
          q.push({ row: 0, col: c });
        }
      }
      while (q.length > 0) {
        const cur = q.pop()!;
        for (const n of neighbors(cur.row, cur.col)) {
          const k = key(n.row, n.col);
          if (grid.current.has(k) && !anchored.has(k)) {
            anchored.add(k);
            q.push(n);
          }
        }
      }
      let dropped = 0;
      for (const k of [...grid.current.keys()]) {
        if (!anchored.has(k)) {
          const [r, c] = k.split(',').map(Number);
          falling.current.push({ x: cellX(r, c), y: cellY(r), vy: 0, color: grid.current.get(k)! });
          grid.current.delete(k);
          dropped += 1;
        }
      }
      if (dropped > 0) {
        score.current += dropped * 20;
        playSfx('coin');
      }
      api.setScore(score.current);

      // Cleared the whole field: fresh rack, big bonus.
      if (grid.current.size === 0) {
        score.current += 500;
        api.setScore(score.current);
        playSfx('win');
        haptic.success();
        for (let r = 0; r < 6; r++) {
          const cols = r % 2 === 1 ? COLS - 1 : COLS;
          for (let c = 0; c < cols; c++) {
            grid.current.set(key(r, c), Math.floor(Math.random() * BUBBLE_COLORS.length));
          }
        }
      }
    } else {
      playSfx('flip');
    }

    // Ceiling creep every 6 shots: shift every bubble down one row.
    shots.current += 1;
    if (shots.current % 6 === 0) {
      const shifted = new Map<string, number>();
      for (const [k, v] of grid.current) {
        const [r, c] = k.split(',').map(Number);
        shifted.set(key(r + 1, c), v);
      }
      grid.current = shifted;
      playSfx('brick');
    }

    // Defeat: any bubble past the line.
    for (const k of grid.current.keys()) {
      const [r] = k.split(',').map(Number);
      if (cellY(r) + R > DEADLINE) {
        doneRef.current = true;
        playSfx('gameOver');
        haptic.heavy();
        api.end({ score: score.current });
        return;
      }
    }
  };

  useGameLoop(api.running, (dt) => {
    const f = flying.current;
    if (f) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < R) {
        f.x = R;
        f.vx = Math.abs(f.vx);
      }
      if (f.x > W - R) {
        f.x = W - R;
        f.vx = -Math.abs(f.vx);
      }
      // Stick on ceiling or on contact with any bubble.
      let stick = f.y < R + 6;
      if (!stick) {
        for (const [k] of grid.current) {
          const [r, c] = k.split(',').map(Number);
          if ((cellX(r, c) - f.x) ** 2 + (cellY(r) - f.y) ** 2 < (R * 2 - 2) ** 2) {
            stick = true;
            break;
          }
        }
      }
      if (stick) {
        const { x, y, color } = f;
        flying.current = null;
        settle(x, y, color);
      }
    }
    for (const fb of falling.current) {
      fb.vy += H * 1.6 * dt;
      fb.y += fb.vy * dt;
    }
    falling.current = falling.current.filter((fb) => fb.y < H + R * 2);
    redraw((n) => n + 1);
  });

  const cells = [...grid.current.entries()];

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Field bubbles */}
        {cells.map(([k, color]) => {
          const [r, c] = k.split(',').map(Number);
          return (
            <View
              key={k}
              style={{
                position: 'absolute',
                left: cellX(r, c) - R,
                top: cellY(r) - R,
                width: R * 2,
                height: R * 2,
                borderRadius: R,
                backgroundColor: BUBBLE_COLORS[color],
                borderWidth: 2,
                borderColor: 'rgba(0,0,0,0.25)',
              }}>
              <View style={{ position: 'absolute', left: R * 0.3, top: R * 0.24, width: R * 0.55, height: R * 0.4, borderRadius: R * 0.3, backgroundColor: 'rgba(255,255,255,0.55)' }} />
            </View>
          );
        })}
        {/* Falling bubbles */}
        {falling.current.map((fb, i) => (
          <View
            key={`f${i}`}
            style={{
              position: 'absolute',
              left: fb.x - R,
              top: fb.y - R,
              width: R * 2,
              height: R * 2,
              borderRadius: R,
              backgroundColor: BUBBLE_COLORS[fb.color],
              opacity: 0.8,
            }}
          />
        ))}
        {/* Deadline */}
        <View style={{ position: 'absolute', left: 0, top: DEADLINE, width: W, height: 2, backgroundColor: colors.neonRed, opacity: 0.6 }} />
        {/* Aim line (dotted) */}
        {!flying.current &&
          Array.from({ length: 9 }, (_, i) => {
            const d = (i + 1) * R * 2.4;
            let x = SHOOTER_POS.x + Math.cos(shooter.current.angle) * d;
            const y = SHOOTER_POS.y + Math.sin(shooter.current.angle) * d;
            // Mirror off walls for the preview.
            const period = 2 * (W - 2 * R);
            let m = ((x - R) % period + period) % period;
            if (m > W - 2 * R) m = period - m;
            x = m + R;
            return (
              <View
                key={i}
                style={{ position: 'absolute', left: x - 3, top: y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text, opacity: 0.6 - i * 0.05 }}
              />
            );
          })}
        {/* Flying bubble */}
        {flying.current && (
          <View
            style={{
              position: 'absolute',
              left: flying.current.x - R,
              top: flying.current.y - R,
              width: R * 2,
              height: R * 2,
              borderRadius: R,
              backgroundColor: BUBBLE_COLORS[flying.current.color],
            }}
          />
        )}
        {/* Shooter + next bubble */}
        <View
          style={{
            position: 'absolute',
            left: SHOOTER_POS.x - R - 4,
            top: SHOOTER_POS.y - R - 4,
            width: (R + 4) * 2,
            height: (R + 4) * 2,
            borderRadius: R + 4,
            borderWidth: 3,
            borderColor: colors.neonCyan,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View style={{ width: R * 2 - 4, height: R * 2 - 4, borderRadius: R, backgroundColor: BUBBLE_COLORS[nextColor.current] }} />
        </View>
      </View>
    </View>
  );
}
