import type { DonutToken, RewardKind, StageDefinition } from '../types';
import { isFeaturePreviewStage } from '../constants';

// Features that join the campaign as it goes on. Rewards are laid over stored layouts at load time,
// so the generator and its saved solutions stay unchanged.
export const REWARDS_FROM_STAGE = 25;
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
      queues = withReward(queues, stage.id, column, index, random(2) === 0 ? 'heart' : 'trayClear');
    }
  }
  return { ...stage, queues };
}

// Playtest layout: from stage 25, both rewards sit second in a queue.
function previewStage(stage: StageDefinition): StageDefinition {
  if (stage.id < REWARDS_FROM_STAGE) return stage;
  const queues = withReward(withReward(stage.queues, stage.id, 1, 1, 'heart'), stage.id, 3, 1, 'trayClear');
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
