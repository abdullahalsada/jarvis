import * as Haptics from 'expo-haptics';
import { getSettings } from './context/SettingsContext';

/** Haptic feedback on key game events, honoring the settings toggle. */
export const haptic = {
  /** Small tick: eat food, brick hit, card flip. */
  light(): void {
    if (!getSettings().haptics) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  /** Medium thump: scoring a point, power-up. */
  medium(): void {
    if (!getSettings().haptics) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  /** Losing a life / crash. */
  heavy(): void {
    if (!getSettings().haptics) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  /** Level clear / win. */
  success(): void {
    if (!getSettings().haptics) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
