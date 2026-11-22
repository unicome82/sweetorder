import type { DonutToken, RewardKind, StageDefinition } from '../types';
import { BONUS_STAGE_ID, isFeaturePreviewStage } from '../constants';

// Features that join the campaign as it goes on. Rewards are laid over stored layouts at load time and
// VIPs are rolled for each attempt,
// so the generator and its saved solutions stay unchanged.
export const VIP_FROM_STAGE = 15;
export const REWARDS_FROM_STAGE = 25;
/** Seconds a finished VIP order adds to the clock. */
export const VIP_BONUS_MS = 5_000;
/** Chance that each VIP a stage allows actually shows up on an attempt. */
export const VIP_CHANCE = 0.6;
// VIPs skip the opening customers so the first one arrives mid-stage, and the closing ones so the bonus time still helps.
export const VIP_SKIP_FIRST = 4;
export const VIP_SKIP_LAST = 2;
// A reward slot never sits within a queue's first few desserts, so it takes some digging to reach.
const REWARD_MIN_DEPTH = 3;

function randomFor(seed: number) {
  let state = seed >>> 0;
  return (size: number) => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return Math.floor(state / 0x100000000 * size);
  };
}

/** Up to one VIP at stage 15, two from stage 55 and three from stage 95. */
export function vipCount(id: number): number {
  return id < VIP_FROM_STAGE || id >= BONUS_STAGE_ID ? 0 : Math.min(3, 1 + Math.floor((id - VIP_FROM_STAGE) / 40));
}

/** Picks this attempt's VIP customers afresh, so a retry can bring different ones, or none. */
export function rollVipOrders(stage: StageDefinition, random: () => number = Math.random): string[] {
  const candidates = stage.orders.slice(0, stage.targetOrders).map(order => order.id)
    .slice(VIP_SKIP_FIRST, Math.max(VIP_SKIP_FIRST, stage.targetOrders - VIP_SKIP_LAST));
  const vips: string[] = [];
  for (let n = vipCount(stage.id); n > 0 && candidates.length; n -= 1) {
    if (random() < VIP_CHANCE) vips.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]!);
  }
  return vips;
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

// Playtest layout: the first customer is a VIP and, from stage 25, both rewards sit second in a queue.
function previewStage(stage: StageDefinition): StageDefinition {
  const orders = stage.orders.map((order, index) => index === 0 ? { ...order, vip: true } : order);
  if (stage.id < REWARDS_FROM_STAGE) return { ...stage, orders };
  const queues = withReward(withReward(stage.queues, stage.id, 1, 1, 'heart'), stage.id, 3, 1, 'trayClear');
  return { ...stage, orders, queues };
}

/** Inserts a reward slot before the dessert at `index` in a queue. */
function withReward(queues: DonutToken[][], stageId: number, column: number, index: number, reward: RewardKind): DonutToken[][] {
  return queues.map((queue, c) => {
    if (c !== column) return queue;
    const slot: DonutToken = { id: `s${stageId}-reward-${column}`, type: queue[index]!.type, reward };
    return [...queue.slice(0, index), slot, ...queue.slice(index)];
  });
}
