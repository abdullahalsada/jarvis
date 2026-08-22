import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../../theme';
import { ACTORS } from '../engine/actors';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { PadBar, PAD_BAR } from '../engine/ControlPad';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Island runner in the spirit of the hardest cartridge you ever borrowed:
 * the kid in the red cap sprints through the jungle burning energy every
 * second — grab bananas to refuel or he collapses. Jump the infamous red
 * trip rocks, and throw axes at snails, cobras and dive-bombing birds.
 * Three lives; the island only gets faster.
 */
const KID = 56;

type Kind = 'banana' | 'heart' | 'rock' | 'snail' | 'cobra' | 'bird';

interface Item {
  id: number;
  kind: Kind;
  x: number; // world px
  y: number; // screen y (top)
  vx: number; // own velocity, world px/s (enemies that move)
  wob: number;
}

interface Axe {
  id: number;
  x: number; // world px
  y: number;
  spin: number;
}

const MAX_ENERGY = 100;

export function IslandKidGame({ api }: { api: GameApi }) {
  const W = api.width;
  const H = api.height - PAD_BAR;
  const GROUND = H - 64;
  const PX = W * 0.22;

  const camera = useRef(0);
  const py = useRef(GROUND - KID);
  const vy = useRef(0);
  const jumping = useRef(false);
  const runT = useRef(0);
  const items = useRef<Item[]>([]);
  const axes = useRef<Axe[]>([]);
  const nextId = useRef(1);
  const nextSpawn = useRef(0);
  const energy = useRef(MAX_ENERGY);
  const lives = useRef(3);
  const invuln = useRef(0);
  const bonus = useRef(0); // banana + kill points
  const milestone = useRef(1500);
  const [, redraw] = useState(0);

  useEffect(() => {
    camera.current = 0;
    py.current = GROUND - KID;
    vy.current = 0;
    jumping.current = false;
    runT.current = 0;
    items.current = [];
    axes.current = [];
    nextSpawn.current = W * 1.1;
    energy.current = MAX_ENERGY;
    lives.current = 3;
    invuln.current = 0;
    bonus.current = 0;
    milestone.current = 1500;
    api.setScore(0);
    api.setLives(3);
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const jump = () => {
    if (!api.running || jumping.current) return;
    jumping.current = true;
    vy.current = -H * 0.66;
    playSfx('bounce');
    haptic.light();
  };

  const throwAxe = () => {
    if (!api.running || axes.current.length >= 2) return;
    axes.current.push({
      id: nextId.current++,
      x: camera.current + PX + KID * 0.7,
      y: py.current + KID * 0.3,
      spin: 0,
    });
    playSfx('flip');
    haptic.light();
  };

  const onPad = (k: string) => (k === 'jump' ? jump() : throwAxe());

  useGameLoop(api.running, (dt) => {
    const dist = camera.current;
    const speed = W * (0.55 + Math.min(0.5, dist / 5000));
    camera.current += speed * dt;
    runT.current += dt;

    // Hunger: the island's real boss. Bananas are the only cure.
    energy.current -= (5.5 + dist / 3000) * dt;
    if (energy.current <= 0) {
      playSfx('gameOver');
      api.end({ score: Math.floor(camera.current * 0.1) + bonus.current });
      return;
    }

    // Jump physics.
    if (jumping.current) {
      vy.current += H * 1.7 * dt;
      py.current += vy.current * dt;
      if (py.current >= GROUND - KID) {
        py.current = GROUND - KID;
        vy.current = 0;
        jumping.current = false;
      }
    }
    if (invuln.current > 0) invuln.current -= dt;

    // Spawn the trail ahead: fruit rows, hazards, critters, rare hearts.
    while (nextSpawn.current < camera.current + W * 1.4) {
      const r = Math.random();
      const kind: Kind =
        r < 0.3 ? 'banana' : r < 0.37 ? 'heart' : r < 0.55 ? 'rock' : r < 0.71 ? 'snail' : r < 0.86 ? 'cobra' : 'bird';
      const y =
        kind === 'banana'
          ? GROUND - (Math.random() < 0.5 ? 44 : 116)
          : kind === 'heart'
            ? GROUND - 116
            : kind === 'bird'
              ? GROUND - 124
              : GROUND - 38;
      items.current.push({
        id: nextId.current++,
        kind,
        x: nextSpawn.current,
        y,
        vx: kind === 'snail' ? -W * 0.05 : kind === 'bird' ? -W * 0.22 : 0,
        wob: Math.random() * Math.PI * 2,
      });
      // Bananas often come in little floating rows, arcade-style.
      if (kind === 'banana' && Math.random() < 0.55) {
        for (let j = 1; j <= 1 + Math.floor(Math.random() * 2); j++) {
          items.current.push({ id: nextId.current++, kind, x: nextSpawn.current + j * 52, y, vx: 0, wob: 0 });
        }
      }
      nextSpawn.current += W * (0.42 + Math.random() * 0.35) * Math.max(0.62, 1 - dist / 12000);
    }

    for (const it of items.current) {
      it.x += it.vx * dt;
      if (it.kind === 'bird') {
        it.wob += dt * 3;
        it.y = GROUND - 120 + Math.sin(it.wob) * 34;
      }
    }
    items.current = items.current.filter((it) => it.x > camera.current - 80);

    // Axes fly, spin, and chop.
    for (const a of axes.current) {
      a.x += W * 0.95 * dt;
      a.spin += dt * 12;
    }
    axes.current = axes.current.filter((a) => a.x < camera.current + W + 40);
    for (const a of [...axes.current]) {
      const hit = items.current.find(
        (it) =>
          (it.kind === 'snail' || it.kind === 'cobra' || it.kind === 'bird') &&
          Math.abs(it.x - a.x) < 30 &&
          Math.abs(it.y + 18 - a.y) < 34
      );
      if (hit) {
        items.current = items.current.filter((it) => it !== hit);
        axes.current = axes.current.filter((x) => x !== a);
        bonus.current += 50;
        playSfx('brick');
        haptic.medium();
      }
    }

    // The kid vs the island.
    const kidL = camera.current + PX + 8;
    const kidR = camera.current + PX + KID - 8;
    const kidTop = py.current + 6;
    const kidBot = py.current + KID;
    for (const it of [...items.current]) {
      const half = it.kind === 'rock' ? 14 : 18;
      const itL = it.x - half;
      const itR = it.x + half;
      const itTop = it.y + (it.kind === 'rock' ? 14 : 4);
      const itBot = it.y + 36;
      if (kidR < itL || kidL > itR || kidBot < itTop || kidTop > itBot) continue;
      if (it.kind === 'banana') {
        items.current = items.current.filter((q) => q !== it);
        energy.current = Math.min(MAX_ENERGY, energy.current + 26);
        bonus.current += 20;
        playSfx('coin');
        haptic.light();
        continue;
      }
      if (it.kind === 'heart') {
        items.current = items.current.filter((q) => q !== it);
        energy.current = Math.min(MAX_ENERGY, energy.current + 40);
        if (lives.current < 3) {
          lives.current += 1;
          api.setLives(lives.current);
        }
        bonus.current += 50;
        playSfx('powerUp');
        haptic.medium();
        continue;
      }
      if (invuln.current > 0) continue;
      // Tripped or bitten: lose a life, flash invulnerable.
      items.current = items.current.filter((q) => q !== it);
      lives.current -= 1;
      api.setLives(lives.current);
      invuln.current = 1.4;
      playSfx(it.kind === 'rock' ? 'wrong' : 'loseLife');
      haptic.heavy();
      if (lives.current <= 0) {
        playSfx('gameOver');
        api.end({ score: Math.floor(camera.current * 0.1) + bonus.current });
        return;
      }
    }

    if (camera.current > milestone.current) {
      milestone.current += 1500;
      playSfx('levelUp');
    }
    api.setScore(Math.floor(camera.current * 0.1) + bonus.current);
    redraw((n) => n + 1);
  });

  // Deterministic parallax layers: fixed world slots, pseudo-random sizes.
  const layer = (factor: number, spacing: number, count: number) => {
    const shift = (camera.current * factor) % spacing;
    const base = Math.floor((camera.current * factor) / spacing);
    return Array.from({ length: count }, (_, i) => ({ key: base + i, x: i * spacing - shift }));
  };
  // Painted jungle backdrop scrolls at half speed; alternate tiles are
  // mirrored so the seam always lines up (ping-pong tiling).
  const BG_W = Math.ceil(H * 1.72);
  const bgShift = (camera.current * 0.5) % BG_W;
  const bgBase = Math.floor((camera.current * 0.5) / BG_W);
  const bgTiles = Array.from({ length: Math.ceil(W / BG_W) + 2 }, (_, i) => ({
    key: bgBase + i,
    x: i * BG_W - bgShift,
    mirrored: (bgBase + i) % 2 === 1,
  }));
  const soilTiles = layer(1, 44, Math.ceil(W / 44) + 2);
  const groundDeco = layer(1, 140, Math.ceil(W / 140) + 2).map((t) => ({
    ...t,
    kind: (t.key * 7919) % 4,
    x: t.x + ((t.key * 53) % 60),
  }));

  const blink = invuln.current > 0 && Math.floor(invuln.current * 10) % 2 === 0;
  const energyPct = Math.max(0, energy.current) / MAX_ENERGY;

  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ flex: 1, overflow: 'hidden' }}>
        {/* Painted jungle backdrop: trunks + canopy + sky, scrolling at half speed */}
        {bgTiles.map((t) => (
          <Image
            key={t.key}
            source={ACTORS.islandkid_bg}
            resizeMode="stretch"
            style={{
              position: 'absolute',
              left: t.x,
              top: 0,
              width: BG_W,
              height: GROUND + 8,
              transform: [{ scaleX: t.mirrored ? -1 : 1 }],
            }}
          />
        ))}
        {/* Ground platform: grass lip over chunky tiled soil */}
        <View style={{ position: 'absolute', left: 0, top: GROUND, width: W, height: H - GROUND, backgroundColor: '#5e3d1c' }} />
        {soilTiles.map((t) => (
          <Image key={t.key} source={ACTORS.soil_block} style={{ position: 'absolute', left: t.x, top: GROUND + 12, width: 44, height: 44 }} />
        ))}
        {soilTiles.map((t) => (
          <Image key={`s${t.key}`} source={ACTORS.soil_block} style={{ position: 'absolute', left: t.x + 22, top: GROUND + 52, width: 44, height: 44 }} />
        ))}
        <View style={{ position: 'absolute', left: 0, top: GROUND, width: W, height: 14, backgroundColor: '#1e9e2a' }} />
        <View style={{ position: 'absolute', left: 0, top: GROUND + 12, width: W, height: 4, backgroundColor: '#15913a' }} />
        {/* Grass tufts, flowers and little bushes rushing past */}
        {groundDeco.map((t) => (
          <Image
            key={t.key}
            source={t.kind === 0 ? ACTORS.flower_red : t.kind === 1 ? ACTORS.bush_round : ACTORS.grass_tuft}
            style={{
              position: 'absolute',
              left: t.x,
              top: t.kind === 1 ? GROUND - 40 : GROUND - 32,
              width: t.kind === 1 ? 46 : 40,
              height: t.kind === 1 ? 46 : 40,
            }}
          />
        ))}
        {/* Items */}
        {items.current.map((it) => {
          const sx = it.x - camera.current;
          if (sx < -60 || sx > W + 60) return null;
          const src =
            it.kind === 'banana'
              ? ACTORS.banana
              : it.kind === 'heart'
                ? ACTORS.heart_red
                : it.kind === 'rock'
                  ? ACTORS.rock_red
                  : it.kind === 'snail'
                    ? ACTORS.snail_bug
                    : it.kind === 'cobra'
                      ? ACTORS.cobra
                      : ACTORS.bird;
          return (
            <Image
              key={it.id}
              source={src}
              style={{
                position: 'absolute',
                left: sx - 22,
                top: it.y - 4,
                width: 44,
                height: 44,
                transform: [{ scaleX: it.kind === 'bird' ? -1 : 1 }],
              }}
            />
          );
        })}
        {/* Axes */}
        {axes.current.map((a) => (
          <Image
            key={a.id}
            source={ACTORS.axe_gold}
            style={{
              position: 'absolute',
              left: a.x - camera.current - 14,
              top: a.y - 14,
              width: 28,
              height: 28,
              transform: [{ rotate: `${Math.floor(a.spin * 60)}deg` }],
            }}
          />
        ))}
        {/* The kid */}
        <Image
          source={jumping.current || Math.floor(runT.current / 0.12) % 2 === 0 ? ACTORS.island_kid_a : ACTORS.island_kid_b}
          style={{
            position: 'absolute',
            left: PX,
            top: py.current,
            width: KID,
            height: KID,
            opacity: blink ? 0.35 : 1,
          }}
        />
        {/* Energy bar */}
        <View style={{ position: 'absolute', left: 12, top: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,10,18,0.55)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
          <PixelText size={9} color="#ffffff">
            FOOD
          </PixelText>
          <View style={{ flexDirection: 'row', marginLeft: 6 }}>
            {Array.from({ length: 14 }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 9,
                  height: 12,
                  marginRight: 2,
                  backgroundColor: i / 14 < energyPct ? (energyPct < 0.3 ? colors.neonRed : colors.neonYellow) : 'rgba(0,0,0,0.35)',
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <PadBar
        buttons={[
          { key: 'jump', label: '▲', wide: true },
          { key: 'axe', label: '🪓', wide: true },
        ]}
        onDown={onPad}
      />
    </View>
  );
}
