import { create } from 'zustand';

interface SmartUiStore {
  /** Outline the detected sensitive regions on the canvas (the "Show" toggle). */
  revealSensitive: boolean;
  /** The redaction suggestion was dismissed for the current capture. */
  redactBarDismissed: boolean;
  setRevealSensitive: (reveal: boolean) => void;
  dismissRedactBar: () => void;
  reset: () => void;
}

/** Transient UI state for the page-aware features (never saved or undoable). */
export const useSmartUi = create<SmartUiStore>((set) => ({
  revealSensitive: false,
  redactBarDismissed: false,
  setRevealSensitive: (reveal) => set({ revealSensitive: reveal }),
  dismissRedactBar: () => set({ redactBarDismissed: true, revealSensitive: false }),
  reset: () => set({ revealSensitive: false, redactBarDismissed: false }),
}));

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
