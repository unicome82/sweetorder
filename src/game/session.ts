import { createGame, getStars } from './engine';
import { getStage, isBonusStage, isStageId, practiceStage, prepareBonusStage, STAGE_COUNT } from './stages';
import { reduceGame, type GameAction } from './reducer';
import { addHeart, canEarnHearts, chargeFromBonus, fullHearts, refillHearts, spendHeart, type HeartSource, type Hearts } from './hearts';
import type { DonutType, GameState } from './types';
import { isFeaturePreviewStage } from './constants';
import { dayKey } from './day';

const POINTS_PER_ORDER = 100;

export interface SessionState {
  screen: 'start' | 'stages' | 'game';
  game: GameState;
  /** Stars per cleared stage; 0 marks a stage cleared only in relaxed mode. */
  stars: Record<number, number>;
  score: number;
  unlockAllStages: boolean;
  unlimitedHearts: boolean;
  /** Tray clears the player owns; three at the very start and never refilled. */
  trayClears: number;
  hearts: Hearts;
  /** Which pool paid for the attempt in play, so a clear can give the heart back; unset when it was free. */
  heartPaidFrom?: HeartSource;
  /** Campaign stages whose queue reward has been picked up; each pays out only once. */
  rewardedStages: number[];
  /** The bonus stage in play and the campaign stage it leads on to. */
  bonus?: { dessert: DonutType; nextStageId: number };
  /** The local day (see dayKey) the daily bonus stage was last entered. */
  bonusDay?: string;
}
export type SessionAction =
  | { type: 'HOME' }
  | { type: 'STAGES' }
  | { type: 'START'; stageId: number; now?: number; relaxed?: boolean }
  /** testing: the Stage 00 playtest entry, which leaves the daily bonus stage unused. */
  | { type: 'START_BONUS'; dessert: DonutType; nextStageId: number; relaxed?: boolean; now?: number; testing?: boolean }
  | { type: 'GAME'; action: GameAction; now?: number }
  | { type: 'CHARGE_HEARTS'; amount?: number; now?: number };

export function createSession(unlockAllStages = false, unlimitedHearts = false): SessionState {
  return { screen: 'start', game: createGame(getStage(1)), stars: {}, score: 0, unlockAllStages, unlimitedHearts, trayClears: STARTING_TRAY_CLEARS, hearts: fullHearts(), rewardedStages: [] };
}
// Tray clears are a single owned pool: three at the very start and nothing refills it.
export const STARTING_TRAY_CLEARS = 3;
/** Older saves could hold up to this many; loading clamps to it. */
export const MAX_TRAY_CLEARS = 5;
/** Owned tray clears an attempt may use: two in timed play, one in relaxed play. */
export const TIMED_TRAY_CLEARS_PER_GAME = 2;
export const RELAXED_TRAY_CLEARS = 1;
export const trayClearsPerGame = (relaxed: boolean) => relaxed ? RELAXED_TRAY_CLEARS : TIMED_TRAY_CLEARS_PER_GAME;
/** Sets an attempt up for its mode (relaxed drops VIPs) and lets it use owned tray clears up to the per-game cap. */
function withMode(game: GameState, relaxed: boolean, trayClears: number): GameState {
  if (game.stageId === practiceStage.id) return game;
  const trayClearsLeft = Math.min(trayClears, trayClearsPerGame(relaxed));
  if (!relaxed) return { ...game, trayClearsLeft };
  const next: GameState = {
    ...game, relaxed: true, trayClearsLeft,
    orders: game.orders.map(order => order && { ...order, vip: undefined }),
  };
  delete next.vipOrderIds;
  for (const order of next.orders) if (order) delete order.vip;
  return next;
}
function createSessionGame(stageId: number, trayClears: number, rewardedStages: readonly number[], relaxed: boolean, heartReward: boolean): GameState {
  return withMode(withoutUnearnableRewards(withoutSpentRewards(createGame(getStage(stageId)), rewardedStages), heartReward), relaxed, trayClears);
}
/** Drops rewards the player can't take: hearts unless they could earn one, and tray clears always (they can't be earned). */
function withoutUnearnableRewards(game: GameState, heartReward: boolean): GameState {
  return withoutTrayClearReward(withoutHeartReward(game, heartReward));
}
function withoutTrayClearReward(game: GameState): GameState {
  return { ...game, queues: game.queues.map(queue => queue.filter(token => token.reward !== 'trayClear')) };
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
  return state.unlimitedHearts || isFreeStage(stageId) || refillHearts(state.hearts, now).count >= 1;
}
/** Pays one heart for an attempt at a campaign stage; null when no heart is left. */
function payForAttempt(state: SessionState, stageId: number, now: number): Pick<SessionState, 'hearts' | 'heartPaidFrom'> | null {
  if (state.unlimitedHearts || isFreeStage(stageId)) return { hearts: state.hearts, heartPaidFrom: undefined };
  const paid = spendHeart(state.hearts, now);
  return paid ? { hearts: paid.hearts, heartPaidFrom: paid.from } : null;
}

/** Whether the daily bonus stage is still unused on the device's current day. */
export function canPlayBonusToday(state: SessionState, now = Date.now()): boolean {
  return state.bonusDay !== dayKey(now);
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
      // Entering uses up the day's bonus stage, so leaving and coming back can't repeat it.
      const today = dayKey(action.now ?? Date.now());
      if (!action.testing && state.bonusDay === today) return state;
      const game = withMode(createGame(prepareBonusStage(action.dessert)), action.relaxed ?? false, state.trayClears);
      const bonusDay = action.testing ? state.bonusDay : today;
      return { ...state, screen: 'game', heartPaidFrom: undefined, bonus: { dessert: action.dessert, nextStageId: action.nextStageId }, bonusDay, game };
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
      if (restart) game = withMode(withoutUnearnableRewards(withoutSpentRewards(game, state.rewardedStages), canEarnHearts(state.hearts, now)), relaxed, state.trayClears);
      if (game.stageId === practiceStage.id) return { ...state, game };
      // Each tray clear used in play comes out of the owned pool.
      const usedClears = restart ? 0 : Math.max(0, state.game.trayClearsLeft - game.trayClearsLeft);
      const trayClears = Math.max(0, state.trayClears - usedClears);
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
        return { ...state, game, trayClears, hearts: newlyCleared ? addHeart(state.hearts, now, 'bonus') : state.hearts };
      }
      const paid = payment ?? { hearts: state.hearts, heartPaidFrom: state.heartPaidFrom };
      const refund = newlyCleared && paid.heartPaidFrom
        ? { hearts: addHeart(paid.hearts, now, paid.heartPaidFrom), heartPaidFrom: undefined }
        : paid;
      // Relaxed play records the clear without stars.
      const earnedStars = relaxed ? 0 : getStars(game);
      const stars = game.status === 'clear'
        ? { ...state.stars, [game.stageId]: Math.max(state.stars[game.stageId] ?? 0, earnedStars) }
        : state.stars;
      const completed = Math.max(0, game.completedOrders - state.game.completedOrders);
      return { ...state, ...refund, game, stars, trayClears, score: state.score + completed * POINTS_PER_ORDER };
    }
  }
}
