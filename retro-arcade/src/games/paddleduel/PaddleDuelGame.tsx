import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { useSlideX } from '../engine/controls';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Pong-style vs AI, portrait orientation (player at the bottom). Faithful
 * rules: serve alternates toward the last scorer's opponent, paddle-position
 * deflection, ball speeds up ~8% every return, first to 7 wins. The AI tracks
 * the ball with a capped speed so it stays beatable — its cap rises slightly
 * with your score to keep the difficulty curve of arcade originals.
 */
const WIN_SCORE = 7;

export function PaddleDuelGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const PADDLE_W = W * 0.24;
  const PADDLE_H = 14;
  const BALL = 12;
  const PLAYER_Y = H - 50;
  const AI_Y = 36;

  const player = useRef(W / 2);
  const aiX = useRef(W / 2);
  const ball = useRef({ x: W / 2, y: H / 2, vx: 0, vy: 0 });
  const scores = useRef({ player: 0, ai: 0 });
  const speed = useRef(0);
  const serveTimer = useRef(0);
  const [, redraw] = useState(0);

  const baseSpeed = () => H * 0.45;

  const serve = (towardPlayer: boolean) => {
    ball.current = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    speed.current = baseSpeed();
    serveTimer.current = 1; // one-second breather before each serve
    const angle = (Math.random() * 0.6 - 0.3) + Math.PI / 2; // mostly vertical
    ball.current.vx = Math.cos(angle) * speed.current * (Math.random() > 0.5 ? 1 : -1);
    ball.current.vy = Math.sin(angle) * speed.current * (towardPlayer ? 1 : -1);
  };

  useEffect(() => {
    scores.current = { player: 0, ai: 0 };
    player.current = W / 2;
    aiX.current = W / 2;
    api.setScore(0);
    serve(Math.random() > 0.5);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const pan = useSlideX((x) => {
    player.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x));
  });

  const held = useRef({ left: false, right: false });

  const deflect = (paddleX: number, up: boolean) => {
    const b = ball.current;
    const hit = (b.x - paddleX) / (PADDLE_W / 2);
    const angle = hit * (Math.PI / 3);
    speed.current *= 1.08; // rally speed-up
    b.vx = Math.sin(angle) * speed.current;
    b.vy = (up ? -1 : 1) * Math.cos(angle) * speed.current;
    playSfx('bounce');
  };

  useGameLoop(api.running, (dt) => {
    if (held.current.left || held.current.right) {
      const dx = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      player.current = Math.max(
        PADDLE_W / 2,
        Math.min(W - PADDLE_W / 2, player.current + dx * W * 0.95 * dt)
      );
    }
    const b = ball.current;

    if (serveTimer.current > 0) {
      serveTimer.current -= dt;
      redraw((n) => n + 1);
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Side walls
    if (b.x < BALL / 2) {
      b.x = BALL / 2;
      b.vx = Math.abs(b.vx);
      playSfx('bounce');
    } else if (b.x > W - BALL / 2) {
      b.x = W - BALL / 2;
      b.vx = -Math.abs(b.vx);
      playSfx('bounce');
    }

    // AI paddle: chases ball x, speed cap scales gently with player score.
    const aiSpeed = W * (0.35 + scores.current.player * 0.02);
    const dx = b.x - aiX.current;
    aiX.current += Math.sign(dx) * Math.min(Math.abs(dx), aiSpeed * dt);
    aiX.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, aiX.current));

    // Player paddle hit
    if (
      b.vy > 0 &&
      b.y + BALL / 2 >= PLAYER_Y &&
      b.y - BALL / 2 <= PLAYER_Y + PADDLE_H &&
      Math.abs(b.x - player.current) <= PADDLE_W / 2 + BALL / 2
    ) {
      b.y = PLAYER_Y - BALL / 2;
      deflect(player.current, true);
      haptic.light();
    }

    // AI paddle hit
    if (
      b.vy < 0 &&
      b.y - BALL / 2 <= AI_Y + PADDLE_H &&
      b.y + BALL / 2 >= AI_Y &&
      Math.abs(b.x - aiX.current) <= PADDLE_W / 2 + BALL / 2
    ) {
      b.y = AI_Y + PADDLE_H + BALL / 2;
      deflect(aiX.current, false);
    }

    // Goals
    if (b.y < -BALL) {
      scores.current.player += 1;
      api.setScore(scores.current.player);
      playSfx('point');
      haptic.medium();
      if (scores.current.player >= WIN_SCORE) {
        api.end({ score: scores.current.player, won: true });
        return;
      }
      serve(false);
    } else if (b.y > H + BALL) {
      scores.current.ai += 1;
      playSfx('loseLife');
      haptic.heavy();
      if (scores.current.ai >= WIN_SCORE) {
        api.end({ score: scores.current.player });
        return;
      }
      serve(true);
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Dashed center net, classic table-tennis style */}
        <View style={{ position: 'absolute', top: H / 2, left: 0, right: 0, height: 3, flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: 14 }, (_, i) => (
            <View key={i} style={{ width: 14, height: 3, backgroundColor: colors.border, borderRadius: 1.5 }} />
          ))}
        </View>
        <PixelText
          size="title"
          color={colors.textDim}
          style={{ position: 'absolute', top: H / 2 - 60, alignSelf: 'center' }}>
          {`${scores.current.ai}`}
        </PixelText>
        <PixelText
          size="title"
          color={colors.textDim}
          style={{ position: 'absolute', top: H / 2 + 20, alignSelf: 'center' }}>
          {`${scores.current.player}`}
        </PixelText>
        {/* Paddles: glossy rounded bars with a highlight strip */}
        <View
          style={{
            position: 'absolute',
            left: aiX.current - PADDLE_W / 2,
            top: AI_Y,
            width: PADDLE_W,
            height: PADDLE_H,
            backgroundColor: colors.neonMagenta,
            borderRadius: PADDLE_H / 2,
            overflow: 'hidden',
          }}>
          <View style={{ height: PADDLE_H * 0.35, marginHorizontal: 4, marginTop: 1.5, borderRadius: PADDLE_H * 0.2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: player.current - PADDLE_W / 2,
            top: PLAYER_Y,
            width: PADDLE_W,
            height: PADDLE_H,
            backgroundColor: colors.neonCyan,
            borderRadius: PADDLE_H / 2,
            overflow: 'hidden',
          }}>
          <View style={{ height: PADDLE_H * 0.35, marginHorizontal: 4, marginTop: 1.5, borderRadius: PADDLE_H * 0.2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
        </View>
        {/* Ball: glossy with shine dot */}
        <View
          style={{
            position: 'absolute',
            left: ball.current.x - BALL / 2,
            top: ball.current.y - BALL / 2,
            width: BALL,
            height: BALL,
            borderRadius: BALL / 2,
            backgroundColor: colors.text,
          }}>
          <View style={{ position: 'absolute', left: BALL * 0.15, top: BALL * 0.15, width: BALL * 0.3, height: BALL * 0.3, borderRadius: BALL * 0.15, backgroundColor: '#ffffff' }} />
        </View>
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'left', label: '◀', wide: true },
          { key: 'right', label: '▶', wide: true },
        ]}
        onDown={(k) => {
          held.current[k as 'left' | 'right'] = true;
        }}
        onUp={(k) => {
          held.current[k as 'left' | 'right'] = false;
        }}
      />
    </View>
  );
}
