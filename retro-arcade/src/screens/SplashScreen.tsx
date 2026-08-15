import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';

/**
 * In-app loading screen (shown while fonts/language/session initialize),
 * styled after the owner's reference: mascot + "Loading..." + a chunky
 * segmented progress bar on dark. The bar is indeterminate (fills in a
 * loop) since startup is fast and unmeasured. Text is deliberately plain
 * "LOADING" — i18n isn't initialized yet on the first frames.
 */
const SEGMENTS = 10;

export function SplashScreen() {
  const [filled, setFilled] = useState(2);
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setFilled((n) => (n >= SEGMENTS ? 2 : n + 1));
    }, 160);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -8, duration: 420, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      clearInterval(timer);
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
        <Image
          source={require('../../assets/mascot.png')}
          style={{ width: 180, height: 180 }}
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
