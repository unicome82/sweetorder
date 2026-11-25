export const PASS_SPARE_HEARTS = 10;
export const PASS_TIME_BONUSES = 30;
export const PASS_PEEKS = 30;
export const PASS_QUICK_ORDERS = 5;
export const PASS_TRAY_CLEARS = 10;
export const PASS_FAST_REFILLS = 20;
export const PASS_TIME_BONUS_MS = 5_000;

export interface Pass {
  /** Retained only for passes purchased under the old 30-day offer. */
  expiresAt?: number;
  spareHearts: number;
  timeBonuses: number;
  peeks: number;
  quickOrders: number;
  trayClears?: number;
  fastRefills?: number;
}

export function isPassActive(pass: Pass | undefined, now: number): pass is Pass {
  return pass !== undefined && (pass.expiresAt === undefined || now < pass.expiresAt);
}

export function purchasePass(pass: Pass | undefined, now: number): Pass {
  const balance = isPassActive(pass, now) ? pass : undefined;
  return {
    spareHearts: (balance?.spareHearts ?? 0) + PASS_SPARE_HEARTS,
    timeBonuses: (balance?.timeBonuses ?? 0) + PASS_TIME_BONUSES,
    peeks: (balance?.peeks ?? 0) + PASS_PEEKS,
    quickOrders: (balance?.quickOrders ?? 0) + PASS_QUICK_ORDERS,
    trayClears: (balance?.trayClears ?? 0) + PASS_TRAY_CLEARS,
    fastRefills: (balance?.fastRefills ?? 0) + PASS_FAST_REFILLS,
  };
}

export function parsePass(saved: unknown): Pass | undefined {
  if (!saved || typeof saved !== 'object') return undefined;
  const { expiresAt, spareHearts, timeBonuses, peeks, quickOrders = 0, trayClears = 0, fastRefills = 0 } = saved as Record<string, unknown>;
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if ((expiresAt !== undefined && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)))
    || !count(spareHearts) || !count(timeBonuses) || !count(peeks) || !count(quickOrders) || !count(trayClears) || !count(fastRefills)) return undefined;
  return { ...(expiresAt === undefined ? {} : { expiresAt }), spareHearts, timeBonuses, peeks, quickOrders, trayClears, fastRefills };
}
