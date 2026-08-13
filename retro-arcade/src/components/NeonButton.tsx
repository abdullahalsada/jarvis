import React from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import { colors, spacing, touchTarget } from '../theme';
import { PixelText } from './PixelText';
import { playSfx } from '../audio/sfx';

interface Props {
  label: string;
  onPress: () => void;
  color?: string;
  /** Filled = solid neon background; outline = dark with neon border. */
  variant?: 'filled' | 'outline';
  disabled?: boolean;
  style?: ViewStyle;
}

/** Big high-contrast button sized for older hands (min height 56). */
export function NeonButton({
  label,
  onPress,
  color = colors.neonGreen,
  variant = 'filled',
  disabled,
  style,
}: Props) {
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        playSfx('select');
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: touchTarget,
          paddingHorizontal: spacing.l,
          paddingVertical: spacing.m,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: filled ? color : colors.bgRaised,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <PixelText size="button" color={filled ? colors.bg : color} style={{ fontWeight: 'bold' }}>
        {label}
      </PixelText>
    </Pressable>
  );
}
