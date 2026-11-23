import { useEffect, useReducer } from 'react';
import { createSession, MAX_TRAY_CLEARS, reduceSession } from '../game/session';
import { UNLIMITED_HEARTS_FOR_TESTING, UNLOCK_ALL_STAGES_FOR_TESTING } from '../game/constants';
import { isStageId } from '../game/stages';
import { parseHearts } from '../game/hearts';

const progressKey = 'sweet-order-progress-v1';

function loadSession() {
  const session = createSession(UNLOCK_ALL_STAGES_FOR_TESTING, UNLIMITED_HEARTS_FOR_TESTING);
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) ?? 'null');
    if (!saved) return session;
    // v2 stores stars as one character per stage ("3102…" = stage 1 has 3 stars); v1 used an id → stars object.
    // From progressVersion 3, "-" is an unplayed stage and "0" one cleared only in relaxed mode; before that "0" was unplayed.
    const entries: Array<[number, unknown]> = typeof saved.stars === 'string'
      ? Array.from(saved.stars as string, (digit, index) => [index + 1, digit === '-' ? NaN : Number(digit)])
      : saved.stars && typeof saved.stars === 'object' ? Object.entries(saved.stars).map(([key, value]) => [Number(key), value]) : [];
    const lowest = saved.progressVersion === 3 ? 0 : 1;
    for (const [id, stars] of entries) {
      if (isStageId(id) && typeof stars === 'number' && Number.isInteger(stars) && stars >= lowest && stars <= 3) {
        session.stars[id] = stars;
      }
    }
    if (Number.isSafeInteger(saved.score) && saved.score >= 0) session.score = saved.score;
    // Saves from before the three-clear start (no clearsVersion) begin again with the new pool.
    const hearts = parseHearts(saved.hearts);
    if (hearts) session.hearts = hearts;
    if (Array.isArray(saved.rewardedStages)) session.rewardedStages = saved.rewardedStages.filter((id: unknown) => typeof id === 'number' && isStageId(id));
    if (saved.clearsVersion === 2 && Number.isSafeInteger(saved.trayClears) && saved.trayClears >= 0) session.trayClears = Math.min(MAX_TRAY_CLEARS, saved.trayClears);
  } catch {
    return session;
  }
  return session;
}

export function encodeStars(stars: Record<number, number>): string {
  const ids = Object.keys(stars).map(Number).filter(id => isStageId(id) && stars[id]! >= 0);
  const length = ids.length ? Math.max(...ids) : 0;
  return Array.from({ length }, (_, index) => String(stars[index + 1] ?? '-')).join('');
}

export function useGame() {
  const [session, dispatch] = useReducer(reduceSession, undefined, loadSession);
  const { stars, score, trayClears, hearts, rewardedStages } = session;
  useEffect(() => {
    try {
      localStorage.setItem(progressKey, JSON.stringify({ stars: encodeStars(stars), score, trayClears, hearts, rewardedStages, clearsVersion: 2, progressVersion: 3 }));
    } catch {
      // Play can continue when browser storage is unavailable.
    }
  }, [stars, score, trayClears, hearts, rewardedStages]);
  return { session, dispatch };
}
