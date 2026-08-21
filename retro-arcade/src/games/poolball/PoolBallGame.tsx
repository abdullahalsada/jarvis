import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Trick-shot pool: drag from anywhere to aim the cue (the line shows the
 * shot), release to strike. Pot the colored balls for 50 each — clear
 * them all, then sink the 8-ball to finish the rack for a big bonus.
 * Sinking the cue ball (or the 8-ball too early!) costs one of your
 * three cues. Racks get bonus multipliers as you clear them.
 */
const BALL_R = 12;
const POCKET_R = 20;

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  kind: 'cue' | 'solid' | 'eight';
  potted: boolean;
}

const SOLID_COLORS = ['#ffe600', '#ff3b3b', '#39ff14', '#ff9f1c', '#b14aed', '#00fff7', '#ff2079'];

export function PoolBallGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const PAD = 18; // cushion inset

  const balls = useRef<Ball[]>([]);
  const nextId = useRef(1);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const cues = useRef(3);
  const rack = useRef(1);
  const score = useRef(0);
  const doneRef = useRef(false);
  const [, redraw] = useState(0);

  const pockets = () => [
    { x: PAD, y: PAD },
    { x: W - PAD, y: PAD },
    { x: PAD, y: H / 2 },
    { x: W - PAD, y: H / 2 },
    { x: PAD, y: H - PAD },
    { x: W - PAD, y: H - PAD },
  ];

  const setupRack = () => {
    const cx = W / 2;
    const cy = H * 0.3;
    const gap = BALL_R * 2.2;
    const layout = [
      [0, 0],
      [-0.5, 1], [0.5, 1],
      [-1, 2], [0, 2], [1, 2],
      [-0.5, 3], [0.5, 3],
    ];
    balls.current = [
      { id: nextId.current++, x: W / 2, y: H * 0.75, vx: 0, vy: 0, color: '#e8e8f0', kind: 'cue', potted: false },
    ];
    layout.forEach(([ox, oy], i) => {
      const isEight = i === 4; // center of the diamond
      balls.current.push({
        id: nextId.current++,
        x: cx + ox * gap,
        y: cy - oy * gap * 0.9,
        vx: 0,
        vy: 0,
        color: isEight ? '#101018' : SOLID_COLORS[i % SOLID_COLORS.length],
        kind: isEight ? 'eight' : 'solid',
        potted: false,
      });
    });
  };

  useEffect(() => {
    cues.current = 3;
    rack.current = 1;
    score.current = 0;
    doneRef.current = false;
    api.setScore(0);
    api.setLives(3);
    setupRack();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const moving = () => balls.current.some((b) => !b.potted && (Math.abs(b.vx) > 6 || Math.abs(b.vy) > 6));

  const strike = () => {
    const d = drag.current;
    drag.current = null;
    if (!api.running || !d || doneRef.current || moving()) return;
    const cue = balls.current.find((b) => b.kind === 'cue' && !b.potted);
    if (!cue) return;
    const dx = d.sx - d.x;
    const dy = d.sy - d.y;
    const pull = Math.hypot(dx, dy);
    if (pull < 14) return;
    const power = Math.min(1.6, pull / 130) * H * 1.1;
    cue.vx = (dx / pull) * power;
    cue.vy = (dy / pull) * power;
    playSfx('brick');
    haptic.medium();
  };
  const strikeRef = useRef(strike);
  strikeRef.current = strike;

  const dragTo = (x: number, y: number, start: boolean) => {
    if (!api.running || moving()) return;
    if (start || !drag.current) drag.current = { x, y, sx: x, sy: y };
    else {
      drag.current.x = x;
      drag.current.y = y;
    }
  };
  const dragRef = useRef(dragTo);
  dragRef.current = dragTo;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => dragRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY, true),
      onPanResponderMove: (evt) => dragRef.current(evt.nativeEvent.locationX, evt.nativeEvent.locationY, false),
      onPanResponderRelease: () => strikeRef.current(),
      onPanResponderTerminate: () => strikeRef.current(),
    })
  );

  const loseCue = () => {
    cues.current -= 1;
    api.setLives(cues.current);
    playSfx('loseLife');
    haptic.heavy();
    if (cues.current <= 0) {
      doneRef.current = true;
      setTimeout(() => api.end({ score: score.current }), 600);
      return true;
    }
    return false;
  };

  useGameLoop(api.running, (dt) => {
    if (doneRef.current) return;
    const live = balls.current.filter((b) => !b.potted);

    // Integrate + friction
    for (const b of live) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - 0.75 * dt;
      b.vy *= 1 - 0.75 * dt;
      if (Math.abs(b.vx) < 6 && Math.abs(b.vy) < 6) {
        b.vx = 0;
        b.vy = 0;
      }
      // Cushions
      if (b.x < PAD + BALL_R) { b.x = PAD + BALL_R; b.vx = Math.abs(b.vx) * 0.9; }
      if (b.x > W - PAD - BALL_R) { b.x = W - PAD - BALL_R; b.vx = -Math.abs(b.vx) * 0.9; }
      if (b.y < PAD + BALL_R) { b.y = PAD + BALL_R; b.vy = Math.abs(b.vy) * 0.9; }
      if (b.y > H - PAD - BALL_R) { b.y = H - PAD - BALL_R; b.vy = -Math.abs(b.vy) * 0.9; }
    }

    // Ball-ball elastic collisions
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < BALL_R * 2 && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          const overlap = BALL_R * 2 - d;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;
          b.y += ny * overlap / 2;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel > 0) {
            a.vx -= nx * rel;
            a.vy -= ny * rel;
            b.vx += nx * rel;
            b.vy += ny * rel;
            if (rel > 40) playSfx('flip');
          }
        }
      }
    }

    // Pockets
    for (const b of live) {
      for (const pk of pockets()) {
        if ((b.x - pk.x) ** 2 + (b.y - pk.y) ** 2 < POCKET_R * POCKET_R) {
          b.potted = true;
          b.vx = 0;
          b.vy = 0;
          if (b.kind === 'solid') {
            score.current += 50 * rack.current;
            api.setScore(score.current);
            playSfx('point');
            haptic.medium();
          } else if (b.kind === 'cue') {
            if (loseCue()) return;
            // Respot the cue ball.
            b.potted = false;
            b.x = W / 2;
            b.y = H * 0.75;
          } else {
            // The 8-ball: glorious if the table is clear, a scratch if not.
            const solidsLeft = balls.current.some((q) => q.kind === 'solid' && !q.potted);
            if (solidsLeft) {
              if (loseCue()) return;
              b.potted = false;
              b.x = W / 2;
              b.y = H * 0.3;
            } else {
              score.current += 500 * rack.current;
              rack.current += 1;
              api.setScore(score.current);
              playSfx('win');
              haptic.success();
              setupRack();
            }
          }
          break;
        }
      }
    }
    redraw((n) => n + 1);
  });

  const cue = balls.current.find((b) => b.kind === 'cue' && !b.potted);

  return (
    <View style={{ flex: 1 }} {...pan.current.panHandlers}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Table felt + rails */}
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#3a2210' }} />
        <View style={{ position: 'absolute', left: PAD - 6, top: PAD - 6, right: PAD - 6, bottom: PAD - 6, borderRadius: 10, backgroundColor: '#0d4d2a' }} />
        {/* Pockets */}
        {pockets().map((pk, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: pk.x - POCKET_R,
              top: pk.y - POCKET_R,
              width: POCKET_R * 2,
              height: POCKET_R * 2,
              borderRadius: POCKET_R,
              backgroundColor: '#050508',
            }}
          />
        ))}
        {/* Aim line */}
        {drag.current && cue && !moving() && (() => {
          const dx = drag.current.sx - drag.current.x;
          const dy = drag.current.sy - drag.current.y;
          const d = Math.hypot(dx, dy) || 1;
          return Array.from({ length: 7 }, (_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: cue.x + (dx / d) * (i + 1) * 26 - 2,
                top: cue.y + (dy / d) * (i + 1) * 26 - 2,
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: colors.text,
                opacity: 0.7 - i * 0.08,
              }}
            />
          ));
        })()}
        {/* Balls */}
        {balls.current.map((b) =>
          b.potted ? null : (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                left: b.x - BALL_R,
                top: b.y - BALL_R,
                width: BALL_R * 2,
                height: BALL_R * 2,
                borderRadius: BALL_R,
                backgroundColor: b.color,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.4)',
              }}>
              <View style={{ position: 'absolute', left: BALL_R * 0.35, top: BALL_R * 0.25, width: BALL_R * 0.6, height: BALL_R * 0.45, borderRadius: BALL_R * 0.3, backgroundColor: 'rgba(255,255,255,0.45)' }} />
              {b.kind === 'eight' && (
                <View style={{ position: 'absolute', left: BALL_R - 4.5, top: BALL_R - 4.5, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#e8e8f0', alignItems: 'center', justifyContent: 'center' }}>
                  <PixelText size={6} color={'#101018'}>8</PixelText>
                </View>
              )}
            </View>
          )
        )}
        {/* Rack counter */}
        <PixelText size={11} color={colors.textDim} style={{ position: 'absolute', top: 4, alignSelf: 'center' }}>
          {`▸ ${rack.current}`}
        </PixelText>
      </View>
    </View>
  );
}
