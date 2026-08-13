import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, pixelFont, type } from '../theme';

interface Props extends TextProps {
  size?: keyof typeof type | number;
  color?: string;
  glow?: boolean;
}

/** Monospace "pixel" text with optional neon glow, always large and legible. */
export function PixelText({ size = 'body', color = colors.text, glow, style, ...rest }: Props) {
  const fontSize = typeof size === 'number' ? size : type[size];
  const glowStyle: TextStyle = glow
    ? { textShadowColor: color, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } }
    : {};
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: pixelFont, fontSize, color, letterSpacing: 1 },
        glowStyle,
        style,
      ]}
    />
  );
}
