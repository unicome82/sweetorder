import { describe, expect, it } from 'vitest';
import { createSession, reduceSession, RELAXED_TRAY_CLEARS, STARTING_TRAY_CLEARS, type SessionState } from './session';
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
  it('타이머와 VIP, 트레이 비우기 보상이 없고 트레이 비우기는 1번만 무료로 준다', async () => {
    const stage = await stageWithReward('trayClear');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const session = start(stage.id, true);
      expect(session.game.relaxed).toBe(true);
      expect(getGameTimeLimit(session.game, stage)).toBe(0);
      expect(session.game.vipOrderIds).toBeUndefined();
      expect(session.game.orders.some(order => order?.vip)).toBe(false);
      expect(session.game.queues.flat().some(token => token.reward === 'trayClear')).toBe(false);
      expect(session.game.trayClearsLeft).toBe(RELAXED_TRAY_CLEARS);
    }
    const heartStage = await stageWithReward('heart');
    expect(start(heartStage.id, true).game.queues.flat().some(token => token.reward === 'heart')).toBe(true);
  });

  it('트레이 비우기를 써도 보유 개수는 그대로이고, 다시 하기도 여유 모드로 시작한다', async () => {
    const stage = await loadStage(30);
    const session = start(stage.id, true, { ...createSession(true), trayClears: 0 });
    expect(session.game.trayClearsLeft).toBe(1);
    const used = reduceSession(session, { type: 'GAME', action: { type: 'CLEAR_TRAY' } });
    expect(used.trayClears).toBe(0);
    const restarted = reduceSession({ ...used, game: { ...used.game, status: 'gameover' } }, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(restarted.game.relaxed).toBe(true);
    expect(restarted.game.trayClearsLeft).toBe(1);
    expect(restarted.trayClears).toBe(0);
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
  it('보유한 트레이 비우기를 모두 쓸 수 있다', async () => {
    const session = start(30, false, { ...createSession(true), trayClears: 5 });
    expect(session.game.relaxed).toBeUndefined();
    expect(session.game.trayClearsLeft).toBe(5);
  });
});
