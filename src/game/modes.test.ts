import { describe, expect, it } from 'vitest';
import { createSession, reduceSession, RELAXED_TRAY_CLEARS, STARTING_TRAY_CLEARS, TIMED_TRAY_CLEARS_PER_GAME, type SessionState } from './session';
import { loadStage } from './stages';
import { getGameTimeLimit } from './stageTime';
import type { GameState, StageDefinition } from './types';

async function stageWithReward(reward: 'heart' | 'trayClear'): Promise<StageDefinition> {
  for (let id = 25; id < 200; id += 1) {
    const stage = await loadStage(id);
    if (stage.queues.flat().some(token => token.reward === reward)) return stage;
  }
  throw new Error(`no ${reward} reward stage`);
}

/** Leaves one dessert to deliver so the next pickup clears the stage. */
function finishing(session: SessionState, stage: StageDefinition) {
  const game: GameState = structuredClone(session.game);
  const order = game.orders[0]!;
  const type = stage.donutTypes[0]!;
  game.orders = [{ ...order, remaining: { [type]: 1 } }, null, null, null];
  game.completedOrders = stage.targetOrders - 1;
  game.nextOrderIndex = stage.targetOrders;
  game.tray = [{ id: 'last', type }];
  const action = { type: 'PICKUP_TRAY', readyOrders: [order.definitionId], parallel: true } as const;
  return reduceSession({ ...session, game }, { type: 'GAME', action: { ...action, remainingTimeMs: 10_000_000 } });
}

const start = (stageId: number, relaxed: boolean, session = createSession(true)) =>
  reduceSession(session, { type: 'START', stageId, relaxed, now: 0 });

describe('여유 모드', () => {
  it('타이머와 트레이 비우기 보상이 없고 트레이 비우기는 판당 1번까지 쓴다', async () => {
    const stage = await stageWithReward('trayClear');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const session = start(stage.id, true);
      expect(session.game.relaxed).toBe(true);
      expect(getGameTimeLimit(session.game, stage)).toBe(0);
      expect(session.game.queues.flat().some(token => token.reward === 'trayClear')).toBe(false);
      expect(session.game.trayClearsLeft).toBe(RELAXED_TRAY_CLEARS);
    }
    const heartStage = await stageWithReward('heart');
    const lowHearts = { ...createSession(true), hearts: { count: 3, bonus: 0, refillFrom: 0 } };
    expect(start(heartStage.id, true, lowHearts).game.queues.flat().some(token => token.reward === 'heart')).toBe(true);
  });

  it('트레이 비우기는 판당 1번, 보유분에서 차감되고, 다시 하기도 여유 모드로 시작한다', async () => {
    const stage = await loadStage(30);
    expect(start(stage.id, true, { ...createSession(true), trayClears: 0 }).game.trayClearsLeft).toBe(1);
    const session = start(stage.id, true, { ...createSession(true), trayClears: 3 });
    expect(session.game.trayClearsLeft).toBe(1);
    const game = structuredClone(session.game);
    game.tray = game.queues[0]!.splice(0, 1);
    const used = reduceSession({ ...session, game }, { type: 'GAME', action: { type: 'CLEAR_TRAY' } });
    expect(used.game.trayClearsLeft).toBe(0);
    expect(used.trayClears).toBe(2);
    const restarted = reduceSession({ ...used, game: { ...used.game, status: 'gameover' } }, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(restarted.game.relaxed).toBe(true);
    expect(restarted.game.trayClearsLeft).toBe(1);
    expect(restarted.trayClears).toBe(2);
  });

  it('클리어하면 별 없이 기록하고 다음 스테이지를 연다', async () => {
    const stage = await loadStage(1);
    const cleared = finishing(start(1, true, createSession()), stage);
    expect(cleared.game.status).toBe('clear');
    expect(cleared.stars[1]).toBe(0);
    expect(cleared.trayClears).toBe(STARTING_TRAY_CLEARS);
    const after = reduceSession(cleared, { type: 'START', stageId: 2, now: 0 });
    expect(after.game.stageId).toBe(2);
    const timed = finishing(start(1, false, { ...cleared, screen: 'stages' }), stage);
    expect(timed.stars[1]).toBe(3);
    expect(finishing(start(1, true, { ...timed, screen: 'stages' }), stage).stars[1]).toBe(3);
  });
});

describe('타이머 모드', () => {
  it('보유가 많아도 판당 2회까지만 쓸 수 있다', async () => {
    const session = start(30, false, { ...createSession(true), trayClears: 5 });
    expect(session.game.relaxed).toBeUndefined();
    expect(session.game.trayClearsLeft).toBe(TIMED_TRAY_CLEARS_PER_GAME);
  });

  it('클리어해도 트레이 비우기는 늘지 않는다', async () => {
    const stage = await loadStage(1);
    const first = finishing(start(1, false, createSession()), stage);
    expect(first.trayClears).toBe(STARTING_TRAY_CLEARS);
  });
});
