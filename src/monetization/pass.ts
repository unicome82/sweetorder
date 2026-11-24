// Premium pass (30 days, no auto-renew). Each purchase adds 30 days to what is left and refills the
// pass allowances to their full amounts (they don't stack). Nothing here talks to a store; see billing.ts.
export const PASS_DAYS = 30;
export const PASS_MS = PASS_DAYS * 24 * 60 * 60_000;
export const PASS_SPARE_HEARTS = 10;
export const PASS_TIME_BONUSES = 30;
export const PASS_PEEKS = 30;
/** What one +5 seconds adds to the clock. */
export const PASS_TIME_BONUS_MS = 5_000;
/** "Extend your pass" reminders start this long before the pass runs out. */
export const PASS_REMINDER_MS = 3 * 24 * 60 * 60_000;

/** expiresAt: when the pass ends. The rest are allowances left from the latest purchase. */
export interface Pass { expiresAt: number; spareHearts: number; timeBonuses: number; peeks: number }

export function isPassActive(pass: Pass | undefined, now: number): pass is Pass {
  return pass !== undefined && now < pass.expiresAt;
}

/** A purchase: 30 more days on top of any time left, allowances back to full. */
export function purchasePass(pass: Pass | undefined, now: number): Pass {
  const from = isPassActive(pass, now) ? pass.expiresAt : now;
  return { expiresAt: from + PASS_MS, spareHearts: PASS_SPARE_HEARTS, timeBonuses: PASS_TIME_BONUSES, peeks: PASS_PEEKS };
}

/** Whole days left, counting a partial day as one; 0 once expired. */
export function passDaysLeft(pass: Pass | undefined, now: number): number {
  return isPassActive(pass, now) ? Math.ceil((pass.expiresAt - now) / (24 * 60 * 60_000)) : 0;
}

export function parsePass(saved: unknown): Pass | undefined {
  if (!saved || typeof saved !== 'object') return undefined;
  const { expiresAt, spareHearts, timeBonuses, peeks } = saved as Record<string, unknown>;
  const count = (n: unknown, max: number): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max;
  if (!Number.isFinite(expiresAt) || !count(spareHearts, PASS_SPARE_HEARTS) || !count(timeBonuses, PASS_TIME_BONUSES) || !count(peeks, PASS_PEEKS)) return undefined;
  return { expiresAt: expiresAt as number, spareHearts, timeBonuses, peeks };
}
