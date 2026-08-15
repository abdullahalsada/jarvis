import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';

/**
 * In-app loading screen (shown while fonts/language/session initialize):
 * the Retro Arcade mascot — a neon robot holding an arcade joystick panel —
 * gently bobbing and rocking above "Loading..." and a chunky segmented
 * progress bar, per the owner's reference. The bar is indeterminate (fills
 * in a loop) since startup is fast and unmeasured. Text is plain "LOADING"
 * because i18n isn't initialized yet on the first frames.
 */
const SEGMENTS = 10;

export function SplashScreen() {
  const [filled, setFilled] = useState(2);
  const bob = useRef(new Animated.Value(0)).current;
  const rock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setFilled((n) => (n >= SEGMENTS ? 2 : n + 1));
    }, 160);
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -10, duration: 520, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 520, useNativeDriver: true }),
      ])
    );
    // Slightly different period than the bob so the motion feels organic
    const rockLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(rock, { toValue: -1, duration: 700, useNativeDriver: true }),
      ])
    );
    bobLoop.start();
    rockLoop.start();
    return () => {
      clearInterval(timer);
      bobLoop.stop();
      rockLoop.stop();
    };
  }, [bob, rock]);

  const tilt = rock.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View style={{ transform: [{ translateY: bob }, { rotate: tilt }] }}>
        <Image
          source={require('../../assets/mascot.webp')}
          style={{ width: 168, height: 240 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
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
