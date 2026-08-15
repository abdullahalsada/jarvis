import { useRef } from 'react';
import { PanResponder, type PanResponderInstance } from 'react-native';
import { I18nManager } from 'react-native';

export type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Swipe steering for direction games (Snake, Haunted Maze).
 * Fires on pointer *movement* past a small threshold — not on release — so
 * steering feels instant. Re-arms after each swipe so the player can chain
 * direction changes without lifting their finger.
 *
 * Directions are physical (screen-space), not RTL-mirrored: games are spatial,
 * so a swipe toward the left edge always means "left" in any language.
 */
export function useSwipe(onDir: (dir: Dir) => void): PanResponderInstance {
  // The responder is created once, so it must call the LATEST callback via a
  // ref — otherwise it forever holds the first render's closure, where the
  // game hadn't started yet (running === false) and every swipe is ignored.
  const cb = useRef(onDir);
  cb.current = onDir;
  const start = useRef({ x: 0, y: 0 });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        start.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
      },
      onPanResponderMove: (evt) => {
        const dx = evt.nativeEvent.pageX - start.current.x;
        const dy = evt.nativeEvent.pageY - start.current.y;
        const THRESHOLD = 24;
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          cb.current(dx > 0 ? 'right' : 'left');
        } else {
          cb.current(dy > 0 ? 'down' : 'up');
        }
        // Re-arm from the current point for chained swipes.
        start.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
      },
    })
  );
  return responder.current;
}

/**
 * Absolute-position slide control for paddle games. Reports the x position
 * (in the game area's coordinates) from the first touch onward — pointer-down,
 * not tap-release — so the paddle snaps to the finger immediately.
 *
 * locationX is relative to the view holding the responder, so entity layers
 * rendered inside it must set pointerEvents="none" or coordinates will jump.
 */
export function useSlideX(onX: (x: number) => void): PanResponderInstance {
  // Same latest-callback ref as useSwipe — see the note there.
  const cb = useRef(onX);
  cb.current = onX;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => cb.current(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => cb.current(evt.nativeEvent.locationX),
    })
  );
  return responder.current;
}

/** Physical-direction helper: unused for now but kept for RTL-aware UIs. */
export const layoutIsRTL = (): boolean => I18nManager.isRTL;
