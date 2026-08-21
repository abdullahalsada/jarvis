import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Desk-sumo with erasers, the between-classes classic: flick your eraser
 * (drag on it and release) to shove the rival eraser off the desk without
 * sliding off yourself. Take turns with the computer. Knock it off for
 * 100 × round; each round the desk shrinks. Fall off and it's over.
 */
interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function EraserFlickGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const EW = 56; // eraser width
  const EH = 34;

  const deskW = useRef(0);
  const deskH = useRef(0);
  const mine = useRef<Puck>({ x: 0, y: 0, vx: 0, vy: 0 });
  const rival = useRef<Puck>({ x: 0, y: 0, vx: 0, vy: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const myTurn = useRef(true);
  const moving = useRef(false);
  const round = useRef(1);
  const score = useRef(0);
  const doneRef = useRef(false);
  const [, redraw] = useState(0);

  const deskRect = () => {
    const w = deskW.current;
    const h = deskH.current;
    return { left: (W - w) / 2, top: (H - h) / 2, right: (W + w) / 2, bottom: (H + h) / 2 };
  };

  const newRound = () => {
    deskW.current = Math.min(W * 0.86, 360) - (round.current - 1) * 18;
    deskH.current = Math.min(H * 0.62, 460) - (round.current - 1) * 24;
    const d = deskRect();
    mine.current = { x: W / 2, y: d.bottom - EH * 1.6, vx: 0, vy: 0 };
    rival.current = { x: W / 2, y: d.top + EH * 1.6, vx: 0, vy: 0 };
    myTurn.current = true;
    moving.current = false;
    drag.current = null;
  };

  useEffect(() => {
    round.current = 1;
    score.current = 0;
    doneRef.current = false;
    api.setScore(0);
    newRound();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const flick = () => {
    const d = drag.current;
    drag.current = null;
    if (!api.running || !d || !myTurn.current || moving.current || doneRef.current) return;
    const dx = mine.current.x - d.x;
    const dy = mine.current.y - d.y;
    if (Math.hypot(dx, dy) < 12) return;
    mine.current.vx = dx * 5.5;
    mine.current.vy = dy * 5.5;
    moving.current = true;
    myTurn.current = false;
    playSfx('shoot');
    haptic.light();
  };
  const flickRef = useRef(flick);
  flickRef.current = flick;

  const dragTo = (x: number, y: number) => {
    if (!api.running || !myTurn.current || moving.current) return;
    const dx = x - mine.current.x;
    const dy = y - mine.current.y;
    const dist = Math.hypot(dx, dy);
    const max = 110;
    const k = dist > max ? max / dist : 1;
    drag.current = { x: mine.current.x + dx * k, y: mine.current.y + dy * k };
  };
  const dragToRef = useRef(dragTo);
  dragToRef.current = dragTo;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => dragToRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderMove: (evt) => dragToRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderRelease: () => flickRef.current(),
      onPanResponderTerminate: () => flickRef.current(),
    })
  );

  const aiFlick = () => {
    // Aim at the player with some scatter; harder rounds aim truer.
    const scatter = Math.max(0.05, 0.35 - round.current * 0.05);
    const dx = mine.current.x - rival.current.x + (Math.random() - 0.5) * W * scatter;
    const dy = mine.current.y - rival.current.y + (Math.random() - 0.5) * H * scatter * 0.5;
    const d = Math.hypot(dx, dy) || 1;
    const power = 380 + Math.random() * 200 + round.current * 30;
    rival.current.vx = (dx / d) * power;
    rival.current.vy = (dy / d) * power;
    moving.current = true;
    playSfx('shoot');
  };

  useGameLoop(api.running, (dt) => {
    if (doneRef.current) return;
    const pucks = [mine.current, rival.current];
    let anyMoving = false;
    for (const p of pucks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;
      if (Math.hypot(p.vx, p.vy) < 12) {
        p.vx = 0;
        p.vy = 0;
      } else {
        anyMoving = true;
      }
    }
    // Eraser-on-eraser shove.
    const dx = rival.current.x - mine.current.x;
    const dy = rival.current.y - mine.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist < EW * 0.9 && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      const rel = (mine.current.vx - rival.current.vx) * nx + (mine.current.vy - rival.current.vy) * ny;
      if (rel > 0) {
        rival.current.vx += nx * rel * 0.9;
        rival.current.vy += ny * rel * 0.9;
        mine.current.vx -= nx * rel * 0.9;
        mine.current.vy -= ny * rel * 0.9;
        playSfx('brick');
        haptic.medium();
      }
    }

    // Off the desk?
    const d = deskRect();
    const off = (p: Puck) => p.x < d.left || p.x > d.right || p.y < d.top || p.y > d.bottom;
    if (off(rival.current)) {
      score.current += 100 * round.current;
      round.current += 1;
      api.setScore(score.current);
      playSfx('win');
      haptic.success();
      doneRef.current = false;
      newRound();
      redraw((n) => n + 1);
      return;
    }
    if (off(mine.current)) {
      doneRef.current = true;
      playSfx('gameOver');
      haptic.heavy();
      api.end({ score: score.current });
      return;
    }

    if (moving.current && !anyMoving) {
      moving.current = false;
      if (!myTurn.current) {
        // Rival's turn now.
        setTimeout(() => {
          if (!doneRef.current && api.running) {
            aiFlick();
            myTurn.current = true; // after the AI shot resolves it's ours
          }
        }, 500);
      }
    }
    redraw((n) => n + 1);
  });

  const d = deskRect();

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* The desk */}
        <View
          style={{
            position: 'absolute',
            left: d.left,
            top: d.top,
            width: deskW.current,
            height: deskH.current,
            backgroundColor: '#8a5a2b',
            borderWidth: 4,
            borderColor: '#5e3d1c',
            borderRadius: 8,
          }}>
          {/* Wood grain */}
          {[0.25, 0.5, 0.75].map((f, i) => (
            <View key={i} style={{ position: 'absolute', top: `${f * 100}%`, width: '100%', height: 2, backgroundColor: '#7a4a22' }} />
          ))}
        </View>
        {/* Aim line */}
        {drag.current && (
          <View
            style={{
              position: 'absolute',
              left: Math.min(mine.current.x, drag.current.x),
              top: Math.min(mine.current.y, drag.current.y),
              width: Math.abs(drag.current.x - mine.current.x) || 2,
              height: Math.abs(drag.current.y - mine.current.y) || 2,
              borderWidth: 1,
              borderColor: colors.neonCyan,
              opacity: 0.6,
            }}
          />
        )}
        {/* Rival eraser (red) */}
        <View
          style={{
            position: 'absolute',
            left: rival.current.x - EW / 2,
            top: rival.current.y - EH / 2,
            width: EW,
            height: EH,
            borderRadius: 8,
            backgroundColor: '#ff3b3b',
            borderWidth: 3,
            borderColor: '#b32222',
          }}
        />
        {/* Your eraser (cyan) */}
        <View
          style={{
            position: 'absolute',
            left: mine.current.x - EW / 2,
            top: mine.current.y - EH / 2,
            width: EW,
            height: EH,
            borderRadius: 8,
            backgroundColor: '#00fff7',
            borderWidth: 3,
            borderColor: '#00b3ae',
          }}
        />
        <View style={{ position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center' }}>
          <PixelText size={11} color={myTurn.current && !moving.current ? colors.neonCyan : colors.textDim}>
            {`▸ ${round.current}`}
          </PixelText>
        </View>
      </View>
    </View>
  );
}
