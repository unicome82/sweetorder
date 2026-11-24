import { describe, expect, it } from 'vitest';
import { createGame, clearTray, getReadyTrayPickupOrders, getStars, selectDonut, matchTray, pickupTray } from './engine';
import { reduceGame } from './reducer';
import { createSession, getCurrentStage, isUnlocked, reduceSession } from './session';
import { authoredStages, loadAllStages, practiceStage, STAGE_COUNT } from './stages';
import { encodeStars } from '../hooks/useGame';
import { solutions } from './stages/solutions';
import { BASE_TRAY_CAPACITY, QUEUE_COUNT } from './constants';
import { TRAY_CAPACITY_BY_DIFFICULTY } from './trayCapacity';
import { getStageTimeLimit, getTimeStars } from './stageTime';
import { validateStage } from './validation';
import type { DonutType, GameState, StageDefinition, OrderDefinition } from './types';

const stages = await loadAllStages();
// Replaying every witness path takes minutes; by default replay the tuned opening and a spread
// sample. `npm run stages:verify` replays all of them.
const replayed = process.env.STAGES_FULL === '1' ? stages : stages.filter(stage => stage.id <= 200 || stage.id % 97 === 0);

function fixture(items: OrderDefinition['items'][]): StageDefinition {
  const types: DonutType[] = ['strawberryDonut', 'chocolateDonut', 'vanillaDonut'];
  return {
    id: 1, revision: 1, donutTypes: types, targetOrders: items.length, trayCapacity: BASE_TRAY_CAPACITY,
    orders: items.map((item, i) => ({ id: 'o' + i, sequence: i + 1, items: item })),
    queues: Array.from({ length: QUEUE_COUNT }, (_, q) => Array.from({ length: 20 }, (_, i) => ({ id: q + '-' + i, type: types[q % 3] ?? 'vanillaDonut' }))),
  };
}
// Stored solutions predate reward slots: collect a reward first when one is in the way.
function collectReward(state: GameState, stage: StageDefinition, queue: number) {
  const front = state.queues[queue]?.[0];
  return front?.reward ? selectDonut(state, stage, queue, front.id).state : state;
}
function select(state: GameState, stage: StageDefinition, queue: number) {
  state = collectReward(state, stage, queue);
  const front = state.queues[queue]?.[0];
  if (!front) throw new Error('빈 대기열');
  return selectDonut(state, stage, queue, front.id);
}
function tray(type: DonutType, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: 'tray-' + i, type }));
}

describe('스테이지 공용 시간', () => {
  it('연습 제한 시간은 10초이고 스테이지 시간은 디저트 수에 비례한다', () => {
    expect(getStageTimeLimit(practiceStage)).toBe(10_000);
    const rate = { easy: 1.0, normal: 1.1, hard: 1.2 };
    for (const stage of stages) {
      const desserts = stage.queues.flat().filter(token => !token.reward).length;
      const limit = getStageTimeLimit(stage);
      expect(limit % 5_000).toBe(0);
      expect(limit / 1000).toBeGreaterThanOrEqual(10 + desserts * rate[stage.difficulty ?? 'easy']);
      expect(limit / 1000).toBeLessThan(15 + desserts * rate[stage.difficulty ?? 'easy']);
    }
    expect(getStageTimeLimit(stages[0]!)).toBe(140_000);
  });

  it.each([[60_000, 3], [59_999, 2], [30_000, 2], [29_999, 1], [1, 1], [0, 1]])(
    '120초 중 %i밀리초가 남으면 별 %i개 기준이다', (remaining, count) => {
      expect(getTimeStars(remaining, 120_000)).toBe(count);
    },
  );

  it('마지막 픽업의 남은 시간으로 별을 저장하고, 시간이 다 돼도 계속해서 별 1개로 클리어한다', () => {
    const stage = stages[0]!;
    const session = reduceSession(createSession(), { type: 'START', stageId: stage.id });
    const game = session.game;
    const order = game.orders[0]!;
    const type = stage.donutTypes[0]!;
    game.orders = [{ ...order, remaining: { [type]: 1 } }, null, null, null];
    game.completedOrders = stage.targetOrders - 1;
    game.nextOrderIndex = stage.targetOrders;
    game.tray = tray(type, 1);
    const action = { type: 'PICKUP_TRAY', readyOrders: [order.definitionId], parallel: true } as const;
    const cleared = reduceSession(session, { type: 'GAME', action: { ...action, remainingTimeMs: 35_000 } });
    expect(cleared.game.status).toBe('clear');
    expect(cleared.stars[stage.id]).toBe(2);
    const late = reduceSession(session, { type: 'GAME', action: { ...action, remainingTimeMs: 0 } });
    expect(late.game.status).toBe('clear');
    expect(late.stars[stage.id]).toBe(1);
  });
});

describe('자동 매칭과 상태 전이', () => {
  it('손님별 첫 디저트는 동시에 나가고 다음 디저트는 해당 손님이 준비될 때까지 기다린다', () => {
    const stage = fixture([{ strawberryDonut: 2 }, { chocolateDonut: 1 }, { strawberryDonut: 1, vanillaDonut: 1 }]);
    const state = createGame(stage);
    state.tray = [
      { id: 'a', type: 'strawberryDonut' }, { id: 'b', type: 'strawberryDonut' },
      { id: 'c', type: 'chocolateDonut' }, { id: 'd', type: 'vanillaDonut' },
    ];
    state.pendingMatchIds = ['d'];

    const first = pickupTray(state, stage, ['o0', 'o1', 'o2'], true);
    expect(first.events.filter(event => event.type === 'consumed')).toEqual([
      { type: 'consumed', donutId: 'a', orderId: 'o0' },
      { type: 'consumed', donutId: 'c', orderId: 'o1' },
    ]);
    const landed = matchTray(first.state, stage, 'd', true).state;
    expect(getReadyTrayPickupOrders(landed, ['o2'])).toEqual(['o2']);
    const second = pickupTray(landed, stage, ['o2'], true);
    expect(second.events).toContainEqual({ type: 'consumed', donutId: 'd', orderId: 'o2' });
    expect(second.state.tray.map(token => token.id)).toEqual(['b']);
    expect(pickupTray(second.state, stage, ['o0', 'o2'], true).events)
      .toContainEqual({ type: 'consumed', donutId: 'b', orderId: 'o0' });
  });

  it('주문 도넛도 먼저 트레이에 남고 준비 완료 후에만 소비한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const queued = selectDonut(createGame(stage), stage, 0, '0-0', true).state;
    expect(queued.tray.map(token => token.id)).toEqual(['0-0']);
    expect(queued.orders[0]?.remaining.strawberryDonut).toBe(2);
    const matched = matchTray(queued, stage, '0-0').state;
    expect(matched.tray).toHaveLength(0);
    expect(matched.orders[0]?.remaining.strawberryDonut).toBe(1);
  });
  it('두 번 연속 올린 도넛은 각각 준비 완료된 뒤 소비한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }, { vanillaDonut: 3 }]);
    const first = selectDonut(createGame(stage), stage, 0, '0-0', true).state;
    const second = selectDonut(first, stage, 0, '0-1', true).state;
    expect(second.tray).toHaveLength(2);
    const readyFirst = matchTray(second, stage, '0-0').state;
    expect(readyFirst.tray.map(token => token.id)).toEqual(['0-1']);
    expect(readyFirst.orders[0]?.remaining.strawberryDonut).toBe(1);
    const readySecond = matchTray(readyFirst, stage, '0-1').state;
    expect(readySecond.tray).toHaveLength(0);
    expect(readySecond.completedOrders).toBe(1);
  });
  it('가장 먼저 담은 매칭 디저트부터 한 개씩 전달하고 새 손님의 준비를 기다린다', () => {
    const stage = fixture([{ chocolateDonut: 1 }, { strawberryDonut: 1 }, { strawberryDonut: 1 }, { strawberryDonut: 1 }, { chocolateDonut: 1 }]);
    const initial = createGame(stage);
    initial.tray = [
      { id: 'unmatched', type: 'vanillaDonut' },
      { id: 'first', type: 'chocolateDonut' },
      { id: 'second', type: 'strawberryDonut' },
      { id: 'replacement', type: 'chocolateDonut' },
    ];
    initial.pendingMatchIds = ['first'];
    const readyOrders = ['o0', 'o1', 'o2', 'o3'];
    expect(pickupTray(initial, stage, readyOrders).state).toBe(initial);

    const landed = matchTray(initial, stage, 'first', true).state;
    expect(landed.tray).toEqual(initial.tray);
    const first = pickupTray(landed, stage, readyOrders);
    expect(first.events.filter(event => event.type === 'consumed').map(event => event.donutId)).toEqual(['first']);
    const second = pickupTray(first.state, stage, readyOrders);
    expect(second.events.filter(event => event.type === 'consumed').map(event => event.donutId)).toEqual(['second']);
    expect(pickupTray(second.state, stage, readyOrders).state).toBe(second.state);
    expect(pickupTray(second.state, stage, [...readyOrders, 'o4']).state.tray.map(token => token.id)).toEqual(['unmatched']);
  });
  it('트레이가 가득 차도 준비 중인 도넛이 있으면 실패 판정을 기다린다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const initial = createGame(stage);
    initial.tray = tray('vanillaDonut', BASE_TRAY_CAPACITY - 1);
    const queued = selectDonut(initial, stage, 0, '0-0', true).state;
    expect(queued.tray).toHaveLength(BASE_TRAY_CAPACITY);
    expect(queued.status).toBe('playing');
    expect(selectDonut(queued, stage, 0, '0-1', true).state).toBe(queued);
    const matched = matchTray(queued, stage, '0-0').state;
    expect(matched.status).toBe('playing');
    expect(matched.tray).toHaveLength(BASE_TRAY_CAPACITY - 1);
  });
  it('마지막 준비 도넛도 주문에 없으면 가득 찬 트레이를 비울 수 있다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const initial = createGame(stage);
    initial.tray = tray('vanillaDonut', BASE_TRAY_CAPACITY - 1);
    const queued = selectDonut(initial, stage, 2, '2-0', true).state;
    expect(queued.status).toBe('playing');
    expect(matchTray(queued, stage, '2-0').state.status).toBe('blocked');
  });
  it('재시작 후 이전 도넛의 준비 완료 액션은 무시한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const initial = createGame(stage);
    expect(matchTray(initial, stage, '0-0').state).toBe(initial);
  });

  it('연속 두 입력은 새 맨 앞 ID로 각각 처리하고 이전 ID 중복만 무시한다', () => {
    const stage = fixture([{ strawberryDonut: 16 }]);
    const initial = createGame(stage);
    const first = select(initial, stage, 2).state;
    const second = select(first, stage, 2).state;
    expect(second.tray.map(token => token.id)).toEqual(['2-0', '2-1']);
    expect(second.queues[2]?.[0]?.id).toBe('2-2');
    expect(selectDonut(second, stage, 2, '2-1').state).toBe(second);
  });

  it('선택한 토큰은 대기열에서 제거되고 한 번만 소비된다', () => {
    const stage = fixture([{ strawberryDonut: 2 }, { strawberryDonut: 2 }]);
    const original = createGame(stage);
    const snapshot = structuredClone(original);
    const result = select(original, stage, 0);
    expect(original).toEqual(snapshot);
    expect(result.state.queues[0]).toHaveLength(19);
    expect(result.state.orders[0]?.remaining.strawberryDonut).toBe(1);
    expect(result.state.orders[1]?.remaining.strawberryDonut).toBe(2);
    expect(result.state.tray).toHaveLength(0);
    expect(result.events.filter(e => e.type === 'consumed')).toHaveLength(1);
    expect(selectDonut(result.state, stage, 0, '0-0').state).toBe(result.state);
  });
  it('화면 슬롯과 무관하게 주문 번호가 낮은 순서로 배정한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }, { strawberryDonut: 2 }]);
    const state = createGame(stage);
    [state.orders[0], state.orders[1]] = [state.orders[1] ?? null, state.orders[0] ?? null];
    const next = select(state, stage, 0).state;
    expect(next.orders[1]?.remaining.strawberryDonut).toBe(1);
    expect(next.orders[0]?.remaining.strawberryDonut).toBe(2);
  });
  it('필요하지 않은 도넛은 트레이에 남는다', () => {
    const stage = fixture([{ strawberryDonut: 1 }]);
    const next = select(createGame(stage), stage, 2).state;
    expect(next.tray[0]?.type).toBe('vanillaDonut');
    expect(next.completedOrders).toBe(0);
  });
  it('동시 완료 후 새 주문과 남은 트레이를 연쇄 매칭한다', () => {
    const stage = fixture([{ strawberryDonut: 1 }, { chocolateDonut: 1 }, { strawberryDonut: 1 }, { chocolateDonut: 1 }, { vanillaDonut: 1 }, { vanillaDonut: 1 }]);
    const state = createGame(stage);
    state.tray = [
      { id: 'a', type: 'strawberryDonut' }, { id: 'b', type: 'chocolateDonut' },
      { id: 'c', type: 'strawberryDonut' }, { id: 'd', type: 'chocolateDonut' },
      { id: 'e', type: 'vanillaDonut' },
    ];
    const result = select(state, stage, 2);
    expect(result.state.status).toBe('clear');
    expect(result.state.completedOrders).toBe(6);
    expect(result.state.nextOrderIndex).toBe(6);
    expect(result.state.orders).toEqual([null, null, null, null]);
    expect(result.events.filter(e => e.type === 'orderCompleted')).toHaveLength(6);
    expect(result.events.filter(e => e.type === 'orderAdded')).toHaveLength(2);
  });
  it('트레이가 차도 매칭 후 공간이 생기면 실패하지 않는다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const state = createGame(stage);
    state.tray = tray('vanillaDonut', BASE_TRAY_CAPACITY - 1);
    const next = select(state, stage, 0).state;
    expect(next.status).toBe('playing');
    expect(next.tray).toHaveLength(BASE_TRAY_CAPACITY - 1);
  });
  it('가득 찬 트레이를 비우면 디저트가 원래 열의 맨 뒤로 돌아가고 남은 횟수가 줄어든다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    let state = createGame(stage);
    const columns = Array.from({ length: BASE_TRAY_CAPACITY }, (_, index) => index % 2 + 1);
    for (const column of columns) state = select(state, stage, column).state;
    expect(state.status).toBe('blocked');
    expect(select(state, stage, 0).state).toBe(state);

    const full = state;
    expect(reduceGame(full, { type: 'GIVE_UP' }, stage)).toMatchObject({ status: 'gameover', trayClearsLeft: 1 });
    const returned = clearTray(full, stage);
    expect(returned.events.map(event => event.type === 'returned' ? event.queueIndex : null)).toEqual(columns);
    state = returned.state;
    expect(state.status).toBe('playing');
    expect(state.tray).toEqual([]);
    expect(state.trayCapacity).toBe(BASE_TRAY_CAPACITY);
    expect(state.trayClearsLeft).toBe(0);
    for (const column of [1, 2]) {
      const originalIds = new Set(stage.queues[column]!.map(token => token.id));
      expect(state.queues[column]).toEqual([
        ...full.queues[column]!,
        ...full.tray.filter(token => originalIds.has(token.id)),
      ]);
    }
    for (const column of columns) state = select(state, stage, column).state;
    expect(state.status).toBe('gameover');
  });
  it('비울 수 없는 상태와 비정상 액션을 안전하게 처리한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const state = createGame(stage);
    expect(reduceGame(state, { type: 'CLEAR_TRAY' }, stage)).toBe(state);
    for (const index of [-1, 0.5, QUEUE_COUNT, NaN]) expect(selectDonut(state, stage, index, 'bad').state).toBe(state);
    expect(selectDonut(state, stage, 0, '0-1').state).toBe(state);
    expect(selectDonut({ ...state, status: 'clear' }, stage, 0, '0-0').events).toEqual([]);
  });
  it('클리어를 트레이 용량과 대기열 소진보다 먼저 판정한다', () => {
    const stage = fixture([{ strawberryDonut: 1 }]);
    const state = createGame(stage);
    state.tray = tray('vanillaDonut', BASE_TRAY_CAPACITY - 1);
    state.queues = [[{ id: 'last', type: 'strawberryDonut' }], [], [], [], [], []];
    expect(select(state, stage, 0).state.status).toBe('clear');
  });
  it('대기열이 소진돼 필요한 디저트가 없으면 트레이에 공간이 있어도 막힘으로 판정한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const state = createGame(stage);
    state.queues = [[{ id: 'last', type: 'strawberryDonut' }], [], [], [], [], []];
    const exhausted = select(state, stage, 0).state;
    expect(exhausted).toMatchObject({ status: 'blocked', blockedReason: 'stuck' });
    expect(exhausted.tray.length).toBeLessThan(exhausted.trayCapacity);
  });
  it('남은 칸으로 필요한 디저트에 닿을 수 없으면 막힘, 닿을 수 있으면 계속 진행한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const blockers = (count: number) => Array.from({ length: count }, (_, i) => ({ id: 'b' + i, type: 'vanillaDonut' as DonutType }));
    const base = createGame(stage);
    // A strawberry sits behind three blockers: four free slots reach it, three do not.
    const queues = [[...blockers(3), { id: 'goal', type: 'strawberryDonut' as DonutType }], [], [], [], [], stage.queues[5]!.slice(0, 1)];
    const reachable = select({ ...base, queues, trayCapacity: 5 }, stage, 5).state;
    expect(reachable.status).toBe('playing');
    const stuck = select({ ...base, queues, trayCapacity: 4 }, stage, 5).state;
    expect(stuck).toMatchObject({ status: 'blocked', blockedReason: 'stuck' });

    const cleared = clearTray(stuck, stage).state;
    expect(cleared).toMatchObject({ status: 'playing', trayClearsLeft: 0 });
    expect(cleared.blockedReason).toBeUndefined();
    const lost = select({ ...base, queues, trayCapacity: 4, trayClearsLeft: 0 }, stage, 5).state;
    expect(lost).toMatchObject({ status: 'gameover', blockedReason: 'stuck' });
  });
  it('일시정지·재개·재시작은 입력을 제어하고 스테이지 원본을 보존한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const initial = createGame(stage);
    const paused = reduceGame(initial, { type: 'PAUSE' }, stage);
    expect(select(paused, stage, 0).state).toBe(paused);
    expect(clearTray(paused, stage).state).toBe(paused);
    expect(reduceGame(paused, { type: 'RESUME' }, stage).status).toBe('playing');
    const played = select(initial, stage, 0).state;
    const restarted = reduceGame(played, { type: 'RESTART' }, stage);
    expect(restarted).toEqual({ ...initial, transitionId: played.transitionId + 1 });
    expect(stage.queues[0]).toHaveLength(20);
  });
  it('동일 입력에는 동일한 상태와 이벤트를 반환한다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const state = createGame(stage);
    expect(select(state, stage, 0)).toEqual(select(state, stage, 0));
  });
  it.each([[0, 3], [1, 2], [2, 2], [3, 1]])('잔여량 %i의 별점은 %i이다', (count, expected) => {
    const state = createGame(fixture([{ strawberryDonut: 1 }]));
    state.status = 'clear';
    state.tray = tray('vanillaDonut', count);
    expect(getStars(state)).toBe(expected);
    expect(getStars({ ...state, status: 'gameover' })).toBe(0);
  });
});

describe('스테이지 해법과 게임 불변식', () => {
  for (const stage of replayed) {
    it('스테이지 ' + stage.id + '는 확장 없이 클리어할 수 있다', () => {
      expect(validateStage(stage)).toEqual([]);
      const original = structuredClone(stage);
      let state = createGame(stage);
      const solution = solutions[stage.id];
      if (!solution) throw new Error('해법 누락');
      for (const queue of solution) {
        expect(state.status).toBe('playing');
        state = select(state, stage, queue).state;
        expect(state.tray.length).toBeLessThan(stage.trayCapacity);
        // No clear is spent; a tray-clear reward picked up on the way adds one.
        expect(state.trayClearsLeft).toBe(1 + (state.collectedRewards ?? []).filter(reward => reward === 'trayClear').length);
      }
      expect(state.status).toBe('clear');
      expect(state.completedOrders).toBe(stage.targetOrders);
      expect(state.queues.every(queue => queue.length === 0)).toBe(true);
      expect(state.tray).toHaveLength(0);
      expect(stage).toEqual(original);
    });
    it('스테이지 ' + stage.id + '는 트레이 대기 후 매칭하는 실제 플레이 경로에서도 클리어한다', () => {
      let state = createGame(stage);
      for (const q of solutions[stage.id] ?? []) {
        state = collectReward(state, stage, q);
        const front = state.queues[q]?.[0];
        if (!front) throw new Error('해법의 대기열이 비었습니다.');
        state = selectDonut(state, stage, q, front.id, true).state;
        expect(state.tray.some(token => token.id === front.id)).toBe(true);
        state = matchTray(state, stage, front.id, true).state;
        const orderIds = stage.orders.map(order => order.id);
        for (;;) {
          const pickup = pickupTray(state, stage, orderIds, true);
          if (pickup.state === state) break;
          const recipients = pickup.events.flatMap(event => event.type === 'consumed' ? [event.orderId] : []);
          expect(new Set(recipients).size).toBe(recipients.length);
          state = pickup.state;
        }
      }
      expect(state.status).toBe('clear');
    });
  }
  for (const stage of authoredStages) {
    it('스테이지 ' + stage.id + '는 난이도에 맞는 종류 수와 트레이를 사용한다', () => {
      const variety = { easy: 10, normal: 12, hard: 14 };
      expect(stage.donutTypes).toHaveLength(variety[stage.difficulty ?? 'easy']);
      expect(stage.trayCapacity).toBe(TRAY_CAPACITY_BY_DIFFICULTY[stage.difficulty ?? 'easy']);
      expect(stage.queues).toHaveLength(QUEUE_COUNT);
      const quantities = stage.orders.flatMap(order => Object.values(order.items));
      expect(Math.max(...quantities)).toBeLessThanOrEqual(16);
      expect(Math.max(...stage.orders.map(order => Object.values(order.items).reduce((sum, n) => sum + n, 0)))).toBeLessThanOrEqual(16);
      expect(new Set(quantities).size).toBeGreaterThanOrEqual(4);
      expect(new Set(stage.queues.flat().map(token => token.type)).size).toBe(stage.donutTypes.length);
      expect(new Set(stage.orders.flatMap(order => Object.keys(order.items))).size).toBe(stage.donutTypes.length);
    });
    it('스테이지 ' + stage.id + '의 여러 선택 경로에서 토큰과 주문 수량을 보존한다', () => {
      for (let seed = 1; seed <= 20; seed += 1) {
        let n = seed;
        let state = createGame(stage);
        const total = stage.queues.flat().length;
        let consumed = 0;
        for (let turn = 0; turn <= total + stage.trayCapacity; turn += 1) {
          if (state.status === 'blocked') state = clearTray(state, stage).state;
          if (state.status !== 'playing') break;
          const choices = state.queues.map((q, i) => q.length ? i : -1).filter(i => i >= 0);
          n = (n * 1664525 + 1013904223) >>> 0;
          const q = choices[n % choices.length];
          if (q === undefined) break;
          const result = select(state, stage, q);
          consumed += result.events.filter(e => e.type === 'consumed').length;
          state = result.state;
          const tokens = [...state.queues.flat(), ...state.tray];
          expect(tokens.length + consumed).toBe(total);
          expect(new Set(tokens.map(t => t.id)).size).toBe(tokens.length);
          expect(state.tray.length).toBeLessThanOrEqual(state.trayCapacity);
          expect(state.completedOrders + state.orders.filter(Boolean).length).toBe(state.nextOrderIndex);
          expect(state.nextOrderIndex).toBeLessThanOrEqual(stage.targetOrders);
          for (const order of state.orders) for (const count of Object.values(order?.remaining ?? {})) expect(count).toBeGreaterThanOrEqual(0);
        }
        expect(['clear', 'gameover']).toContain(state.status);
      }
    });
  }
});

describe('세션 진행', () => {
  it('스테이지를 클리어해도 트레이 비우기는 늘어나지 않는다', () => {
    const stage = stages[0]!;
    const session = reduceSession(createSession(), { type: 'START', stageId: stage.id });
    expect(session.trayClears).toBe(3);
    expect(session.game.trayClearsLeft).toBe(2);
    const game = session.game;
    const order = game.orders[0]!;
    const type = stage.donutTypes[0]!;
    game.orders = [{ ...order, remaining: { [type]: 1 } }, null, null, null];
    game.completedOrders = stage.targetOrders - 1;
    game.nextOrderIndex = stage.targetOrders;
    game.tray = tray(type, 1);
    const cleared = reduceSession(session, { type: 'GAME', action: { type: 'PICKUP_TRAY', readyOrders: [order.definitionId], parallel: true } });
    expect(cleared.game.status).toBe('clear');
    expect(cleared.trayClears).toBe(3);
    const next = reduceSession(cleared, { type: 'START', stageId: stages[1]!.id });
    expect(next.game.trayClearsLeft).toBe(2);
  });

  it('트레이 비우기는 보유 3개로 시작해 쓸 때마다 줄고, 판당 2회까지 쓸 수 있다', () => {
    const stage = stages[0]!;
    const started = reduceSession(createSession(), { type: 'START', stageId: stage.id });
    expect(started.game.trayClearsLeft).toBe(2);
    const game = structuredClone(started.game);
    const queues = game.queues.map(queue => [...queue]);
    game.tray = queues[0]!.splice(0, 1);
    const used = reduceSession({ ...started, game: { ...game, queues } }, { type: 'GAME', action: { type: 'CLEAR_TRAY' } });
    expect(used.trayClears).toBe(2);
    expect(used.game.trayClearsLeft).toBe(1);
    expect(reduceSession(used, { type: 'GAME', action: { type: 'RESTART' } }).game.trayClearsLeft).toBe(2);
    // The per-game cap doesn't depend on the pool: once it is empty, rewarded ads pay for each clear.
    const empty = { ...createSession(), trayClears: 0 };
    const startedEmpty = reduceSession(empty, { type: 'START', stageId: stage.id });
    expect(startedEmpty.game.trayClearsLeft).toBe(2);
    const emptyGame = structuredClone(startedEmpty.game);
    emptyGame.tray = emptyGame.queues[0]!.splice(0, 1);
    const viaAd = reduceSession({ ...startedEmpty, game: emptyGame }, { type: 'GAME', action: { type: 'CLEAR_TRAY' } });
    expect(viaAd.game.trayClearsLeft).toBe(1);
    expect(viaAd.trayClears).toBe(0);
  });

  it('패스가 있으면 트레이 비우기를 써도 보유 개수가 줄지 않고, 판당 상한은 그대로다', () => {
    const stage = stages[0]!;
    const withPass = reduceSession(createSession(), { type: 'BUY_PASS', now: 0 });
    const started = reduceSession(withPass, { type: 'START', stageId: stage.id, now: 1 });
    expect(started.game.trayClearsLeft).toBe(2);
    const game = structuredClone(started.game);
    game.tray = game.queues[0]!.splice(0, 1);
    const used = reduceSession({ ...started, game }, { type: 'GAME', action: { type: 'CLEAR_TRAY' }, now: 2 });
    expect(used.game.trayClearsLeft).toBe(1);
    expect(used.trayClears).toBe(3);
    const expired = reduceSession({ ...started, game }, { type: 'GAME', action: { type: 'CLEAR_TRAY' }, now: 31 * 24 * 60 * 60_000 });
    expect(expired.trayClears).toBe(2);
  });

  it('게임 중에도 트레이를 비울 수 있지만 비어 있으면 비울 수 없다', () => {
    const stage = fixture([{ strawberryDonut: 2 }]);
    const empty = createGame(stage);
    expect(clearTray(empty, stage).state).toBe(empty);
    const queues = empty.queues.map(queue => [...queue]);
    const taken = queues[1]!.splice(0, 2);
    const result = clearTray({ ...empty, queues, tray: taken }, stage);
    expect(result.state).toMatchObject({ status: 'playing', tray: [], trayClearsLeft: 0 });
    expect(result.state.queues[1]!.slice(-2)).toEqual(taken);
  });

  it('테스트 스테이지은 손님 한 명의 디저트 하나로 완료되며 일반 진행에 영향을 주지 않는다', () => {
    const initial = createSession();
    const practice = reduceSession(initial, { type: 'START', stageId: practiceStage.id });
    const queueIndex = practice.game.queues.findIndex(queue => queue[0]?.type === 'strawberryDonut');
    const front = practice.game.queues[queueIndex]?.[0];
    if (!front) throw new Error('테스트 디저트가 없습니다.');
    expect(practice.game.orders.filter(Boolean)).toHaveLength(1);
    const cleared = reduceSession(practice, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex, expectedDonutId: front.id } });
    expect(cleared.game.status).toBe('clear');
    expect(getStars(cleared.game)).toBe(3);
    expect(cleared.score).toBe(initial.score);
    expect(cleared.stars).toEqual(initial.stars);
  });

  it('테스트 스테이지에서 트레이 비우기를 한 번 사용하고 다시 가득 차면 실패한다', () => {
    let state = createGame(practiceStage);
    function fillTray() {
      while (state.status === 'playing') {
        const column = state.queues.findIndex(queue => queue[0]?.type === 'chocolateDonut');
        expect(column).toBeGreaterThanOrEqual(0);
        state = select(state, practiceStage, column).state;
      }
    }
    fillTray();
    expect(state.status).toBe('blocked');
    expect(state.tray).toHaveLength(BASE_TRAY_CAPACITY);
    state = clearTray(state, practiceStage).state;
    fillTray();
    expect(state.status).toBe('gameover');
    expect(state.tray).toHaveLength(BASE_TRAY_CAPACITY);
  });

  it('게임 시작 직후 첫 주문과 대기열 선두에 크루아상과 초코 아이스크림가 있다', () => {
    const { game } = reduceSession(createSession(), { type: 'START', stageId: 1 });
    expect(game.orders[0]?.remaining).toMatchObject({ croissant: 4, chocolateIceCream: 3 });
    expect(game.queues.map(queue => queue[0]?.type)).toEqual(expect.arrayContaining(['croissant', 'chocolateIceCream']));
  });

  it('잠긴 스테이지과 범위 밖 스테이지 진입을 막는다', () => {
    const session = createSession();
    expect(reduceSession(session, { type: 'START', stageId: 5 })).toBe(session);
    expect(isUnlocked((stages.at(-1)?.id ?? 0) + 1, { 5: 3 })).toBe(false);
  });
  it('가장 높이 클리어한 스테이지의 다음 스테이지까지만 열린다', () => {
    expect(stages).toHaveLength(STAGE_COUNT);
    expect(stages.map(stage => stage.id)).toEqual(Array.from({ length: STAGE_COUNT }, (_, index) => index + 1));
    const stars = { 1: 3, 2: 1, 40: 2 };
    expect(getCurrentStage(stars)).toBe(41);
    expect(isUnlocked(10, stars)).toBe(true);
    expect(isUnlocked(41, stars)).toBe(true);
    expect(isUnlocked(42, stars)).toBe(false);
    expect(getCurrentStage({ [STAGE_COUNT]: 1 })).toBe(STAGE_COUNT);
    expect(encodeStars(stars)).toBe('31' + '-'.repeat(37) + '2');
    expect(encodeStars({ 1: 3, 2: 0 })).toBe('30');
    expect(getCurrentStage({ 1: 3, 2: 0 })).toBe(3);
    expect(encodeStars({})).toBe('');
  });
  it('테스트 모드에서 모든 등록된 스테이지에 진입할 수 있다', () => {
    const session = createSession(true);
    for (const stage of stages) {
      expect(isUnlocked(stage.id, session.stars, session.unlockAllStages)).toBe(true);
      expect(reduceSession(session, { type: 'START', stageId: stage.id }).game.stageId).toBe(stage.id);
      expect(['easy', 'normal', 'hard']).toContain(stage.difficulty);
    }
    const missingStage = (stages.at(-1)?.id ?? 0) + 1;
    expect(reduceSession(session, { type: 'START', stageId: missingStage })).toBe(session);
    expect(getCurrentStage(session.stars)).toBe(1);
  });

  it('클리어 시 별점을 기록하고 다음 스테이지을 연다', () => {
    let session = reduceSession(createSession(), { type: 'START', stageId: 1 });
    for (const q of solutions[1] ?? []) {
      const front = session.game.queues[q]?.[0];
      if (!front) throw new Error('해법 불일치');
      session = reduceSession(session, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex: q, expectedDonutId: front.id } });
    }
    expect(session.stars[1]).toBeGreaterThan(0);
    expect(session.score).toBe(session.game.completedOrders * 100);
    const restarted = reduceSession(session, { type: 'GAME', action: { type: 'RESTART' } });
    expect(restarted.score).toBe(session.score);
    expect(reduceSession(session, { type: 'START', stageId: 2 }).score).toBe(session.score);
    expect(isUnlocked(2, session.stars)).toBe(true);
    expect(reduceSession(session, { type: 'START', stageId: 2 }).game.stageId).toBe(2);
  });
});
