import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Breakout-style: 6 rows of bricks, 3 balls, paddle-position deflection
 * (hitting near the edge sends the ball at a sharper angle — the core skill
 * of the original), ball speeds up every 4 bricks and on each new level.
 */
const ROWS = 6;
const COLS = 8;
const ROW_COLORS = [
  colors.neonRed,
  colors.neonOrange,
  colors.neonYellow,
  colors.neonGreen,
  colors.neonCyan,
  colors.neonPurple,
];

export function BrickBreakerGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR; // field above the ◀ ▶ buttons
  const PADDLE_W = W * 0.24;
  const PADDLE_H = 14;
  const BALL = 12;
  const BRICK_W = W / COLS;
  const BRICK_H = 22;
  const BRICK_TOP = 60;

  const paddle = useRef(W / 2);
  const ball = useRef({ x: W / 2, y: H * 0.6, vx: 0, vy: 0 });
  const bricks = useRef<boolean[]>([]);
  const lives = useRef(3);
  const score = useRef(0);
  const level = useRef(1);
  const speed = useRef(0);
  const serving = useRef(true);
  const [, redraw] = useState(0);

  const baseSpeed = () => H * 0.55 * (1 + (level.current - 1) * 0.15);

  const serve = () => {
    serving.current = true;
    ball.current = { x: paddle.current, y: H - 90, vx: 0, vy: 0 };
  };

  const resetBricks = () => {
    bricks.current = Array(ROWS * COLS).fill(true);
  };

  useEffect(() => {
    lives.current = 3;
    score.current = 0;
    level.current = 1;
    paddle.current = W / 2;
    api.setScore(0);
    api.setLives(3);
    resetBricks();
    serve();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const launch = () => {
    serving.current = false;
    speed.current = baseSpeed();
    const angle = -Math.PI / 3; // launch up-right at 60°
    ball.current.vx = Math.cos(angle) * speed.current * (Math.random() > 0.5 ? 1 : -1);
    ball.current.vy = Math.sin(angle) * speed.current;
  };

  const pan = useSlideX((x) => {
    paddle.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x));
    if (serving.current && api.running) launch();
  });

  // Hold ◀ ▶ to steer; pressing either also serves the ball.
  const held = useRef({ left: false, right: false });
  const padDown = (k: string) => {
    held.current[k as 'left' | 'right'] = true;
    if (serving.current && api.running) launch();
  };
  const padUp = (k: string) => {
    held.current[k as 'left' | 'right'] = false;
  };

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      paddle.current = Math.max(
        PADDLE_W / 2,
        Math.min(W - PADDLE_W / 2, paddle.current + dx * W * 0.95 * dt)
      );
    }
    const b = ball.current;
    if (serving.current) {
      b.x = paddle.current;
      redraw((n) => n + 1);
      return;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Walls
    if (b.x < BALL / 2) {
      b.x = BALL / 2;
      b.vx = Math.abs(b.vx);
      playSfx('bounce');
    } else if (b.x > W - BALL / 2) {
      b.x = W - BALL / 2;
      b.vx = -Math.abs(b.vx);
      playSfx('bounce');
    }
    if (b.y < BALL / 2) {
      b.y = BALL / 2;
      b.vy = Math.abs(b.vy);
      playSfx('bounce');
    }

    // Paddle: deflection angle depends on where the ball strikes.
    const paddleY = H - 60;
    if (
      b.vy > 0 &&
      b.y + BALL / 2 >= paddleY &&
      b.y + BALL / 2 <= paddleY + PADDLE_H + Math.abs(b.vy * dt) &&
      Math.abs(b.x - paddle.current) <= PADDLE_W / 2 + BALL / 2
    ) {
      const hit = (b.x - paddle.current) / (PADDLE_W / 2); // -1..1
      const angle = hit * (Math.PI / 3); // up to 60° off vertical
      b.vx = Math.sin(angle) * speed.current;
      b.vy = -Math.cos(angle) * speed.current;
      b.y = paddleY - BALL / 2;
      playSfx('bounce');
      haptic.light();
    }

    // Bricks
    const col = Math.floor(b.x / BRICK_W);
    const row = Math.floor((b.y - BRICK_TOP) / BRICK_H);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      const idx = row * COLS + col;
      if (bricks.current[idx]) {
        bricks.current[idx] = false;
        // Higher rows are worth more, like the original's scoring bands.
        score.current += (ROWS - row) * 10;
        api.setScore(score.current);
        playSfx('brick');
        haptic.light();
        b.vy = -b.vy;
        const remaining = bricks.current.filter(Boolean).length;
        if (remaining % 4 === 0) {
          speed.current *= 1.06;
          const mag = Math.hypot(b.vx, b.vy);
          b.vx = (b.vx / mag) * speed.current;
          b.vy = (b.vy / mag) * speed.current;
        }
        if (remaining === 0) {
          level.current += 1;
          playSfx('win');
          haptic.success();
          resetBricks();
          serve();
        }
      }
    }

    // Lost ball
    if (b.y > H + BALL) {
      lives.current -= 1;
      api.setLives(lives.current);
      playSfx('loseLife');
      haptic.heavy();
      if (lives.current <= 0) {
        api.end({ score: score.current });
        return;
      }
      serve();
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {bricks.current.map((alive, i) => {
          if (!alive) return null;
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: col * BRICK_W + 2,
                top: BRICK_TOP + row * BRICK_H + 2,
                width: BRICK_W - 4,
                height: BRICK_H - 4,
                backgroundColor: ROW_COLORS[row],
              }}
            />
          );
        })}
        <View
          style={{
            position: 'absolute',
            left: paddle.current - PADDLE_W / 2,
            top: H - 60,
            width: PADDLE_W,
            height: PADDLE_H,
            backgroundColor: colors.neonCyan,
            borderRadius: 3,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: ball.current.x - BALL / 2,
            top: ball.current.y - BALL / 2,
            width: BALL,
            height: BALL,
            backgroundColor: colors.text,
          }}
        />
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={padDown}
        onUp={padUp}
      />
    </View>
  );
}
