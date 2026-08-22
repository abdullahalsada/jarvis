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
 * Shooting gallery, straight from the living-room floor of 1989: your hound
 * sniffs across the field and dives into the tall grass, then ducks burst
 * out flying jagged zig-zags. Tap a duck to shoot — three shells per wave.
 * Hit ducks tumble into the grass and the dog holds them up proudly; let a
 * wave escape and he pops up laughing at you instead. Bag 6 of every 10 to
 * reach the next, faster round.
 */
const DUCK = 46;
const WAVE_SHELLS = 3;
const ROUND_DUCKS = 10;
const ROUND_QUOTA = 6;

interface Duck {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'fly' | 'fall';
  escaping: boolean;
  /** Seconds until the next random direction change. */
  turnT: number;
  age: number;
  flap: number;
}

type Phase = 'intro' | 'wave' | 'result';

export function DuckBlastGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const GRASS_Y = H - 110;

  const phase = useRef<Phase>('intro');
  const phaseT = useRef(0);
  const ducks = useRef<Duck[]>([]);
  const nextId = useRef(1);
  const round = useRef(1);
  const duckNum = useRef(0); // ducks launched this round
  const hits = useRef(0); // hits this round
  const waveHit = useRef(0); // hits in the current wave (for the dog's verdict)
  const shells = useRef(WAVE_SHELLS);
  const score = useRef(0);
  const dogX = useRef(-60);
  const flash = useRef<{ x: number; y: number; t: number } | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    phase.current = 'intro';
    phaseT.current = 0;
    ducks.current = [];
    round.current = 1;
    duckNum.current = 0;
    hits.current = 0;
    waveHit.current = 0;
    shells.current = WAVE_SHELLS;
    score.current = 0;
    dogX.current = -60;
    flash.current = null;
    api.setScore(0);
    api.setLives(WAVE_SHELLS);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const duckSpeed = () => H * (0.26 + 0.05 * Math.min(6, round.current));

  const spawnWave = () => {
    const count = round.current >= 2 && duckNum.current < ROUND_DUCKS - 1 ? 2 : 1;
    ducks.current = Array.from({ length: count }, (_, i) => {
      const s = duckSpeed();
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      return {
        id: nextId.current++,
        x: W * (0.25 + Math.random() * 0.5) + i * 40 - 20,
        y: GRASS_Y - DUCK * 0.6,
        vx: Math.cos(ang) * s,
        vy: Math.sin(ang) * s,
        state: 'fly' as const,
        escaping: false,
        turnT: 0.4 + Math.random() * 0.5,
        age: 0,
        flap: 0,
      };
    });
    duckNum.current += count;
    waveHit.current = 0;
    shells.current = WAVE_SHELLS;
    api.setLives(WAVE_SHELLS);
    playSfx('flip');
  };

  const shoot = (x: number, y: number) => {
    if (!api.running || phase.current !== 'wave' || shells.current <= 0) return;
    shells.current -= 1;
    api.setLives(shells.current);
    flash.current = { x, y, t: 0.15 };
    playSfx('shoot');
    haptic.light();
    for (const d of ducks.current) {
      if (d.state !== 'fly') continue;
      const pad = DUCK * 0.35;
      if (x > d.x - pad && x < d.x + DUCK + pad && y > d.y - pad && y < d.y + DUCK + pad) {
        d.state = 'fall';
        d.vx = 0;
        d.vy = H * 0.85;
        waveHit.current += 1;
        hits.current += 1;
        score.current += 100 + 25 * (round.current - 1);
        api.setScore(score.current);
        playSfx('point');
        haptic.medium();
        break; // one duck per shell
      }
    }
    // Out of shells: whoever's still airborne heads for the horizon.
    if (shells.current === 0) {
      for (const d of ducks.current) {
        if (d.state === 'fly') {
          d.escaping = true;
          d.vx = 0;
          d.vy = -H * 0.9;
        }
      }
    }
  };

  useGameLoop(api.running, (dt) => {
    if (flash.current) {
      flash.current.t -= dt;
      if (flash.current.t <= 0) flash.current = null;
    }
    switch (phase.current) {
      case 'intro': {
        // The dog trots across the field, then dives into the grass.
        phaseT.current += dt;
        dogX.current = -60 + (W * 0.5 + 60) * Math.min(1, phaseT.current / 1.8);
        if (phaseT.current >= 2.2) {
          if (phaseT.current - dt < 2.2) playSfx('bounce'); // the leap
          phase.current = 'wave';
          phaseT.current = 0;
          spawnWave();
        }
        break;
      }
      case 'wave': {
        for (const d of ducks.current) {
          d.age += dt;
          d.flap += dt;
          if (d.state === 'fly' && !d.escaping) {
            // Jagged flight: a new random heading every half-ish second.
            d.turnT -= dt;
            if (d.turnT <= 0) {
              const s = duckSpeed();
              const ang = -Math.PI * Math.random(); // upward half-circle
              d.vx = Math.cos(ang) * s * (Math.random() < 0.5 ? 1 : -1);
              d.vy = Math.sin(ang) * s;
              d.turnT = 0.4 + Math.random() * 0.5;
            }
            // Overstay your welcome and you fly away for good.
            if (d.age > Math.max(4, 7 - round.current * 0.5)) {
              d.escaping = true;
              d.vx = 0;
              d.vy = -H * 0.9;
            }
          }
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          if (!d.escaping && d.state === 'fly') {
            if (d.x < 8) {
              d.x = 8;
              d.vx = Math.abs(d.vx);
            }
            if (d.x > W - DUCK - 8) {
              d.x = W - DUCK - 8;
              d.vx = -Math.abs(d.vx);
            }
            if (d.y < 8) {
              d.y = 8;
              d.vy = Math.abs(d.vy);
            }
            if (d.y > GRASS_Y - DUCK * 0.4) {
              d.y = GRASS_Y - DUCK * 0.4;
              d.vy = -Math.abs(d.vy);
            }
          }
        }
        const before = ducks.current.length;
        ducks.current = ducks.current.filter(
          (d) => !(d.state === 'fall' && d.y > GRASS_Y - DUCK * 0.3) && !(d.escaping && d.y < -DUCK)
        );
        if (before > ducks.current.length) playSfx('loseLife'); // the falling whistle / fly-away
        if (ducks.current.length === 0) {
          phase.current = 'result';
          phaseT.current = 0;
          if (waveHit.current > 0) {
            playSfx('match');
          } else {
            playSfx('wrong');
            haptic.heavy();
          }
        }
        break;
      }
      case 'result': {
        phaseT.current += dt;
        if (phaseT.current >= 1.2) {
          if (duckNum.current >= ROUND_DUCKS) {
            // Round over: quota decides whether the hunt continues.
            if (hits.current >= ROUND_QUOTA) {
              round.current += 1;
              duckNum.current = 0;
              hits.current = 0;
              playSfx('levelUp');
              phase.current = 'wave';
              phaseT.current = 0;
              spawnWave();
            } else {
              playSfx('gameOver');
              api.end({ score: score.current });
              return;
            }
          } else {
            phase.current = 'wave';
            phaseT.current = 0;
            spawnWave();
          }
        }
        break;
      }
    }
    redraw((n) => n + 1);
  });

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={(e) => shoot(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
      <View pointerEvents="none" style={{ flex: 1, overflow: 'hidden' }}>
        {/* Sky */}
        <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: '#4aa8f0' }} />
        {/* Tree on the left */}
        <Image source={ACTORS.leaf_tree} style={{ position: 'absolute', left: 10, top: GRASS_Y - 96, width: 100, height: 100 }} />
        {/* Grass */}
        <View style={{ position: 'absolute', left: 0, top: GRASS_Y, width: W, height: H - GRASS_Y, backgroundColor: '#1e9e2a' }} />
        <View style={{ position: 'absolute', left: 0, top: GRASS_Y, width: W, height: 10, backgroundColor: '#0f772b' }} />
        {/* Bushes on the right */}
        <View style={{ position: 'absolute', right: 14, top: GRASS_Y - 26, width: 64, height: 34, borderRadius: 16, backgroundColor: '#0f772b' }} />
        <View style={{ position: 'absolute', right: 54, top: GRASS_Y - 18, width: 44, height: 26, borderRadius: 12, backgroundColor: '#15913a' }} />
        {/* Ducks */}
        {ducks.current.map((d) => (
          <Image
            key={d.id}
            source={d.state === 'fall' ? ACTORS.duck_fall : Math.floor(d.flap / 0.12) % 2 ? ACTORS.duck_b : ACTORS.duck_a}
            style={{
              position: 'absolute',
              left: d.x,
              top: d.y,
              width: DUCK,
              height: DUCK,
              transform: [{ scaleX: d.state === 'fly' && d.vx < 0 ? -1 : 1 }],
            }}
          />
        ))}
        {/* The dog: sniffing in, then verdict after each wave */}
        {phase.current === 'intro' && (
          <Image source={ACTORS.dog_sniff} style={{ position: 'absolute', left: dogX.current, top: GRASS_Y - 52, width: 60, height: 60 }} />
        )}
        {phase.current === 'result' && (
          <Image
            source={waveHit.current > 0 ? ACTORS.dog_duck : ACTORS.dog_laugh}
            style={{
              position: 'absolute',
              left: W / 2 - 34,
              top: GRASS_Y - 58 + Math.max(0, 12 - phaseT.current * 60),
              width: 68,
              height: 68,
            }}
          />
        )}
        {/* Shot flash */}
        {flash.current && (
          <View
            style={{
              position: 'absolute',
              left: flash.current.x - 16,
              top: flash.current.y - 16,
              width: 32,
              height: 32,
              borderRadius: 16,
              borderWidth: 3,
              borderColor: '#ffffff',
              backgroundColor: 'rgba(255,255,255,0.35)',
            }}
          />
        )}
        {/* Round tracker */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 10, alignItems: 'center' }}>
          <PixelText size={10} color="#ffffff">
            {`R${round.current}  DUCK ${Math.min(duckNum.current, ROUND_DUCKS)}/${ROUND_DUCKS}  HIT ${hits.current}/${ROUND_QUOTA}`}
          </PixelText>
        </View>
      </View>
    </Pressable>
  );
}
