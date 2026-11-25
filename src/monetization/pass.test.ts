import { describe, expect, it } from 'vitest';
import { isPassActive, parsePass, purchasePass } from './pass';

describe('프리미엄 패스', () => {
  it('한 번 구매하면 사용 기한 없이 아이템을 보유한다', () => {
    const pass = purchasePass(undefined, 1_000);
    expect(pass).toEqual({ spareHearts: 10, timeBonuses: 30, peeks: 30, quickOrders: 5, trayClears: 10, fastRefills: 20 });
    expect(isPassActive(pass, 365 * 24 * 60 * 60_000)).toBe(true);
  });

  it('재구매하면 남은 보유량에 더하고 저장값을 읽을 수 있다', () => {
    const pass = purchasePass(purchasePass(undefined, 0), 1);
    expect(pass).toMatchObject({ spareHearts: 20, quickOrders: 10, trayClears: 20, fastRefills: 40 });
    expect(parsePass(JSON.parse(JSON.stringify(pass)))).toEqual(pass);
  });

  it('기존 패스의 보유분과 만료일을 읽고, 잘못된 값은 거부한다', () => {
    const legacy = { expiresAt: 100, spareHearts: 2, timeBonuses: 5, peeks: 1, quickOrders: 0 };
    const pass = parsePass(legacy);
    expect(pass).toMatchObject(legacy);
    expect(isPassActive(pass, 100)).toBe(false);
    expect(purchasePass(pass, 99).spareHearts).toBe(12);
    expect(parsePass({ ...legacy, peeks: -1 })).toBeUndefined();
    expect(parsePass({ ...legacy, expiresAt: 'x' })).toBeUndefined();
  });
});
