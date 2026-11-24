import { describe, expect, it } from 'vitest';
import { addHeart, chargeAmount, chargeFromBonus, describeHearts, fullHearts, HEART_REFILL_MS, MAX_HEARTS, parseHearts, refillHearts, spendHeart, type Hearts } from './hearts';
import { canAffordAttempt, canPlayBonusToday, createSession, reduceSession } from './session';
import { BONUS_STAGE_ID } from './constants';
import { getStage, loadStage } from './stages';
import { createBonusStage } from './stages/bonus';
import { selectDonut } from './engine';
import { validateStage } from './validation';

const minutes = (n: number) => n * 60_000;

describe('하트', () => {
  it('도전마다 1개를 쓰고, 5개 미만이 된 때부터 30분마다 1개씩 최대 5개까지 찬다', () => {
    const spent = spendHeart(fullHearts(), 1_000)!.hearts;
    expect(spent).toEqual({ count: 4, bonus: 0, refillFrom: 1_000 });
    expect(refillHearts(spent, 1_000 + HEART_REFILL_MS - 1).count).toBe(4);
    expect(refillHearts(spent, 1_000 + HEART_REFILL_MS).count).toBe(5);
    expect(refillHearts({ count: 0, bonus: 0, refillFrom: 0 }, minutes(500)).count).toBe(MAX_HEARTS);
    expect(spendHeart({ count: 0, bonus: 0, refillFrom: 0 }, minutes(29))).toBeNull();
  });

  it('보너스 하트는 바로 쓰이지 않고, 충전하면 일반 하트를 최대 5개까지 채운다', () => {
    const hearts: Hearts = { count: 0, bonus: 7, refillFrom: 0 };
    expect(spendHeart(hearts, 0)).toBeNull();
    expect(chargeAmount(hearts, 0)).toBe(5);
    expect(chargeFromBonus(hearts, 0)).toMatchObject({ count: 5, bonus: 2 });
    expect(chargeFromBonus({ count: 3, bonus: 1, refillFrom: 0 }, 0)).toMatchObject({ count: 4, bonus: 0 });
    expect(chargeFromBonus({ count: 5, bonus: 3, refillFrom: 0 }, 0)).toMatchObject({ count: 5, bonus: 3 });
    // A chosen amount is moved as asked, but never past five.
    expect(chargeFromBonus(hearts, 0, 2)).toMatchObject({ count: 2, bonus: 5 });
    expect(chargeFromBonus({ count: 4, bonus: 3, refillFrom: 0 }, 0, 3)).toMatchObject({ count: 5, bonus: 2 });
    expect(refillHearts({ count: 0, bonus: 2, refillFrom: 0 }, minutes(500))).toMatchObject({ count: 5, bonus: 2 });
  });

  it('일반 하트가 0개면 보너스 하트가 있어도 시작할 수 없고, 충전한 뒤에 시작된다', async () => {
    await loadStage(1);
    const session = { ...createSession(), hearts: { count: 0, bonus: 3, refillFrom: 0 } };
    expect(reduceSession(session, { type: 'START', stageId: 1, now: 0 })).toBe(session);
    const charged = reduceSession(session, { type: 'CHARGE_HEARTS', now: 0 });
    expect(charged.hearts).toMatchObject({ count: 3, bonus: 0 });
    expect(reduceSession(charged, { type: 'START', stageId: 1, now: 0 }).hearts.count).toBe(2);
  });

  it('충전 대기 시간과 보너스 하트 수를 따로 보여 준다', () => {
    expect(describeHearts({ count: 3, bonus: 0, refillFrom: 0 }, minutes(10))).toMatchObject({ count: 3, bonus: 0, nextInMs: minutes(20) });
    expect(describeHearts(addHeart(fullHearts(), 0, 'bonus'), 0)).toMatchObject({ count: 5, bonus: 1, nextInMs: null });
  });

  it('예전 저장값(5개 초과분)은 보너스 하트로 옮긴다', () => {
    expect(parseHearts({ count: 7, refillFrom: 5 })).toEqual({ count: 5, bonus: 2, refillFrom: 5 });
  });

  it('클리어하면 하트를 돌려받고, 실패하면 1개가 줄어든 채로 남는다', async () => {
    const stage = await loadStage(1);
    const started = reduceSession(createSession(), { type: 'START', stageId: stage.id, now: 0 });
    expect(started.hearts.count).toBe(4);
    const failed = { ...started, game: { ...started.game, status: 'gameover' as const } };
    const retried = reduceSession(failed, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(retried.hearts.count).toBe(3);
    const game = retried.game;
    const order = game.orders[0]!;
    const type = stage.donutTypes[0]!;
    game.orders = [{ ...order, remaining: { [type]: 1 } }, null, null, null];
    game.completedOrders = stage.targetOrders - 1;
    game.nextOrderIndex = stage.targetOrders;
    game.tray = [{ id: 'last', type }];
    const cleared = reduceSession(retried, { type: 'GAME', action: { type: 'PICKUP_TRAY', readyOrders: [order.definitionId], parallel: true }, now: 0 });
    expect(cleared.game.status).toBe('clear');
    expect(cleared.hearts.count).toBe(4);
  });

  it('테스트 모드에서는 하트가 없어도 시작과 재도전에 저장된 하트를 쓰지 않는다', async () => {
    await loadStage(1);
    const hearts = { count: 0, bonus: 3, refillFrom: 0 };
    const session = { ...createSession(false, true), hearts };
    expect(canAffordAttempt(session, 1, 0)).toBe(true);

    const started = reduceSession(session, { type: 'START', stageId: 1, now: 0 });
    expect(started.screen).toBe('game');
    expect(started.hearts).toBe(hearts);

    const failed = { ...started, game: { ...started.game, status: 'gameover' as const } };
    const retried = reduceSession(failed, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(retried.game.status).toBe(started.game.status);
    expect(retried.hearts).toBe(hearts);
    expect(retried.heartPaidFrom).toBeUndefined();
  });

  it('하트가 없으면 캠페인 스테이지를 시작하거나 다시 할 수 없다', async () => {
    await loadStage(1);
    const empty = { ...createSession(), hearts: { count: 0, bonus: 0, refillFrom: 0 } };
    expect(reduceSession(empty, { type: 'START', stageId: 1, now: minutes(1) })).toBe(empty);
    expect(reduceSession(empty, { type: 'START', stageId: 1, now: minutes(31) }).screen).toBe('game');
  });
});

describe('보너스 스테이지', () => {
  it('한 가지 디저트만 120개 나오고 주문량과 정확히 같다', () => {
    const stage = createBonusStage('canele');
    expect(validateStage(stage)).toEqual([]);
    expect(stage.queues.flat()).toHaveLength(120);
  });

  it('하트 없이 시작하고, 누르는 대로 다 클리어되며, 하트 +1(5개 초과 가능)을 준다', () => {
    let session = reduceSession(createSession(), { type: 'START_BONUS', dessert: 'pretzel', nextStageId: 7 });
    expect(session.hearts.count).toBe(5);
    expect(session.game.stageId).toBe(BONUS_STAGE_ID);
    const stage = getStage(BONUS_STAGE_ID);
    for (let guard = 0; session.game.status === 'playing' && guard < 500; guard += 1) {
      const column = session.game.queues.findIndex(queue => queue.length > 0);
      const front = session.game.queues[column]![0]!;
      expect(selectDonut(session.game, stage, column, front.id).state).not.toBe(session.game);
      session = reduceSession(session, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex: column, expectedDonutId: front.id }, now: 0 });
      const orders = session.game.orders.flatMap(order => order ? [order.definitionId] : []);
      session = reduceSession(session, { type: 'GAME', action: { type: 'PICKUP_TRAY', readyOrders: orders, parallel: true }, now: 0 });
    }
    expect(session.game.status).toBe('clear');
    expect(session.hearts).toMatchObject({ count: 5, bonus: 1 });
    expect(session.bonus?.nextStageId).toBe(7);
    expect(session.stars).toEqual({});
  });
});

describe('보너스 스테이지 하루 1회', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it('입장할 때 그날 횟수를 쓰고, 같은 날에는 다시 들어갈 수 없으며 자정이 지나면 다시 열린다', () => {
    const empty = { ...createSession(), hearts: { count: 0, bonus: 0, refillFrom: at('2026-11-24T09:00:00') } };
    const morning = at('2026-11-24T09:00:00');
    expect(canPlayBonusToday(empty, morning)).toBe(true);
    const entered = reduceSession(empty, { type: 'START_BONUS', dessert: 'pretzel', nextStageId: 7, now: morning });
    expect(entered.screen).toBe('game');
    expect(canPlayBonusToday(entered, morning)).toBe(false);
    const left = reduceSession(entered, { type: 'STAGES' });
    expect(reduceSession(left, { type: 'START_BONUS', dessert: 'pretzel', nextStageId: 7, now: at('2026-11-24T23:59:00') })).toBe(left);
    expect(canPlayBonusToday(left, at('2026-11-25T00:00:00'))).toBe(true);
    expect(reduceSession(left, { type: 'START_BONUS', dessert: 'pretzel', nextStageId: 7, now: at('2026-11-25T00:00:00') }).screen).toBe('game');
  });

  it('테스트 입장은 그날 횟수를 쓰지 않는다', () => {
    const tested = reduceSession(createSession(), { type: 'START_BONUS', dessert: 'pretzel', nextStageId: 1, testing: true, now: 0 });
    expect(tested.screen).toBe('game');
    expect(canPlayBonusToday(tested, 0)).toBe(true);
  });
});
