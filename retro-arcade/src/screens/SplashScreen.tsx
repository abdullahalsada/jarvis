import React from 'react';
import { View } from 'react-native';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';

/** Simple branded splash shown while storage/auth state loads. */
export function SplashScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <PixelText size="title" color={colors.neonGreen} glow>
        RETRO ARCADE
      </PixelText>
      <PixelText size="label" color={colors.textDim} style={{ marginTop: spacing.m }}>
        Golden Age Games
      </PixelText>
    </View>
  );
}
