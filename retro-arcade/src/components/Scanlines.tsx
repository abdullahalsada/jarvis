import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

/**
 * CRT scanline overlay: thin dark lines every 4px. Pure Views, pointerEvents
 * off so gameplay touches pass straight through. Toggleable in Settings.
 */
export const Scanlines = React.memo(function Scanlines({ height }: { height: number }) {
  const { scanlines } = useSettings();
  if (!scanlines || height <= 0) return null;
  const lines = Math.ceil(height / 4);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: lines }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: i * 4,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        />
      ))}
    </View>
  );
});
