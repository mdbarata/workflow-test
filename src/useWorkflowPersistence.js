import { useEffect, useRef } from 'react';

// ── Single versioned key for the whole app's session state ──
// Everything here stays in the browser's localStorage — nothing is sent
// over the network, so it's safe for sensitive workflow data.
const STATE_KEY = 'workflow_app_state_v1';
const SAVE_DEBOUNCE_MS = 400;

export const loadAppState = () => {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearAppState = () => {
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
};

// Debounced auto-save: call on every render with the latest state slice.
// Saves silently in the background, no UI feedback by design.
export const useAutoSave = (state) => {
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
      } catch {
        // localStorage full or unavailable (e.g. private mode quota) — fail silently
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [state]);
};