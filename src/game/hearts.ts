// Hearts gate stage attempts: each attempt costs one regular heart and a clear gives it back.
// Regular hearts refill one every 30 minutes while there are fewer than five. Bonus hearts, earned
// in bonus stages, sit apart: they never refill and are never spent directly. The player moves
// them into the regular hearts (up to five) when they choose to.
export const MAX_HEARTS = 5;
export const HEART_REFILL_MS = 30 * 60_000;

/** count: regular hearts (0–5). bonus: extra hearts. refillFrom: when the running refill started (only used below five). */
export interface Hearts { count: number; bonus: number; refillFrom: number }
export type HeartSource = 'regular' | 'bonus';

export const fullHearts = (): Hearts => ({ count: MAX_HEARTS, bonus: 0, refillFrom: 0 });

export function refillHearts(hearts: Hearts, now: number): Hearts {
  if (hearts.count >= MAX_HEARTS) return hearts;
  // A clock set backwards restarts the wait instead of granting hearts.
  if (now < hearts.refillFrom) return { ...hearts, refillFrom: now };
  const gained = Math.floor((now - hearts.refillFrom) / HEART_REFILL_MS);
  if (gained <= 0) return hearts;
  const count = Math.min(MAX_HEARTS, hearts.count + gained);
  return { ...hearts, count, refillFrom: hearts.refillFrom + gained * HEART_REFILL_MS };
}

/** Takes one regular heart for an attempt; null when none is left (bonus hearts are not used). */
export function spendHeart(hearts: Hearts, now: number): { hearts: Hearts; from: HeartSource } | null {
  const current = refillHearts(hearts, now);
  if (current.count < 1) return null;
  // Dropping below five starts the 30-minute refill clock.
  const refillFrom = current.count >= MAX_HEARTS ? now : current.refillFrom;
  return { hearts: { ...current, count: current.count - 1, refillFrom }, from: 'regular' };
}

/** How many bonus hearts a charge would move into the regular hearts. */
export function chargeAmount(hearts: Hearts, now: number): number {
  const current = refillHearts(hearts, now);
  return Math.min(current.bonus, Math.max(0, MAX_HEARTS - current.count));
}

/** Moves bonus hearts into the regular hearts: `requested` of them (all that fit when left out), never past five. */
export function chargeFromBonus(hearts: Hearts, now: number, requested = Infinity): Hearts {
  const current = refillHearts(hearts, now);
  const amount = Math.max(0, Math.min(Math.floor(requested), chargeAmount(current, now)));
  return amount ? { ...current, count: current.count + amount, bonus: current.bonus - amount } : current;
}

/** Heart rewards and bonus stages only turn up while regular plus bonus hearts are at most this many. */
export const HEART_REWARD_MAX_TOTAL = 4;
/** Whether more hearts can be handed out, so the total never climbs past five. */
export function canEarnHearts(hearts: Hearts, now: number): boolean {
  const current = refillHearts(hearts, now);
  return current.count + current.bonus <= HEART_REWARD_MAX_TOTAL;
}

/** Gives a heart back to where it came from (a cleared attempt), or adds a bonus heart. */
export function addHeart(hearts: Hearts, now: number, to: HeartSource): Hearts {
  const current = refillHearts(hearts, now);
  return to === 'bonus'
    ? { ...current, bonus: current.bonus + 1 }
    : { ...current, count: Math.min(MAX_HEARTS, current.count + 1) };
}

/** What the counter shows: regular hearts, the bonus badge, and the wait for the next refill. */
export function describeHearts(hearts: Hearts, now: number) {
  const current = refillHearts(hearts, now);
  return {
    count: current.count,
    bonus: current.bonus,
    nextInMs: current.count < MAX_HEARTS ? Math.max(0, HEART_REFILL_MS - (now - current.refillFrom)) : null,
    available: current.count,
    chargeable: chargeAmount(current, now),
  };
}

/** Reads saved hearts; older saves kept one count where anything above five was bonus. */
export function parseHearts(saved: unknown): Hearts | null {
  if (!saved || typeof saved !== 'object') return null;
  const { count, bonus = 0, refillFrom } = saved as Record<string, unknown>;
  const valid = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 999;
  if (!valid(count) || !valid(bonus) || !Number.isFinite(refillFrom)) return null;
  return { count: Math.min(count, MAX_HEARTS), bonus: bonus + Math.max(0, count - MAX_HEARTS), refillFrom: refillFrom as number };
}

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
