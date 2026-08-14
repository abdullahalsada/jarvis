import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { isLoaded } from 'expo-font';
import { colors, pixelFont, pixelFontFallback, type } from '../theme';

interface Props extends TextProps {
  size?: keyof typeof type | number;
  color?: string;
  glow?: boolean;
}

/** Pixel-font text with optional neon glow, always large and legible. */
export function PixelText({ size = 'body', color = colors.text, glow, style, ...rest }: Props) {
  const fontSize = typeof size === 'number' ? size : type[size];
  // iOS rejects unregistered font families, so fall back until the TTF loads.
  const family = isLoaded(pixelFont) ? pixelFont : pixelFontFallback;
  const glowStyle: TextStyle = glow
    ? { textShadowColor: color, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } }
    : {};
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: family, fontSize, color, letterSpacing: 1 },
        glowStyle,
        style,
      ]}
    />
  );
}
