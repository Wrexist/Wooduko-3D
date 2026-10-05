/**
 * Haptics adapter. Web fallback uses `navigator.vibrate` (no-op on iOS Safari);
 * phase 7 routes these through `@capacitor/haptics` in the native build.
 */
export interface Haptics {
  setEnabled(on: boolean): void;
  pulse(pattern: number | readonly number[]): void;
}

export function webHaptics(): Haptics {
  let enabled = true;
  return {
    setEnabled: (on) => {
      enabled = on;
    },
    pulse: (pattern) => {
      if (!enabled) return;
      try {
        navigator.vibrate?.(typeof pattern === 'number' ? pattern : [...pattern]);
      } catch {
        // unsupported
      }
    },
  };
}
