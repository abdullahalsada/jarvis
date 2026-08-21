import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * The claw machine, faithfully heartbreaking: the claw sweeps side to
 * side — tap DROP to send it down over a prize. A clean center grab
 * holds; an off-center grab can slip halfway up, just like real life.
 * Golden prizes are worth triple. Five tokens per game; every grab
 * earns a bonus token, and the claw sweeps faster as you collect.
 */
const PRIZE_SPRITES = [ACTORS.frog, ACTORS.hen, ACTORS.pumpkin, ACTORS.bird, ACTORS.pigeon] as const;

interface Prize {
  id: number;
  x: number;
  sprite: number;
  golden: boolean;
  taken: boolean;
}

type Phase = 'sweep' | 'drop' | 'grab' | 'lift' | 'carry' | 'deliver';

export function ClawMachineGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const FLOOR = H - 120;
  const CLAW_TOP = 64;
  const PSIZE = 52;
  const CHUTE_X = W * 0.12;

  const clawX = useRef(W * 0.2);
  const clawY = useRef(CLAW_TOP);
  const dir = useRef<1 | -1>(1);
  const phase = useRef<Phase>('sweep');
  const held = useRef<Prize | null>(null);
  const slipAt = useRef(0); // y where an off-center grab lets go (0 = safe)
  const prizes = useRef<Prize[]>([]);
  const nextId = useRef(1);
  const tokens = useRef(5);
  const grabs = useRef(0);
  const score = useRef(0);
  const [, redraw] = useState(0);

  const layoutPrizes = () => {
    const n = 5;
    prizes.current = Array.from({ length: n }, (_, i) => ({
      id: nextId.current++,
      x: W * 0.28 + (i * W * 0.62) / n + Math.random() * 8,
      sprite: Math.floor(Math.random() * PRIZE_SPRITES.length),
      golden: Math.random() < 0.2,
      taken: false,
    }));
  };

  useEffect(() => {
    clawX.current = W * 0.2;
    clawY.current = CLAW_TOP;
    dir.current = 1;
    phase.current = 'sweep';
    held.current = null;
    tokens.current = 5;
    grabs.current = 0;
    score.current = 0;
    api.setScore(0);
    api.setLives(5);
    layoutPrizes();
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const drop = () => {
    if (!api.running || phase.current !== 'sweep' || tokens.current <= 0) return;
    tokens.current -= 1;
    api.setLives(tokens.current);
    phase.current = 'drop';
    playSfx('select');
    haptic.light();
  };

  useGameLoop(api.running, (dt) => {
    const speed = W * (0.3 + grabs.current * 0.05);
    switch (phase.current) {
      case 'sweep': {
        clawX.current += dir.current * speed * dt;
        if (clawX.current > W - 40) {
          clawX.current = W - 40;
          dir.current = -1;
        }
        if (clawX.current < W * 0.22) {
          clawX.current = W * 0.22;
          dir.current = 1;
        }
        break;
      }
      case 'drop': {
        clawY.current += H * 0.55 * dt;
        if (clawY.current >= FLOOR - PSIZE * 0.5) {
          clawY.current = FLOOR - PSIZE * 0.5;
          phase.current = 'grab';
          // Judge the grab: nearest untaken prize and how centered we are.
          let best: Prize | null = null;
          let bestD = Infinity;
          for (const p of prizes.current) {
            if (p.taken) continue;
            const d = Math.abs(p.x - clawX.current);
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          if (best && bestD < PSIZE * 0.55) {
            held.current = best;
            best.taken = true;
            // Perfect center holds; off-center may slip on the way up.
            const offset = bestD / (PSIZE * 0.55); // 0..1
            slipAt.current = offset > 0.55 && Math.random() < offset ? CLAW_TOP + (FLOOR - CLAW_TOP) * (0.25 + Math.random() * 0.4) : 0;
            playSfx('brick');
            haptic.medium();
          } else {
            playSfx('wrong');
            haptic.light();
          }
        }
        break;
      }
      case 'grab': {
        phase.current = 'lift';
        break;
      }
      case 'lift': {
        clawY.current -= H * 0.4 * dt;
        // The slip: the heartbreak moment.
        if (held.current && slipAt.current > 0 && clawY.current <= slipAt.current) {
          held.current.taken = false;
          held.current = null;
          slipAt.current = 0;
          playSfx('loseLife');
          haptic.heavy();
        }
        if (clawY.current <= CLAW_TOP) {
          clawY.current = CLAW_TOP;
          phase.current = held.current ? 'carry' : 'deliver';
        }
        break;
      }
      case 'carry': {
        clawX.current -= speed * 1.2 * dt;
        if (clawX.current <= CHUTE_X) {
          clawX.current = CHUTE_X;
          // Prize secured!
          const p = held.current!;
          held.current = null;
          grabs.current += 1;
          tokens.current += 1; // every win refunds a token
          api.setLives(tokens.current);
          score.current += p.golden ? 300 : 100;
          api.setScore(score.current);
          playSfx('win');
          haptic.success();
          // Restock when the pit runs low.
          if (prizes.current.filter((q) => !q.taken).length <= 1) layoutPrizes();
          phase.current = 'deliver';
        }
        break;
      }
      case 'deliver': {
        phase.current = 'sweep';
        if (tokens.current <= 0 && !held.current) {
          playSfx('gameOver');
          api.end({ score: score.current });
          return;
        }
        break;
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {/* Cabinet */}
        <View style={{ position: 'absolute', left: 4, top: 4, right: 4, bottom: 70, borderWidth: 4, borderColor: colors.neonMagenta, borderRadius: 14, backgroundColor: '#160c22' }} />
        {/* Glass shine */}
        <View style={{ position: 'absolute', left: 20, top: 24, width: 8, height: H * 0.4, backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ rotate: '8deg' }] }} />
        {/* Rail */}
        <View style={{ position: 'absolute', left: 12, top: CLAW_TOP - 14, right: 12, height: 8, backgroundColor: '#4a4a6a', borderRadius: 4 }} />
        {/* Chute */}
        <View style={{ position: 'absolute', left: CHUTE_X - 26, top: FLOOR + PSIZE * 0.5, width: 52, height: 26, backgroundColor: '#0a0a12', borderWidth: 2, borderColor: colors.neonYellow, borderRadius: 4 }} />
        {/* Prize floor */}
        <View style={{ position: 'absolute', left: 8, top: FLOOR + PSIZE * 0.55, right: 8, height: 10, backgroundColor: '#241640' }} />
        {/* Prizes */}
        {prizes.current.map((p) =>
          p.taken && held.current !== p ? null : (
            <View key={p.id}>
              <Image
                source={PRIZE_SPRITES[p.sprite]}
                style={{
                  position: 'absolute',
                  left: (held.current === p ? clawX.current : p.x) - PSIZE / 2,
                  top: (held.current === p ? clawY.current : FLOOR - PSIZE * 0.4) - PSIZE * 0.1,
                  width: PSIZE,
                  height: PSIZE,
                }}
              />
              {p.golden && (
                <View
                  style={{
                    position: 'absolute',
                    left: (held.current === p ? clawX.current : p.x) - PSIZE / 2 - 4,
                    top: (held.current === p ? clawY.current : FLOOR - PSIZE * 0.4) - PSIZE * 0.1 - 4,
                    width: PSIZE + 8,
                    height: PSIZE + 8,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: colors.neonYellow,
                  }}
                />
              )}
            </View>
          )
        )}
        {/* Claw: cable + arms */}
        <View style={{ position: 'absolute', left: clawX.current - 1, top: CLAW_TOP - 10, width: 2, height: clawY.current - CLAW_TOP + 10, backgroundColor: '#9a9ab5' }} />
        <View
          style={{
            position: 'absolute',
            left: clawX.current - 16,
            top: clawY.current - 4,
            width: 14,
            height: 22,
            borderLeftWidth: 4,
            borderBottomWidth: 4,
            borderColor: colors.neonCyan,
            borderBottomLeftRadius: 10,
            transform: [{ rotate: phase.current === 'grab' || held.current ? '-14deg' : '8deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: clawX.current + 2,
            top: clawY.current - 4,
            width: 14,
            height: 22,
            borderRightWidth: 4,
            borderBottomWidth: 4,
            borderColor: colors.neonCyan,
            borderBottomRightRadius: 10,
            transform: [{ rotate: phase.current === 'grab' || held.current ? '14deg' : '-8deg' }],
          }}
        />
      </View>
      {/* DROP button */}
      <Pressable
        onPressIn={drop}
        style={({ pressed }) => ({
          position: 'absolute',
          bottom: 12,
          alignSelf: 'center',
          width: 130,
          height: 50,
          borderRadius: 25,
          borderWidth: 3,
          borderColor: colors.neonRed,
          backgroundColor: pressed || phase.current !== 'sweep' ? colors.neonRed : '#1b0d12',
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <PixelText size={14} color={phase.current !== 'sweep' ? colors.bg : colors.neonRed}>
          ▼▼▼
        </PixelText>
      </Pressable>
    </View>
  );
}
