import { describe, expect, it } from 'vitest';
import { isPassActive, parsePass, passDaysLeft, PASS_MS, PASS_PEEKS, PASS_SPARE_HEARTS, PASS_TIME_BONUSES, purchasePass } from './pass';

const DAY = 24 * 60 * 60_000;

describe('프리미엄 패스', () => {
  it('구매하면 30일 동안 켜지고 혜택 횟수가 가득 찬다', () => {
    const pass = purchasePass(undefined, 1_000);
    expect(pass).toEqual({ expiresAt: 1_000 + PASS_MS, spareHearts: PASS_SPARE_HEARTS, timeBonuses: PASS_TIME_BONUSES, peeks: PASS_PEEKS });
    expect(isPassActive(pass, 1_000 + PASS_MS - 1)).toBe(true);
    expect(isPassActive(pass, 1_000 + PASS_MS)).toBe(false);
    expect(passDaysLeft(pass, 1_000)).toBe(30);
    expect(passDaysLeft(pass, 1_000 + PASS_MS)).toBe(0);
  });

  it('기간 중 재구매는 남은 기간에 30일을 더하고, 혜택은 누적 없이 다시 채운다', () => {
    const used = { ...purchasePass(undefined, 0), spareHearts: 2, timeBonuses: 0, peeks: 7 };
    const renewed = purchasePass(used, 10 * DAY);
    expect(renewed.expiresAt).toBe(60 * DAY);
    expect(renewed).toMatchObject({ spareHearts: PASS_SPARE_HEARTS, timeBonuses: PASS_TIME_BONUSES, peeks: PASS_PEEKS });
  });

  it('만료 후 재구매는 구매 시점부터 30일이다', () => {
    expect(purchasePass(purchasePass(undefined, 0), 40 * DAY).expiresAt).toBe(70 * DAY);
  });

  it('저장값이 잘못되면 패스가 없는 것으로 읽는다', () => {
    const pass = purchasePass(undefined, 0);
    expect(parsePass(JSON.parse(JSON.stringify(pass)))).toEqual(pass);
    expect(parsePass(null)).toBeUndefined();
    expect(parsePass({ ...pass, peeks: 99 })).toBeUndefined();
    expect(parsePass({ ...pass, expiresAt: 'x' })).toBeUndefined();
  });
});
