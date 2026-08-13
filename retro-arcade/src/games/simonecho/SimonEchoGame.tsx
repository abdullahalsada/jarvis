import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { type GameApi } from '../engine/GameShell';
import { playSfx, type SfxName } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Simon-style: four pads, each with its own tone (the classic Simon pitches).
 * The sequence grows one step per round and playback speeds up at rounds 6
 * and 13, matching the original toy's three speed tiers. One mistake ends
 * the game. Player taps register on press-down for instant feel.
 */
const PADS: { color: string; dimColor: string; sfx: SfxName }[] = [
  { color: '#2bff5c', dimColor: '#0e5c22', sfx: 'padGreen' },
  { color: '#ff4040', dimColor: '#5c1414', sfx: 'padRed' },
  { color: '#ffe600', dimColor: '#5c5300', sfx: 'padYellow' },
  { color: '#3ca0ff', dimColor: '#143a5c', sfx: 'padBlue' },
];

export function SimonEchoGame({ api }: { api: GameApi }) {
  const sequence = useRef<number[]>([]);
  const inputPos = useRef(0);
  const [lit, setLit] = useState<number | null>(null);
  const [accepting, setAccepting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // Playback speed tiers like the original Simon: faster from rounds 6 and 13.
  const stepMs = () =>
    sequence.current.length >= 13 ? 320 : sequence.current.length >= 6 ? 420 : 550;

  const playback = (addStep = true) => {
    setAccepting(false);
    inputPos.current = 0;
    if (addStep) sequence.current.push(Math.floor(Math.random() * 4));
    const ms = stepMs();
    sequence.current.forEach((pad, i) => {
      after(600 + i * ms, () => {
        setLit(pad);
        playSfx(PADS[pad].sfx);
      });
      after(600 + i * ms + ms * 0.6, () => setLit(null));
    });
    after(600 + sequence.current.length * ms, () => setAccepting(true));
  };

  const lastReset = useRef(-1);

  useEffect(() => {
    if (!api.running) return; // paused or pre-start; cleanup stopped the timers
    setLit(null);
    if (lastReset.current !== api.resetToken) {
      // Fresh game.
      lastReset.current = api.resetToken;
      sequence.current = [];
      api.setScore(0);
      playback();
    } else if (sequence.current.length > 0) {
      // Resumed from pause: replay the current round so nothing is missed.
      playback(false);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken, api.running]);

  const press = (pad: number) => {
    if (!api.running || !accepting) return;
    playSfx(PADS[pad].sfx);
    haptic.light();
    setLit(pad);
    after(200, () => setLit(null));

    if (pad !== sequence.current[inputPos.current]) {
      playSfx('wrong');
      // Score = longest sequence fully echoed.
      api.end({ score: sequence.current.length - 1 });
      return;
    }
    inputPos.current += 1;
    if (inputPos.current === sequence.current.length) {
      api.setScore(sequence.current.length);
      after(400, playback);
    }
  };

  const size = Math.min(api.width, api.height) * 0.42;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: size * 2 + spacing.m }}>
        {PADS.map((p, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            onPressIn={() => press(i)}
            style={{
              width: size,
              height: size,
              margin: spacing.m / 2,
              borderRadius: 8,
              backgroundColor: lit === i ? p.color : p.dimColor,
              borderWidth: 3,
              borderColor: p.color,
              // The classic Simon quadrant shape: round the outer corner.
              borderTopLeftRadius: i === 0 ? size : 8,
              borderTopRightRadius: i === 1 ? size : 8,
              borderBottomLeftRadius: i === 2 ? size : 8,
              borderBottomRightRadius: i === 3 ? size : 8,
            }}
          />
        ))}
      </View>
    </View>
  );
}
