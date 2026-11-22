import { createGame, getStars } from './engine';
import { getStage, isBonusStage, isStageId, practiceStage, prepareBonusStage, STAGE_COUNT } from './stages';
import { reduceGame, type GameAction } from './reducer';
import { addHeart, canEarnHearts, chargeFromBonus, fullHearts, refillHearts, spendHeart, type HeartSource, type Hearts } from './hearts';
import type { DonutType, GameState } from './types';
import { isFeaturePreviewStage } from './constants';

const POINTS_PER_ORDER = 100;

export interface SessionState {
  screen: 'start' | 'stages' | 'game';
  game: GameState;
  /** Stars per cleared stage; 0 marks a stage cleared only in relaxed mode. */
  stars: Record<number, number>;
  score: number;
  unlockAllStages: boolean;
  /** Tray clears carried between stages; each stage clear earns one more. */
  trayClears: number;
  hearts: Hearts;
  /** Which pool paid for the attempt in play, so a clear can give the heart back; unset when it was free. */
  heartPaidFrom?: HeartSource;
  /** Campaign stages whose queue reward has been picked up; each pays out only once. */
  rewardedStages: number[];
  /** The bonus stage in play and the campaign stage it leads on to. */
  bonus?: { dessert: DonutType; nextStageId: number };
}
export type SessionAction =
  | { type: 'HOME' }
  | { type: 'STAGES' }
  | { type: 'START'; stageId: number; now?: number; relaxed?: boolean }
  | { type: 'START_BONUS'; dessert: DonutType; nextStageId: number; relaxed?: boolean }
  | { type: 'GAME'; action: GameAction; now?: number }
  | { type: 'CHARGE_HEARTS'; amount?: number; now?: number };

export function createSession(unlockAllStages = false): SessionState {
  return { screen: 'start', game: createGame(getStage(1)), stars: {}, score: 0, unlockAllStages, trayClears: STARTING_TRAY_CLEARS, hearts: fullHearts(), rewardedStages: [] };
}
// Tray clears are a single pool: three at the very start, +1 per stage clear, never refilled otherwise.
export const STARTING_TRAY_CLEARS = 3;
/** Relaxed attempts get one free tray clear of their own, so the carried pool and its rewards stay out of them. */
export const RELAXED_TRAY_CLEARS = 1;
/** Sets an attempt up for its mode: relaxed drops VIPs and tray-clear rewards; timed draws on the carried tray clears. */
function withMode(game: GameState, relaxed: boolean, trayClears: number): GameState {
  if (!relaxed) return game.stageId === practiceStage.id ? game : { ...game, trayClearsLeft: trayClears };
  const next: GameState = {
    ...game, relaxed: true, trayClearsLeft: RELAXED_TRAY_CLEARS,
    orders: game.orders.map(order => order && { ...order, vip: undefined }),
    queues: game.queues.map(queue => queue.filter(token => token.reward !== 'trayClear')),
  };
  delete next.vipOrderIds;
  for (const order of next.orders) if (order) delete order.vip;
  return next;
}
function createSessionGame(stageId: number, trayClears: number, rewardedStages: readonly number[], relaxed: boolean, heartReward: boolean): GameState {
  return withMode(withoutHeartReward(withoutSpentRewards(createGame(getStage(stageId)), rewardedStages), heartReward), relaxed, trayClears);
}
/** A heart reward only stays in the queues while the player could still earn hearts (checked as the attempt starts). */
function withoutHeartReward(game: GameState, keep: boolean): GameState {
  return keep ? game : { ...game, queues: game.queues.map(queue => queue.filter(token => token.reward !== 'heart')) };
}
/** A stage whose reward was already collected comes back without it, so retries can't farm it. */
function withoutSpentRewards(game: GameState, rewardedStages: readonly number[]): GameState {
  if (!rewardedStages.includes(game.stageId) || isFeaturePreviewStage(game.stageId)) return game;
  return { ...game, queues: game.queues.map(queue => queue.filter(token => !token.reward)) };
}
/** A heart picked up from the queues always goes to the bonus pool. */
function grantHeart(hearts: Hearts, now: number): Hearts {
  return addHeart(hearts, now, 'bonus');
}
/** Practice and bonus stages cost no heart. */
export const isFreeStage = (id: number) => id === practiceStage.id || isBonusStage(id);
/** Whether a paid attempt can start now. */
export function canAffordAttempt(state: SessionState, stageId: number, now = Date.now()): boolean {
  return isFreeStage(stageId) || refillHearts(state.hearts, now).count >= 1;
}
/** Pays one heart for an attempt at a campaign stage; null when no heart is left. */
function payForAttempt(state: SessionState, stageId: number, now: number): Pick<SessionState, 'hearts' | 'heartPaidFrom'> | null {
  if (isFreeStage(stageId)) return { hearts: state.hearts, heartPaidFrom: undefined };
  const paid = spendHeart(state.hearts, now);
  return paid ? { hearts: paid.hearts, heartPaidFrom: paid.from } : null;
}

/** The highest cleared stage id, in either mode; 0 before the first clear. */
export function highestCleared(stars: Record<number, number>): number {
  let highest = 0;
  for (const [key, count] of Object.entries(stars)) if (count >= 0) highest = Math.max(highest, Number(key));
  return highest;
}
/** Stages 1 through this id are open: everything cleared so far plus the next stage. */
export function unlockedThrough(stars: Record<number, number>, unlockAllStages = false): number {
  return unlockAllStages ? STAGE_COUNT : Math.min(STAGE_COUNT, highestCleared(stars) + 1);
}
export function isUnlocked(id: number, stars: Record<number, number>, unlockAllStages = false): boolean {
  if (id === practiceStage.id || isFeaturePreviewStage(id)) return true;
  return isStageId(id) && id <= unlockedThrough(stars, unlockAllStages);
}
/** The stage in progress: the one after the highest clear. */
export function getCurrentStage(stars: Record<number, number>): number {
  return unlockedThrough(stars);
}

export function reduceSession(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'HOME': return { ...state, screen: 'start', bonus: undefined };
    case 'STAGES': return { ...state, screen: 'stages', bonus: undefined };
    case 'START': {
      if (!isUnlocked(action.stageId, state.stars, state.unlockAllStages)) return state;
      const now = action.now ?? Date.now();
      const payment = payForAttempt(state, action.stageId, now);
      if (!payment) return state;
      const game = createSessionGame(action.stageId, state.trayClears, state.rewardedStages, action.relaxed ?? false, canEarnHearts(state.hearts, now));
      return { ...state, ...payment, bonus: undefined, screen: 'game', game };
    }
    case 'CHARGE_HEARTS': return { ...state, hearts: chargeFromBonus(state.hearts, action.now ?? Date.now(), action.amount) };
    case 'START_BONUS': {
      const game = withMode(createGame(prepareBonusStage(action.dessert)), action.relaxed ?? false, state.trayClears);
      return { ...state, screen: 'game', heartPaidFrom: undefined, bonus: { dessert: action.dessert, nextStageId: action.nextStageId }, game };
    }
    case 'GAME': {
      if (state.screen !== 'game') return state;
      const now = action.now ?? Date.now();
      const restart = action.action.type === 'RESTART';
      const payment = restart ? payForAttempt(state, state.game.stageId, now) : null;
      if (restart && !payment) return state;
      let game = reduceGame(state.game, action.action, getStage(state.game.stageId));
      if (game === state.game) return state;
      const relaxed = state.game.relaxed ?? false;
      if (restart) game = withMode(withoutHeartReward(withoutSpentRewards(game, state.rewardedStages), canEarnHearts(state.hearts, now)), relaxed, state.trayClears);
      if (game.stageId === practiceStage.id) return { ...state, game };
      const earned = restart ? [] : (game.collectedRewards ?? []).slice(state.game.collectedRewards?.length ?? 0);
      let rewardedStages = state.rewardedStages;
      let rewardHearts = state.hearts;
      if (earned.length) {
        if (!rewardedStages.includes(game.stageId)) rewardedStages = [...rewardedStages, game.stageId];
        for (const reward of earned) if (reward === 'heart') rewardHearts = grantHeart(rewardHearts, now);
      }
      state = { ...state, hearts: rewardHearts, rewardedStages };
      const newlyCleared = game.status === 'clear' && state.game.status !== 'clear';
      if (isBonusStage(game.stageId)) {
        // A bonus clear adds a heart that may go past the usual five; it leaves stars and tray clears alone.
        return { ...state, game, trayClears: relaxed ? state.trayClears : game.trayClearsLeft, hearts: newlyCleared ? addHeart(state.hearts, now, 'bonus') : state.hearts };
      }
      const paid = payment ?? { hearts: state.hearts, heartPaidFrom: state.heartPaidFrom };
      const refund = newlyCleared && paid.heartPaidFrom
        ? { hearts: addHeart(paid.hearts, now, paid.heartPaidFrom), heartPaidFrom: undefined }
        : paid;
      // Relaxed play leaves the carried tray clears alone and records the clear without stars.
      const trayClears = relaxed ? state.trayClears : game.trayClearsLeft + (newlyCleared ? 1 : 0);
      const earnedStars = relaxed ? 0 : getStars(game);
      const stars = game.status === 'clear'
        ? { ...state.stars, [game.stageId]: Math.max(state.stars[game.stageId] ?? 0, earnedStars) }
        : state.stars;
      const completed = Math.max(0, game.completedOrders - state.game.completedOrders);
      return { ...state, ...refund, game, stars, trayClears, score: state.score + completed * POINTS_PER_ORDER };
    }
  }
}
