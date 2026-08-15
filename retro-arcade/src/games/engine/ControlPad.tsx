import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';

/**
 * On-screen tap controls, arcade-cabinet style. Games render one of these in
 * a reserved strip under the play field; swipes/slides remain as alternates.
 * Buttons fire on press-DOWN (instant response) and report release so games
 * can implement hold-to-move.
 *
 * Layout heights are exported so games can size their field: subtract the
 * matching PAD_* constant from api.height.
 */
/**
 * Bottom lift keeps buttons comfortably above the screen edge (and the
 * iPhone home-indicator zone) — device feedback said flush-bottom buttons
 * were hard to reach.
 */
const LIFT = 44;

export const PAD_DPAD = 172 + LIFT;
export const PAD_DIAG = 128 + LIFT;
export const PAD_BAR = 84 + LIFT;

interface PadProps {
  onDown: (key: string) => void;
  onUp?: (key: string) => void;
}

function PadButton({
  label,
  keyName,
  onDown,
  onUp,
  size = 54,
  wide = false,
}: {
  label: string;
  keyName: string;
  onDown: (key: string) => void;
  onUp?: (key: string) => void;
  size?: number;
  wide?: boolean;
}) {
  // Native fires onPressIn on finger-down (the instant path). Some web
  // environments only deliver onPress; the fallback fires a short synthetic
  // down→up so buttons still respond there, deduped against the native path.
  const lastDown = React.useRef(0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={keyName}
      onPressIn={() => {
        lastDown.current = Date.now();
        onDown(keyName);
      }}
      onPressOut={() => onUp?.(keyName)}
      onPress={() => {
        if (Date.now() - lastDown.current < 500) return; // native already handled it
        onDown(keyName);
        setTimeout(() => onUp?.(keyName), 150);
      }}
      style={({ pressed }) => ({
        width: wide ? size * 1.6 : size,
        height: size,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: colors.neonCyan,
        backgroundColor: pressed ? colors.neonCyan : colors.bgRaised,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
      })}>
      <PixelText size={size * 0.42} color={colors.text}>
        {label}
      </PixelText>
    </Pressable>
  );
}

/** Classic cross D-pad: ▲ / ◀ ▶ / ▼. */
export function DPad({ onDown, onUp }: PadProps) {
  return (
    <View style={{ height: PAD_DPAD, alignItems: 'center', justifyContent: 'center', paddingBottom: LIFT }}>
      <PadButton label="▲" keyName="up" onDown={onDown} onUp={onUp} />
      <View style={{ flexDirection: 'row' }}>
        <PadButton label="◀" keyName="left" onDown={onDown} onUp={onUp} />
        <View style={{ width: 54, margin: 4 }} />
        <PadButton label="▶" keyName="right" onDown={onDown} onUp={onUp} />
      </View>
      <PadButton label="▼" keyName="down" onDown={onDown} onUp={onUp} />
    </View>
  );
}

/** Diagonal 2×2 pad for isometric hoppers: ↖ ↗ / ↙ ↘. */
export function DiagPad({ onDown, onUp }: PadProps) {
  return (
    <View style={{ height: PAD_DIAG, alignItems: 'center', justifyContent: 'center', paddingBottom: LIFT }}>
      <View style={{ flexDirection: 'row' }}>
        <PadButton label="↖" keyName="ul" onDown={onDown} onUp={onUp} />
        <PadButton label="↗" keyName="ur" onDown={onDown} onUp={onUp} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <PadButton label="↙" keyName="dl" onDown={onDown} onUp={onUp} />
        <PadButton label="↘" keyName="dr" onDown={onDown} onUp={onUp} />
      </View>
    </View>
  );
}

/** Horizontal button bar; pass the buttons a game needs (e.g. ◀ ▶ or ◀ ↻ ▶ ↓). */
export function PadBar({
  buttons,
  onDown,
  onUp,
  style,
}: PadProps & { buttons: { key: string; label: string; wide?: boolean }[]; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          height: PAD_BAR,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          paddingHorizontal: 8,
          paddingBottom: LIFT,
        },
        style,
      ]}>
      {buttons.map((b) => (
        <PadButton
          key={b.key}
          label={b.label}
          keyName={b.key}
          onDown={onDown}
          onUp={onUp}
          size={60}
          wide={b.wide}
        />
      ))}
    </View>
  );
}
