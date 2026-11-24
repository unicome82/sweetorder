import type { DonutToken, RewardKind, StageDefinition } from '../types';
import { isFeaturePreviewStage } from '../constants';

// Features that join the campaign as it goes on. Rewards are laid over stored layouts at load time,
// so the generator and its saved solutions stay unchanged.
export const REWARDS_FROM_STAGE = 25;
/** Share of stages (in percent) that carry a reward at all. */
export const REWARD_STAGE_PERCENT = 40;
/** How a reward splits between the kinds, in percent; quick orders only from QUICK_ORDER_FROM_STAGE (before it, a heart). */
export const REWARD_SPLIT_PERCENT = { heart: 50, trayClear: 35, quickOrder: 15 } as const;
export const QUICK_ORDER_FROM_STAGE = 30;
// A reward slot never sits within a queue's first few desserts, so it takes some digging to reach.
export const REWARD_MIN_DEPTH = 3;

function randomFor(seed: number) {
  let state = seed >>> 0;
  return (size: number) => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return Math.floor(state / 0x100000000 * size);
  };
}

export function decorateStage(stage: StageDefinition): StageDefinition {
  if (isFeaturePreviewStage(stage.id)) return previewStage(stage);
  const kind = rewardFor(stage.id);
  if (!kind) return stage;
  const spots = stage.queues.flatMap((queue, column) => queue.flatMap((token, index) =>
    index >= REWARD_MIN_DEPTH && !token.hidden ? [[column, index] as const] : []));
  if (!spots.length) return stage;
  const [column, index] = spots[randomFor(stage.id * 7919 + 17)(spots.length)]!;
  return { ...stage, queues: withReward(stage.queues, stage.id, column, index, kind) };
}

/** The reward a campaign stage carries, if any: fixed per stage, so retries can't reroll it. */
export function rewardFor(id: number): RewardKind | undefined {
  if (id < REWARDS_FROM_STAGE) return undefined;
  const random = randomFor(id * 104_729 + 31);
  if (random(100) >= REWARD_STAGE_PERCENT) return undefined;
  const roll = random(100);
  if (roll < REWARD_SPLIT_PERCENT.heart) return 'heart';
  if (roll < REWARD_SPLIT_PERCENT.heart + REWARD_SPLIT_PERCENT.trayClear) return 'trayClear';
  return id >= QUICK_ORDER_FROM_STAGE ? 'quickOrder' : 'heart';
}

// Playtest layout: from stage 25, every reward sits second in a queue.
function previewStage(stage: StageDefinition): StageDefinition {
  if (stage.id < REWARDS_FROM_STAGE) return stage;
  const queues = withReward(withReward(withReward(stage.queues, stage.id, 1, 1, 'heart'), stage.id, 3, 1, 'trayClear'), stage.id, 5, 1, 'quickOrder');
  return { ...stage, queues };
}

/** Inserts a reward slot before the dessert at `index` in a queue. */
function withReward(queues: DonutToken[][], stageId: number, column: number, index: number, reward: RewardKind): DonutToken[][] {
  return queues.map((queue, c) => {
    if (c !== column) return queue;
    const slot: DonutToken = { id: `s${stageId}-reward-${column}`, type: queue[index]!.type, reward };
    return [...queue.slice(0, index), slot, ...queue.slice(index)];
  });
}
