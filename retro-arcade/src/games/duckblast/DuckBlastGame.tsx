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
 * Shooting gallery, staged exactly like the living-room classic: flat blue
 * sky, one big tree on the left, bushes on the right, and a strip of tall
 * grass the hound dives into. Ducks burst out flying jagged zig-zags — tap
 * to shoot (the screen flashes white, light-gun style). A hit duck freezes
 * in shock, then drops with a whistle and the dog holds it up; miss a whole
 * wave and he pops up laughing. The bottom panel tracks SHOT shells and the
 * 10-duck round — bag 6 to advance.
 */
const DUCK = 58;
const WAVE_SHELLS = 3;
const ROUND_DUCKS = 10;
const ROUND_QUOTA = 6;

interface Duck {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'fly' | 'shock' | 'fall';
  escaping: boolean;
  /** Seconds until the next random direction change. */
  turnT: number;
  age: number;
  flap: number;
  shockT: number;
}

type Phase = 'intro' | 'wave' | 'result';

export function DuckBlastGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height;
  const HUD_H = 58;
  /** Horizon line, matched to the painted background's grass line. */
  const GRASS_Y = Math.round(H * 0.77);

  const phase = useRef<Phase>('intro');
  const phaseT = useRef(0);
  const ducks = useRef<Duck[]>([]);
  const nextId = useRef(1);
  const round = useRef(1);
  const duckNum = useRef(0); // ducks launched this round
  const hits = useRef(0); // hits this round
  const waveHit = useRef(0); // hits in the current wave (for the dog's verdict)
  const results = useRef<('hit' | 'miss')[]>([]); // per-duck outcome, this round
  const shells = useRef(WAVE_SHELLS);
  const score = useRef(0);
  const dogX = useRef(-90);
  const crosshair = useRef<{ x: number; y: number; t: number } | null>(null);
  const gunFlash = useRef(0);
  const banner = useRef(0); // "ROUND n" splash timer
  const popups = useRef<{ id: number; x: number; y: number; t: number; txt: string }[]>([]);
  const [, redraw] = useState(0);

  useEffect(() => {
    phase.current = 'intro';
    phaseT.current = 0;
    ducks.current = [];
    round.current = 1;
    duckNum.current = 0;
    hits.current = 0;
    waveHit.current = 0;
    results.current = [];
    shells.current = WAVE_SHELLS;
    score.current = 0;
    dogX.current = -90;
    crosshair.current = null;
    gunFlash.current = 0;
    banner.current = 1.4;
    popups.current = [];
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
        shockT: 0,
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
    crosshair.current = { x, y, t: 0.4 };
    gunFlash.current = 0.07; // the light-gun screen blink
    playSfx('shoot');
    haptic.light();
    for (const d of ducks.current) {
      if (d.state !== 'fly') continue;
      const pad = DUCK * 0.35;
      if (x > d.x - pad && x < d.x + DUCK + pad && y > d.y - pad && y < d.y + DUCK + pad) {
        // Freeze in shock first — the drop comes a beat later.
        d.state = 'shock';
        d.shockT = 0.35;
        d.vx = 0;
        d.vy = 0;
        waveHit.current += 1;
        hits.current += 1;
        results.current.push('hit');
        const pts = 100 + 25 * (round.current - 1);
        score.current += pts;
        api.setScore(score.current);
        popups.current.push({ id: nextId.current++, x: d.x, y: d.y, t: 0.8, txt: `+${pts}` });
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
    if (crosshair.current) {
      crosshair.current.t -= dt;
      if (crosshair.current.t <= 0) crosshair.current = null;
    }
    if (gunFlash.current > 0) gunFlash.current -= dt;
    if (banner.current > 0) banner.current -= dt;
    for (const p of popups.current) {
      p.t -= dt;
      p.y -= 40 * dt;
    }
    popups.current = popups.current.filter((p) => p.t > 0);

    switch (phase.current) {
      case 'intro': {
        // The dog trots across the field, then dives into the grass.
        phaseT.current += dt;
        dogX.current = -90 + (W * 0.5 + 90) * Math.min(1, phaseT.current / 1.8);
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
          if (d.state === 'shock') {
            d.shockT -= dt;
            if (d.shockT <= 0) {
              d.state = 'fall';
              d.vy = H * 0.85;
            }
            continue;
          }
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
        for (const d of ducks.current) {
          if (d.escaping && d.y < -DUCK) results.current.push('miss');
        }
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
              results.current = [];
              banner.current = 1.4;
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

  const grassTiles = Math.ceil(W / 72) + 1;

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={(e) => shoot(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
      <View pointerEvents="none" style={{ flex: 1, overflow: 'hidden' }}>
        {/* Painted NES field scene: sky, tree, bushes, grass — one image */}
        <Image
          source={ACTORS.duckblast_bg}
          style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}
          resizeMode="cover"
        />
        {/* Ducks */}
        {ducks.current.map((d) => (
          <Image
            key={d.id}
            source={
              d.state === 'fall'
                ? ACTORS.duck_fall
                : d.state === 'shock'
                  ? ACTORS.duck_a
                  : Math.floor(d.flap / 0.12) % 2
                    ? ACTORS.duck_b
                    : ACTORS.duck_a
            }
            style={{
              position: 'absolute',
              left: d.x,
              top: d.y,
              width: DUCK,
              height: DUCK,
              opacity: d.state === 'shock' && Math.floor(d.shockT * 20) % 2 === 0 ? 0.5 : 1,
              transform: [
                { scaleX: d.state === 'fly' && d.vx < 0 ? -1 : 1 },
                { rotate: d.state === 'shock' ? '-18deg' : '0deg' },
              ],
            }}
          />
        ))}
        {/* The dog: sniffing in, then verdict after each wave (behind the tall grass) */}
        {phase.current === 'intro' && (
          <Image
            source={ACTORS.dog_sniff}
            style={{ position: 'absolute', left: dogX.current, top: GRASS_Y - 78, width: 96, height: 96, transform: [{ scaleX: -1 }] }}
          />
        )}
        {phase.current === 'result' && (
          <Image
            source={waveHit.current > 0 ? ACTORS.dog_duck : ACTORS.dog_laugh}
            style={{
              position: 'absolute',
              left: W / 2 - 48,
              top: GRASS_Y - 82 + Math.max(0, 20 - phaseT.current * 80),
              width: 96,
              height: 96,
            }}
          />
        )}
        {/* Tall grass strip — the dog's hideout, in front of him */}
        {Array.from({ length: grassTiles }, (_, i) => (
          <Image key={i} source={ACTORS.tall_grass} style={{ position: 'absolute', left: i * 72, top: GRASS_Y - 36, width: 72, height: 72 }} />
        ))}
        {/* Floating score popups */}
        {popups.current.map((p) => (
          <View key={p.id} style={{ position: 'absolute', left: p.x - 30, top: p.y, width: 120, opacity: Math.min(1, p.t * 2.5) }}>
            <PixelText size={13} color="#ffffff" glow>
              {p.txt}
            </PixelText>
          </View>
        ))}
        {/* Crosshair where you last fired */}
        {crosshair.current && (
          <View style={{ position: 'absolute', left: crosshair.current.x - 22, top: crosshair.current.y - 22, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', left: 4, top: 4, width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: colors.neonRed }} />
            <View style={{ position: 'absolute', left: 20, top: 0, width: 4, height: 12, backgroundColor: colors.neonRed }} />
            <View style={{ position: 'absolute', left: 20, top: 32, width: 4, height: 12, backgroundColor: colors.neonRed }} />
            <View style={{ position: 'absolute', left: 0, top: 20, width: 12, height: 4, backgroundColor: colors.neonRed }} />
            <View style={{ position: 'absolute', left: 32, top: 20, width: 12, height: 4, backgroundColor: colors.neonRed }} />
          </View>
        )}
        {/* ROUND banner */}
        {banner.current > 0 && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: H * 0.3, alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(10,10,18,0.75)', paddingHorizontal: 18, paddingVertical: 10, borderWidth: 2, borderColor: colors.neonMagenta }}>
              <PixelText size={16} color={colors.neonMagenta} glow>
                {`ROUND ${round.current}`}
              </PixelText>
            </View>
          </View>
        )}
        {/* Bottom status panel: SHOT shells + the 10-duck round tracker */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: HUD_H,
            backgroundColor: '#101018',
            borderTopWidth: 3,
            borderTopColor: colors.neonMagenta,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
          }}>
          <View>
            <PixelText size={8} color={colors.textDim}>
              SHOT
            </PixelText>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {Array.from({ length: WAVE_SHELLS }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 10,
                    height: 16,
                    marginRight: 4,
                    borderRadius: 3,
                    backgroundColor: i < shells.current ? colors.neonYellow : '#2a2a45',
                  }}
                />
              ))}
            </View>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <PixelText size={8} color={colors.textDim}>
              {`HIT ${hits.current}/${ROUND_QUOTA}`}
            </PixelText>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {Array.from({ length: ROUND_DUCKS }, (_, i) => {
                const r = results.current[i];
                return (
                  <View
                    key={i}
                    style={{
                      width: 14,
                      height: 16,
                      marginRight: 3,
                      borderWidth: 2,
                      borderColor: r === 'hit' ? colors.neonGreen : r === 'miss' ? colors.neonRed : '#2a2a45',
                      backgroundColor: r === 'hit' ? colors.neonGreen : r === 'miss' ? 'rgba(255,59,59,0.35)' : 'transparent',
                    }}
                  />
                );
              })}
            </View>
          </View>
          <PixelText size={12} color={colors.neonMagenta}>
            {`R${round.current}`}
          </PixelText>
        </View>
        {/* Light-gun screen flash */}
        {gunFlash.current > 0 && (
          <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: 'rgba(255,255,255,0.85)' }} />
        )}
      </View>
    </Pressable>
  );
}
