import type { DonutToken, RewardKind, StageDefinition } from '../types';
import { isFeaturePreviewStage } from '../constants';

// Features that join the campaign as it goes on. Rewards are laid over stored layouts at load time,
// so the generator and its saved solutions stay unchanged.
export const REWARDS_FROM_STAGE = 25;
// A quick order takes the place of a stage's reward about once every 10 to 15 stages from here.
export const QUICK_ORDER_FROM_STAGE = 30;
const QUICK_ORDER_GAP_MIN = 10;
const QUICK_ORDER_GAP_MAX = 15;
// A reward slot never sits within a queue's first few desserts, so it takes some digging to reach.
const REWARD_MIN_DEPTH = 3;

function randomFor(seed: number) {
  let state = seed >>> 0;
  return (size: number) => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return Math.floor(state / 0x100000000 * size);
  };
}

export function decorateStage(stage: StageDefinition): StageDefinition {
  if (isFeaturePreviewStage(stage.id)) return previewStage(stage);
  const random = randomFor(stage.id * 7919 + 17);
  let queues = stage.queues;
  if (stage.id >= REWARDS_FROM_STAGE) {
    const spots = queues.flatMap((queue, column) => queue.flatMap((token, index) =>
      index >= REWARD_MIN_DEPTH && !token.hidden ? [[column, index] as const] : []));
    if (spots.length) {
      const [column, index] = spots[random(spots.length)]!;
      const reward = random(2) === 0 ? 'heart' : 'trayClear';
      queues = withReward(queues, stage.id, column, index, isQuickOrderStage(stage.id) ? 'quickOrder' : reward);
    }
  }
  return { ...stage, queues };
}

// Stages that carry a quick order, walked from the first one with gaps of 10 to 15 stages; grown as needed.
const quickOrderStages = [QUICK_ORDER_FROM_STAGE];
const quickOrderGap = randomFor(0x9e3779b9);
export function isQuickOrderStage(id: number): boolean {
  while (quickOrderStages.at(-1)! < id) {
    quickOrderStages.push(quickOrderStages.at(-1)! + QUICK_ORDER_GAP_MIN + quickOrderGap(QUICK_ORDER_GAP_MAX - QUICK_ORDER_GAP_MIN + 1));
  }
  return quickOrderStages.includes(id);
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
