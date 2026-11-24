import { describe, expect, it } from 'vitest';
import { createGame, selectDonut } from './engine';
import { createSession, reduceSession } from './session';
import { loadStage } from './stages';
import { REWARD_SPLIT_PERCENT, REWARD_STAGE_PERCENT, REWARDS_FROM_STAGE, rewardFor } from './stages/extras';
import { DAILY_REWARD_LIMITS, MAX_TRAY_CLEARS, type SessionState } from './session';
import { STAGE_COUNT } from './stages/schedule';
import type { GameState } from './types';
import { isFeaturePreviewStage } from './constants';
import { dayKey } from './day';

// While the playtest flag is on, stage 25 uses the preview layout; check the rules one stage later.
const real = (id: number) => isFeaturePreviewStage(id) ? id + 1 : id;

function rewardSpot(state: GameState) {
  for (const [column, queue] of state.queues.entries()) {
    const index = queue.findIndex(token => token.reward);
    if (index >= 0) return { column, index, reward: queue[index]!.reward! };
  }
  return undefined;
}

/** The first ordinary stage whose queue reward is this kind. */
function stageWith(kind: string): number {
  let id = real(REWARDS_FROM_STAGE);
  while (isFeaturePreviewStage(id) || rewardFor(id) !== kind) id += 1;
  return id;
}

/** Digs straight down the reward's column, with room to spare in the tray. */
function collect(session: SessionState): SessionState {
  const { column, index } = rewardSpot(session.game)!;
  session = { ...session, game: { ...session.game, trayCapacity: 99 } };
  for (let n = 0; n <= index; n += 1) {
    const front = session.game.queues[column]![0]!;
    session = reduceSession(session, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex: column, expectedDonutId: front.id }, now: 0 });
  }
  return session;
}

describe('대기열 보상', () => {
  it(`${REWARDS_FROM_STAGE}번부터 약 ${REWARD_STAGE_PERCENT}%의 스테이지에 하나씩, 하트 > 트레이 비우기 > 퀵오더 순으로 자주 나온다`, () => {
    const counts = { none: 0, heart: 0, trayClear: 0, quickOrder: 0 };
    for (let id = 1; id < REWARDS_FROM_STAGE; id += 1) expect(rewardFor(id)).toBeUndefined();
    for (let id = REWARDS_FROM_STAGE; id <= STAGE_COUNT; id += 1) counts[rewardFor(id) ?? 'none'] += 1;
    const total = STAGE_COUNT - REWARDS_FROM_STAGE + 1;
    const rewarded = total - counts.none;
    expect(Math.abs(rewarded / total - REWARD_STAGE_PERCENT / 100)).toBeLessThan(0.02);
    for (const kind of ['heart', 'trayClear', 'quickOrder'] as const) {
      expect(Math.abs(counts[kind] / rewarded - REWARD_SPLIT_PERCENT[kind] / 100)).toBeLessThan(0.03);
    }
  });

  it('보상이 있는 스테이지에는 하나씩, 맨 앞 세 칸 밖의 보이는 디저트에 붙는다', async () => {
    const ids: number[] = [];
    for (let id = real(REWARDS_FROM_STAGE); ids.length < 4; id += 1) if (!isFeaturePreviewStage(id) && rewardFor(id)) ids.push(id);
    expect((await loadStage(REWARDS_FROM_STAGE - 1)).queues.flat().some(token => token.reward)).toBe(false);
    for (const id of ids) {
      const stage = await loadStage(id);
      const rewarded = stage.queues.flatMap(queue => queue.flatMap((token, index) => token.reward ? [{ token, index }] : []));
      expect(rewarded).toHaveLength(1);
      expect(rewarded[0]!.index).toBeGreaterThanOrEqual(3);
      expect(rewarded[0]!.token.hidden).toBeUndefined();
    }
  });

  it('보상 디저트를 1열에서 집으면 충전되고, 다시 하면 그 스테이지에는 보상이 없다', async () => {
    const ids: Partial<Record<string, number>> = {};
    for (let id = REWARDS_FROM_STAGE; !ids.heart; id += 1) {
      if (isFeaturePreviewStage(id)) continue;
      const spot = rewardSpot({ queues: (await loadStage(id)).queues } as GameState);
      if (spot?.reward === 'heart') ids.heart = id;
    }
    for (const [kind, id] of Object.entries(ids) as Array<[string, number]>) {
      let session = reduceSession({ ...createSession(true), hearts: { count: 3, refillFrom: 0 } }, { type: 'START', stageId: id, now: 0 });
      expect(session.hearts.count).toBe(2);
      const clears = session.game.trayClearsLeft;
      const { column, index } = rewardSpot(session.game)!;
      // Dig straight down the reward's column with room to spare in the tray.
      session = { ...session, game: { ...session.game, trayCapacity: 99 } };
      for (let n = 0; n <= index; n += 1) {
        const front = session.game.queues[column]![0]!;
        session = reduceSession(session, { type: 'GAME', action: { type: 'SELECT_DONUT', queueIndex: column, expectedDonutId: front.id }, now: 0 });
      }
      expect(session.game.collectedRewards).toEqual([kind]);
      expect(session.rewardedStages).toEqual([id]);
      expect(session.hearts.count).toBe(3);
      expect(session.game.trayClearsLeft).toBe(clears);

      const retried = reduceSession(session, { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
      expect(rewardSpot(retried.game)).toBeUndefined();
      const restarted = reduceSession({ ...retried, screen: 'stages' }, { type: 'START', stageId: id, now: 0 });
      expect(rewardSpot(restarted.game)).toBeUndefined();
    }
  });

  it('하트 보상은 하트가 4개 이하로 시작할 때만 나온다', async () => {
    let id = real(REWARDS_FROM_STAGE);
    while (isFeaturePreviewStage(id) || rewardSpot({ queues: (await loadStage(id)).queues } as GameState)?.reward !== 'heart') id += 1;
    const startWith = (count: number) =>
      reduceSession({ ...createSession(true), hearts: { count, refillFrom: 0 } }, { type: 'START', stageId: id, now: 0 });
    expect(rewardSpot(startWith(4).game)?.reward).toBe('heart');
    expect(rewardSpot(startWith(1).game)?.reward).toBe('heart');
    expect(rewardSpot(startWith(5).game)).toBeUndefined();
    const failed = startWith(5);
    const retried = reduceSession({ ...failed, hearts: { count: 3, refillFrom: 0 }, game: { ...failed.game, status: 'gameover' } },
      { type: 'GAME', action: { type: 'RESTART' }, now: 0 });
    expect(rewardSpot(retried.game)?.reward).toBe('heart');
  });
});

describe.runIf(isFeaturePreviewStage(25))('기능 미리보기 (테스트용)', () => {
  it('25번은 잠겨 있어도 열리고, 보상 2종이 둘째 칸에 있다', async () => {
    const at25 = reduceSession(createSession(), { type: 'START', stageId: 25, now: 0 });
    expect(at25.game.stageId).toBe(25);
    const stage25 = await loadStage(25);
    expect([stage25.queues[1]![1]!.reward, stage25.queues[3]![1]!.reward]).toEqual(['heart', 'trayClear']);
  });
});

describe('보상 칸', () => {
  it('트레이 비우기 보상은 보유분에 더해지고, 보유가 가득하면 나오지 않는다', () => {
    const id = stageWith('trayClear');
    const full = reduceSession({ ...createSession(true), trayClears: MAX_TRAY_CLEARS }, { type: 'START', stageId: id, now: 0 });
    expect(rewardSpot(full.game)).toBeUndefined();
    const session = collect(reduceSession({ ...createSession(true), trayClears: 1 }, { type: 'START', stageId: id, now: 0 }));
    expect(session.game.collectedRewards).toEqual(['trayClear']);
    expect(session.trayClears).toBe(2);
    expect(session.dailyRewards).toMatchObject({ trayClear: 1, heart: 0, quickOrder: 0 });
  });

  it('하루 한도에 닿은 보상은 시작할 때 빠지고, 다음 날 다시 나온다', () => {
    const day = 86_400_000;
    for (const kind of ['heart', 'trayClear', 'quickOrder'] as const) {
      const id = stageWith(kind);
      const capped: SessionState = {
        ...createSession(true), hearts: { count: 1, refillFrom: 0 }, trayClears: 0,
        dailyRewards: { day: dayKey(0), heart: 0, trayClear: 0, quickOrder: 0, [kind]: DAILY_REWARD_LIMITS[kind] },
      };
      expect(rewardSpot(reduceSession(capped, { type: 'START', stageId: id, now: 0 }).game)).toBeUndefined();
      // A day later the hearts would have refilled, so keep them short to leave room for a heart.
      const tomorrow = { ...capped, hearts: { count: 1, refillFrom: day } };
      expect(rewardSpot(reduceSession(tomorrow, { type: 'START', stageId: id, now: day }).game)?.reward).toBe(kind);
    }
  });

  it('트레이를 쓰지 않고, 트레이가 가득해도 맨 앞에 있으면 받을 수 있다', async () => {
    const stage = await loadStage(real(REWARDS_FROM_STAGE));
    const spot = rewardSpot({ queues: stage.queues } as GameState)!;
    const queues = stage.queues.map((queue, column) => column === spot.column ? queue.slice(spot.index) : queue);
    const full = { ...createGame(stage), queues, tray: Array.from({ length: stage.trayCapacity }, (_, i) => ({ id: `t${i}`, type: stage.donutTypes[0]! })) };
    const front = queues[spot.column]![0]!;
    const { state, events } = selectDonut(full, stage, spot.column, front.id);
    expect(events).toEqual([{ type: 'rewardCollected', reward: spot.reward, donutId: front.id, queueIndex: spot.column }]);
    expect(state.tray).toHaveLength(stage.trayCapacity);
    expect(state.queues[spot.column]).toHaveLength(queues[spot.column]!.length - 1);
  });
});
