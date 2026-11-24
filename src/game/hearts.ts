// Hearts gate stage attempts: each attempt costs one heart and a clear gives it back.
// Hearts refill one every 30 minutes while there are fewer than five, and rewards (queue hearts,
// bonus stages, ads) add straight to them, never past five.
// While a premium pass runs, hearts refill twice as fast. `fastUntil` (the pass's end) marks
// where the fast refill stops; time before it counts double toward the next heart.
export const MAX_HEARTS = 5;
export const HEART_REFILL_MS = 30 * 60_000;

/** count: hearts (0–5). refillFrom: when the running refill started (only used below five). */
export interface Hearts { count: number; refillFrom: number }

export const fullHearts = (): Hearts => ({ count: MAX_HEARTS, refillFrom: 0 });

/** Refill progress from `from` to `to`, in normal-speed time: the part before fastUntil counts double. */
function refillProgress(from: number, to: number, fastUntil = -Infinity): number {
  if (to <= from) return 0;
  const fast = Math.max(0, Math.min(to, fastUntil) - from);
  return fast * 2 + (to - from - fast);
}
/** The moment the refill started at `from` has made `amount` of progress. */
function progressReachedAt(from: number, amount: number, fastUntil = -Infinity): number {
  const fastSpan = Math.max(0, fastUntil - from);
  return amount <= fastSpan * 2 ? from + amount / 2 : from + fastSpan + (amount - fastSpan * 2);
}

export function refillHearts(hearts: Hearts, now: number, fastUntil?: number): Hearts {
  if (hearts.count >= MAX_HEARTS) return hearts;
  // A clock set backwards restarts the wait instead of granting hearts.
  if (now < hearts.refillFrom) return { ...hearts, refillFrom: now };
  const gained = Math.floor(refillProgress(hearts.refillFrom, now, fastUntil) / HEART_REFILL_MS);
  if (gained <= 0) return hearts;
  const count = Math.min(MAX_HEARTS, hearts.count + gained);
  return { ...hearts, count, refillFrom: progressReachedAt(hearts.refillFrom, gained * HEART_REFILL_MS, fastUntil) };
}

/**
 * Carries the running refill over when the fast-refill window changes (a pass bought or ended):
 * progress made so far is kept, and what is left runs at the new speed.
 */
export function rebaseRefill(hearts: Hearts, now: number, fromFastUntil: number | undefined, toFastUntil: number | undefined): Hearts {
  const current = refillHearts(hearts, now, fromFastUntil);
  if (current.count >= MAX_HEARTS) return current;
  const progress = refillProgress(current.refillFrom, now, fromFastUntil);
  const fast = toFastUntil !== undefined && now < toFastUntil;
  return { ...current, refillFrom: now - (fast ? progress / 2 : progress) };
}

/** Takes one heart for an attempt; null when none is left. */
export function spendHeart(hearts: Hearts, now: number, fastUntil?: number): Hearts | null {
  const current = refillHearts(hearts, now, fastUntil);
  if (current.count < 1) return null;
  // Dropping below five starts the 30-minute refill clock.
  const refillFrom = current.count >= MAX_HEARTS ? now : current.refillFrom;
  return { ...current, count: current.count - 1, refillFrom };
}

/** Whether a heart can be handed out without going past five. */
export function canEarnHearts(hearts: Hearts, now: number, fastUntil?: number): boolean {
  return refillHearts(hearts, now, fastUntil).count < MAX_HEARTS;
}

/** Adds a heart (a cleared attempt's refund or a reward), never past five. */
export function addHeart(hearts: Hearts, now: number, fastUntil?: number): Hearts {
  const current = refillHearts(hearts, now, fastUntil);
  return { ...current, count: Math.min(MAX_HEARTS, current.count + 1) };
}

/** What the counter shows: hearts and the wait for the next refill. */
export function describeHearts(hearts: Hearts, now: number, fastUntil?: number) {
  const current = refillHearts(hearts, now, fastUntil);
  const nextAt = progressReachedAt(current.refillFrom, HEART_REFILL_MS, fastUntil);
  return { count: current.count, nextInMs: current.count < MAX_HEARTS ? Math.max(0, nextAt - now) : null };
}

/** Reads saved hearts. Older saves kept bonus hearts apart (or as a count above five); they join the hearts, up to five. */
export function parseHearts(saved: unknown): Hearts | null {
  if (!saved || typeof saved !== 'object') return null;
  const { count, bonus = 0, refillFrom } = saved as Record<string, unknown>;
  const valid = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 999;
  if (!valid(count) || !valid(bonus) || !Number.isFinite(refillFrom)) return null;
  return { count: Math.min(count + bonus, MAX_HEARTS), refillFrom: refillFrom as number };
}
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
