import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';

/**
 * In-app loading screen (shown while fonts/language/session initialize):
 * the Retro Arcade mascot — the joystick from the app logo come to life,
 * sitting cross-legged and happily playing his controller. The mascot is
 * an animated WebP loop (expo-image plays it on iOS, Android, and web),
 * so the character genuinely moves
 * above "Loading..." and a chunky segmented progress bar. Brand-first
 * pacing: the bar fills exactly once, 0→100%, timed so it completes just
 * before the Gate's MIN_SPLASH_MS hold ends — the arcade opens on the
 * moment of completion. If boot runs long the bar simply rests at full.
 * Text is plain "LOADING" because i18n isn't initialized yet on the first
 * frames.
 */
const SEGMENTS = 10;
/** One segment per tick; SEGMENTS × interval lands just under the Gate's hold. */
const SEGMENT_MS = 200;

export function SplashScreen() {
  const [filled, setFilled] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setFilled((n) => Math.min(SEGMENTS, n + 1));
    }, SEGMENT_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* The mascot's own animation loop plays inside the WebP — no extra
          transforms needed. Rounded corners blend the clip into the screen. */}
      <Image
        source={require('../../assets/joystick-mascot.webp')}
        style={{ width: 200, height: 266, borderRadius: 20 }}
        contentFit="contain"
        autoplay
      />

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
        Orbit Oryx
      </PixelText>
    </View>
  );
}
