import { useEffect, useRef } from 'react';

/**
 * requestAnimationFrame game loop. Calls `update(dtSeconds)` every frame while
 * `running` is true. dt is clamped so backgrounding the app can't produce a
 * giant physics step.
 */
export function useGameLoop(running: boolean, update: (dt: number) => void): void {
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last > 0) {
        const dt = Math.min((now - last) / 1000, 1 / 20);
        updateRef.current(dt);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
}

/**
 * Fixed-interval tick for grid games (Snake, Haunted Maze). `intervalMs` may
 * change between renders (speed-up curves) without restarting the timer phase.
 */
export function useTick(running: boolean, intervalMs: number, onTick: () => void): void {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        tickRef.current();
        loop();
      }, intervalRef.current);
    };
    loop();
    return () => clearTimeout(timer);
  }, [running]);
}
