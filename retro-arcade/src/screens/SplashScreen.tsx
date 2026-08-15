import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';

/**
 * In-app loading screen (shown while fonts/language/session initialize):
 * the animated Retro Arcade mascot — an arcade cabinet with a face — bobbing
 * above "Loading..." and a chunky segmented progress bar, per the owner's
 * reference. The cabinet cycles pixel frames (eyes glance left/right, the
 * joystick wiggles) while the whole character bobs. The bar is indeterminate
 * (fills in a loop) since startup is fast and unmeasured. Text is plain
 * "LOADING" — i18n isn't initialized yet on the first frames.
 */
const SEGMENTS = 10;

const FRAMES = [
  require('../../assets/mascot-0.png'),
  require('../../assets/mascot-1.png'),
  require('../../assets/mascot-2.png'),
];
// center → left → center → right, like it's playing its own game
const FRAME_ORDER = [0, 1, 0, 2];

export function SplashScreen() {
  const [filled, setFilled] = useState(2);
  const [step, setStep] = useState(0);
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const barTimer = setInterval(() => {
      setFilled((n) => (n >= SEGMENTS ? 2 : n + 1));
    }, 160);
    const frameTimer = setInterval(() => {
      setStep((s) => (s + 1) % FRAME_ORDER.length);
    }, 240);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -8, duration: 420, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      clearInterval(barTimer);
      clearInterval(frameTimer);
      loop.stop();
    };
  }, [bob]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View style={{ transform: [{ translateY: bob }] }}>
        {/* All frames stay mounted so switching never flickers on first show */}
        <View style={{ width: 180, height: 180 }}>
          {FRAMES.map((src, i) => (
            <Image
              key={i}
              source={src}
              style={{
                position: 'absolute',
                width: 180,
                height: 180,
                opacity: FRAME_ORDER[step] === i ? 1 : 0,
              }}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      </Animated.View>

      <PixelText size="heading" color={colors.neonGreen} glow style={{ marginTop: spacing.l }}>
        LOADING...
      </PixelText>

      {/* Chunky segmented progress bar */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: spacing.l,
          padding: 4,
          borderWidth: 2,
          borderColor: colors.neonGreen,
          borderRadius: 8,
          gap: 4,
        }}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <View
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: i < filled ? colors.neonGreen : colors.bgCard,
            }}
          />
        ))}
      </View>

      <PixelText size="label" color={colors.textDim} style={{ marginTop: spacing.xl }}>
        Golden Age Games
      </PixelText>
    </View>
  );
}
