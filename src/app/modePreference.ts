/** Timed play has a stage clock and stars; relaxed play has neither. */
export type PlayMode = 'timed' | 'relaxed';

const preferenceKey = 'sweet-order-mode';

export function readModePreference(): PlayMode {
  try {
    return localStorage.getItem(preferenceKey) === 'relaxed' ? 'relaxed' : 'timed';
  } catch {
    return 'timed';
  }
}

export function saveModePreference(mode: PlayMode) {
  try {
    localStorage.setItem(preferenceKey, mode);
  } catch {
    // The choice still applies for the current session.
  }
}
