import { describe, expect, it } from 'vitest';
import { canQuickOrder, createGame, quickOrder, selectDonut } from './engine';
import { createSession, reduceSession, type SessionState } from './session';
import { loadAllStages, practiceStage } from './stages';
import { PASS_QUICK_ORDERS, purchasePass } from '../monetization/pass';
import { QUICK_ORDER_FROM_STAGE, rewardFor } from './stages/extras';
import { isFeaturePreviewStage } from './constants';
import type { DonutType, GameState, StageDefinition } from './types';

const stages = await loadAllStages();
const byId = new Map(stages.map(stage => [stage.id, stage]));
const quickStages = stages.filter(stage => !isFeaturePreviewStage(stage.id) && stage.queues.flat().some(token => token.reward === 'quickOrder'));

/** Desserts still to be served by the stage's orders, against those left in the tray and queues. */
function balance(state: GameState, stage: StageDefinition) {
  const supply = new Map<DonutType, number>();
  const demand = new Map<DonutType, number>();
  const add = (map: Map<DonutType, number>, type: DonutType, n = 1) => map.set(type, (map.get(type) ?? 0) + n);
  for (const token of [...state.tray, ...state.queues.flat()]) if (!token.reward) add(supply, token.type);
  for (const order of state.orders) for (const [type, n] of Object.entries(order?.remaining ?? {})) add(demand, type as DonutType, n);
  for (const order of stage.orders.slice(state.nextOrderIndex, stage.targetOrders)) {
    for (const [type, n] of Object.entries(order.items)) add(demand, type as DonutType, n);
  }
  const strip = (map: Map<DonutType, number>) => Object.fromEntries([...map].filter(([, n]) => n > 0).sort());
  return { supply: strip(supply), demand: strip(demand) };
}

/** Plays a few greedy turns: the first front dessert any shown order needs, else the first front dessert. */
function playTurns(state: GameState, stage: StageDefinition, turns: number): GameState {
  for (let n = 0; n < turns && state.status === 'playing'; n += 1) {
    const needed = new Set(state.orders.flatMap(order => Object.entries(order?.remaining ?? {}).filter(([, c]) => c > 0).map(([type]) => type)));
    let column = state.queues.findIndex(queue => queue[0] && needed.has(queue[0].type));
    if (column < 0) column = state.queues.findIndex(queue => queue[0]);
    if (column < 0) break;
    state = selectDonut(state, stage, column, state.queues[column]![0]!.id).state;
  }
  return state;
}

describe('퀵오더 등장', () => {
  it(`${QUICK_ORDER_FROM_STAGE}번부터, 그 스테이지의 보상 칸으로 나온다`, () => {
    const ids = stages.map(stage => stage.id).filter(id => rewardFor(id) === 'quickOrder');
    expect(ids.length).toBeGreaterThan(0);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(QUICK_ORDER_FROM_STAGE);
    expect(quickStages.map(stage => stage.id)).toEqual(ids.filter(id => !isFeaturePreviewStage(id)));
    for (const stage of quickStages) expect(stage.queues.flat().filter(token => token.reward)).toHaveLength(1);
  });
});

describe('퀵오더 효과', () => {
  it('보이는 손님의 주문을 트레이 먼저, 그다음 대기열(중간 포함)에서 한 번에 채우고 새 손님에게는 이어지지 않는다', () => {
    const stage = byId.get(40)!;
    let state = playTurns({ ...createGame(stage), trayCapacity: 99 }, stage, 6);
    // Put a few unneeded desserts in the tray so the tray is checked first.
    state = { ...state, quickOrders: 1 };
    const before = structuredClone(state);
    const shown = before.orders.filter(order => order !== null).map(order => order.definitionId);
    const { state: after, events } = quickOrder(state, stage);

    expect(after.quickOrders).toBe(0);
    const completed = events.flatMap(event => event.type === 'orderCompleted' ? [event.orderId] : []);
    expect(completed.sort()).toEqual([...shown].sort());
    expect(after.completedOrders).toBe(before.completedOrders + shown.length);
    // The customers who stepped up are untouched.
    for (const order of after.orders) {
      if (!order) continue;
      expect(shown).not.toContain(order.definitionId);
      expect(order.remaining).toEqual(stage.orders.find(o => o.id === order.definitionId)!.items);
    }
    // Every tray dessert a served order could use went before any queue dessert of that type.
    const fromTray = new Set(before.tray.map(token => token.id));
    const consumed = events.flatMap(event => event.type === 'consumed' ? [event.donutId] : []);
    for (const token of before.tray) {
      const queueTaken = consumed.some(id => !fromTray.has(id) && before.queues.flat().find(t => t.id === id)?.type === token.type);
      if (queueTaken) expect(consumed).toContain(token.id);
    }
    expect(balance(after, stage).supply).toEqual(balance(after, stage).demand);
  });

  it('어느 스테이지 어느 시점에 써도 디저트와 주문 개수의 균형이 맞고, 보이는 주문은 모두 완료된다', () => {
    for (const stage of stages.filter((_, index) => index % 50 === 0)) {
      for (const turns of [0, 5, 15]) {
        const state = playTurns({ ...createGame(stage), quickOrders: 1 }, stage, turns);
        if (!canQuickOrder(state)) continue;
        expect(balance(state, stage).supply).toEqual(balance(state, stage).demand);
        const shown = state.orders.filter(order => order !== null).length;
        const after = quickOrder(state, stage).state;
        expect(after.completedOrders, `stage ${stage.id}`).toBe(state.completedOrders + shown);
        expect(balance(after, stage).supply).toEqual(balance(after, stage).demand);
        if (after.completedOrders === stage.targetOrders) expect(after.status).toBe('clear');
      }
    }
  });

  it('보유하지 않았거나, 디저트가 트레이로 가는 중이면 쓸 수 없다', () => {
    const stage = byId.get(40)!;
    const game = createGame(stage);
    expect(canQuickOrder(game)).toBe(false);
    expect(quickOrder(game, stage).state).toBe(game);
    const front = game.queues[0]![0]!;
    const moving = selectDonut({ ...game, quickOrders: 1 }, stage, 0, front.id, true).state;
    expect(canQuickOrder(moving)).toBe(false);
  });

  it('트레이가 가득 차 막혔을 때도 쓸 수 있다', () => {
    const stage = byId.get(40)!;
    const blocked: GameState = { ...createGame(stage), status: 'blocked', blockedReason: 'full', quickOrders: 1 };
    const after = quickOrder(blocked, stage).state;
    expect(after.quickOrders).toBe(0);
    expect(after.status).not.toBe('blocked');
  });
});

describe('퀵오더 보관', () => {
  const stage = quickStages[0]!;
  const base: SessionState = { ...createSession(true), hearts: { count: 5, refillFrom: 0 } };
  function collect(session: SessionState): SessionState {
    session = { ...session, game: { ...session.game, trayCapacity: 99 } };
    const column = session.game.queues.findIndex(queue => queue.some(token => token.reward === 'quickOrder'));
    const index = session.game.queues[column]!.findIndex(token => token.reward === 'quickOrder');
    for (let n = 0; n <= index; n += 1) {
      const front = session.game.queues[column]![0]!;
      session = reduceSession(session, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex: column, expectedDonutId: front.id }, now: 0 });
    }
    return session;
  }

  it('대기열에서 집으면 1개를 보유하고 다음 판으로 가져가며, 쓰면 없어진다', () => {
    let session = collect(reduceSession(base, { type: 'START', stageId: stage.id, now: 0 }));
    expect(session.game.collectedRewards).toEqual(['quickOrder']);
    expect(session.quickOrders).toBe(1);
    expect(session.game.quickOrders).toBe(1);

    session = reduceSession({ ...session, screen: 'stages' }, { type: 'START', stageId: 3, now: 0 });
    expect(session.game.quickOrders).toBe(1);
    session = reduceSession(session, { type: 'GAME', action: { type: 'QUICK_ORDER' }, now: 0 });
    expect(session.game.quickOrders).toBe(0);
    expect(session.quickOrders).toBe(0);
  });

  it('이미 1개를 가지고 있으면 그 판의 퀵오더 칸을 빼고 시작한다', () => {
    const holding = reduceSession({ ...base, quickOrders: 1 }, { type: 'START', stageId: stage.id, now: 0 });
    expect(holding.game.queues.flat().some(token => token.reward === 'quickOrder')).toBe(false);
    const empty = reduceSession(base, { type: 'START', stageId: stage.id, now: 0 });
    expect(empty.game.queues.flat().some(token => token.reward === 'quickOrder')).toBe(true);
  });

  it('보너스 스테이지에서도 쓸 수 있고, 연습 스테이지에는 없다', () => {
    const bonus = reduceSession({ ...base, quickOrders: 1 }, { type: 'START_BONUS', dessert: 'strawberryDonut', nextStageId: 2, now: 0 });
    expect(bonus.game.quickOrders).toBe(1);
    const practice = reduceSession({ ...base, quickOrders: 1 }, { type: 'START', stageId: practiceStage.id, now: 0 });
    expect(practice.game.quickOrders).toBeUndefined();
  });
});

describe('패스 퀵오더', () => {
  const use = (session: SessionState) => reduceSession(session, { type: 'GAME', action: { type: 'QUICK_ORDER' }, now: 0 });
  const withPass = (quickOrders: number): SessionState => ({ ...createSession(true), quickOrders, pass: purchasePass(undefined, 0) });

  it(`패스 잔여분이 한 판에 모두 표시되고, 쓰면 패스에서 ${PASS_QUICK_ORDERS}개 중 하나가 줄어든다`, () => {
    const started = reduceSession(withPass(0), { type: 'START', stageId: 40, now: 0 });
    expect(started.game).toMatchObject({ quickOrders: PASS_QUICK_ORDERS, passQuickOrders: PASS_QUICK_ORDERS });
    const used = use(started);
    expect(used.game).toMatchObject({ quickOrders: PASS_QUICK_ORDERS - 1, passQuickOrders: PASS_QUICK_ORDERS - 1 });
    expect(used.quickOrders).toBe(0);
    expect(used.pass!.quickOrders).toBe(PASS_QUICK_ORDERS - 1);
    // A retry keeps the remaining pass balance.
    const retried = reduceSession(used, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(retried.game).toMatchObject({ quickOrders: PASS_QUICK_ORDERS - 1, passQuickOrders: PASS_QUICK_ORDERS - 1 });
    expect(retried.pass!.quickOrders).toBe(PASS_QUICK_ORDERS - 1);
  });

  it('가진 퀵오더를 먼저 쓰고, 그다음 패스 것을 쓴다', () => {
    const started = reduceSession(withPass(1), { type: 'START', stageId: 40, now: 0 });
    expect(started.game).toMatchObject({ quickOrders: 1 + PASS_QUICK_ORDERS, passQuickOrders: PASS_QUICK_ORDERS });
    const first = use(started);
    expect(first.quickOrders).toBe(0);
    expect(first.pass!.quickOrders).toBe(PASS_QUICK_ORDERS);
    // The game moves on after a quick order; check the pass's turn on a fresh copy of the attempt.
    const passTurn = use({ ...first, game: { ...started.game, quickOrders: PASS_QUICK_ORDERS } });
    expect(passTurn.quickOrders).toBe(0);
    expect(passTurn.pass!.quickOrders).toBe(PASS_QUICK_ORDERS - 1);
  });

  it('진행 중 패스를 구매하거나 종료하면 버튼에 표시할 수량도 갱신된다', () => {
    const started = reduceSession({ ...createSession(true), quickOrders: 1 }, { type: 'START', stageId: 40, now: 0 });
    const bought = reduceSession(started, { type: 'BUY_PASS', now: 1 });
    expect(bought.game.quickOrders).toBe(1 + PASS_QUICK_ORDERS);
    expect(reduceSession(bought, { type: 'END_PASS' }).game.quickOrders).toBe(1);
  });

  it('패스가 없거나 패스 퀵오더를 다 쓰면 패스 몫은 없다', () => {
    expect(reduceSession({ ...createSession(true), quickOrders: 0 }, { type: 'START', stageId: 40, now: 0 }).game).toMatchObject({ quickOrders: 0, passQuickOrders: 0 });
    const spent = { ...withPass(0), pass: { ...purchasePass(undefined, 0), quickOrders: 0 } };
    expect(reduceSession(spent, { type: 'START', stageId: 40, now: 0 }).game).toMatchObject({ quickOrders: 0, passQuickOrders: 0 });
  });
});
