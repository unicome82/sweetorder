import { createGame, getStars, MAX_QUICK_ORDERS } from './engine';
import { getStage, isBonusStage, isStageId, practiceStage, prepareBonusStage, STAGE_COUNT } from './stages';
import { hasHiddenDesserts, reduceGame, type GameAction } from './reducer';
import { addHeart, canEarnHearts, fullHearts, HEART_REFILL_MS, MAX_HEARTS, rebaseRefill, refillHearts, spendHeart } from './hearts';
import type { Hearts } from './hearts';
import type { DonutType, GameState, RewardKind } from './types';
import { isFeaturePreviewStage } from './constants';
import { dayKey } from './day';
import { isPassActive, purchasePass, type Pass } from '../monetization/pass';

export const POINTS_PER_ORDER = 100;

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
  heartPaidFrom?: HeartPayment;
  /** Campaign stages whose queue reward has been picked up; each pays out only once. */
  rewardedStages: number[];
  /** The bonus stage in play and the campaign stage it leads on to. */
  bonus?: { dessert: DonutType; nextStageId: number };
  /** The local day (see dayKey) the daily bonus stage was last entered. */
  bonusDay?: string;
  /** The premium pass from the latest purchase; it may have expired. */
  pass?: Pass;
  /** Quick orders the player holds (at most one), kept from game to game. */
  quickOrders: number;
  /** Queue rewards picked up on the device's current day (see dayKey); older days count as none. */
  dailyRewards?: DailyRewards;
  /** Finished attempts past the ad-free stages since the last interstitial (see monetization/interstitial). */
  gamesSinceAd: number;
}
export interface DailyRewards { day: string; heart: number; trayClear: number; quickOrder: number }
/** The most of each queue reward one day can pay out. */
export const DAILY_REWARD_LIMITS: Readonly<Record<RewardKind, number>> = { heart: 3, trayClear: 2, quickOrder: 1 };
/** Today's reward counts: a record from an earlier day starts again from zero. */
export function rewardsToday(state: Pick<SessionState, 'dailyRewards'>, now = Date.now()): DailyRewards {
  const day = dayKey(now);
  return state.dailyRewards?.day === day ? state.dailyRewards : { day, heart: 0, trayClear: 0, quickOrder: 0 };
}
export type SessionAction =
  | { type: 'HOME' }
  | { type: 'STAGES' }
  /** items: chosen in the pre-start popup, applied as the attempt begins. Retries start this way too. */
  | { type: 'START'; stageId: number; now?: number; relaxed?: boolean; items?: ItemChoice; adItems?: ItemChoice }
  /** testing: the Stage 00 playtest entry, which leaves the daily bonus stage unused. */
  | { type: 'START_BONUS'; dessert: DonutType; nextStageId: number; relaxed?: boolean; now?: number; testing?: boolean }
  | { type: 'GAME'; action: GameAction; now?: number }
  /** A rewarded ad for hearts was watched to the end: one heart. */
  | { type: 'AD_HEARTS'; now?: number }
  /** Moves this many pass spare hearts into the regular hearts, never past five. */
  | { type: 'CHARGE_SPARE'; amount: number; now?: number }
  | { type: 'BUY_PASS'; now?: number }
  /** The result of a campaign attempt was shown; the count toward the next interstitial goes on to this value. */
  | { type: 'COUNT_AD_GAME'; gamesSinceAd: number }
  /** Playtesting only: drops the pass as if it had run out. */
  | { type: 'END_PASS' }
  /** Playtesting only: fills the regular hearts to five, or empties them with the refill starting now. */
  | { type: 'TEST_HEARTS'; full: boolean; now?: number };

/** Items switched on in the pre-start popup; they can't be used once the attempt is under way. */
export interface ItemChoice { peek?: boolean; addTime?: boolean }

export function createSession(unlockAllStages = false, unlimitedHearts = false): SessionState {
  return { screen: 'start', game: createGame(getStage(1)), stars: {}, score: 0, unlockAllStages, unlimitedHearts, trayClears: STARTING_TRAY_CLEARS, hearts: fullHearts(), rewardedStages: [], quickOrders: 0, gamesSinceAd: 0 };
}
// Tray clears are a single owned pool: three at the very start, refilled only by queue rewards.
export const STARTING_TRAY_CLEARS = 3;
/** The most tray clears the pool holds; a reward that would go past it isn't offered. */
export const MAX_TRAY_CLEARS = 5;
/** Fallback tray clears an attempt may use: two in timed play, one in relaxed play. */
export const TIMED_TRAY_CLEARS_PER_GAME = 2;
export const RELAXED_TRAY_CLEARS = 1;
export const trayClearsPerGame = (relaxed: boolean) => relaxed ? RELAXED_TRAY_CLEARS : TIMED_TRAY_CLEARS_PER_GAME;
/**
 * Sets up the attempt with all owned tray clears and a capped fallback allowance.
 * A fallback use requires an ad unless a legacy pass covers it.
 */
function withMode(game: GameState, relaxed: boolean, ownedClears: number): GameState {
  if (game.stageId === practiceStage.id) return game;
  // Bonus stages have no tray clear: a full tray ends them.
  const trayClearsLeft = isBonusStage(game.stageId) ? 0 : ownedClears + trayClearsPerGame(relaxed);
  return relaxed ? { ...game, relaxed: true, trayClearsLeft } : { ...game, trayClearsLeft };
}
/** What the player could take from the queues as the attempt starts: room left to hold it, and today's limit not reached. */
type Earnable = Record<RewardKind, boolean>;
function earnable(state: SessionState, now: number): Earnable {
  const today = rewardsToday(state, now);
  const underLimit = (kind: RewardKind) => today[kind] < DAILY_REWARD_LIMITS[kind];
  return {
    heart: underLimit('heart') && canEarnHearts(state.hearts, now, heartsFastUntil(state)),
    trayClear: underLimit('trayClear') && state.trayClears < MAX_TRAY_CLEARS,
    quickOrder: underLimit('quickOrder') && state.quickOrders < MAX_QUICK_ORDERS,
  };
}
function createSessionGame(stageId: number, state: SessionState, relaxed: boolean, now: number): GameState {
  const game = { ...withoutSpentRewards(createGame(getStage(stageId)), state.rewardedStages), quickOrderAds: stageId !== practiceStage.id && !isBonusStage(stageId) };
  return withMode(withoutUnearnableRewards(game, earnable(state, now)), relaxed, state.trayClears + passTrayClears(state.pass, now));
}
/**
 * Drops rewards the player can't take, checked as the attempt starts: one they have no room for, or one today's limit
 * has run out on. A dropped reward isn't counted as collected, so the stage offers it again another time.
 */
function withoutUnearnableRewards(game: GameState, can: Earnable): GameState {
  return { ...game, queues: game.queues.map(queue => queue.filter(token => !token.reward || can[token.reward])) };
}
/**
 * The held quick order comes along into campaign and bonus attempts, plus all remaining pass quick orders;
 * practice has none.
 */
function withQuickOrders(game: GameState, quickOrders: number, pass: Pass | undefined, now: number): GameState {
  if (game.stageId === practiceStage.id) return game;
  const passQuickOrders = isPassActive(pass, now) ? pass.quickOrders : 0;
  return { ...game, quickOrders: quickOrders + passQuickOrders, passQuickOrders };
}
/** A stage whose reward was already collected comes back without it, so retries can't farm it. */
function withoutSpentRewards(game: GameState, rewardedStages: readonly number[]): GameState {
  if (!rewardedStages.includes(game.stageId) || isFeaturePreviewStage(game.stageId)) return game;
  return { ...game, queues: game.queues.map(queue => queue.filter(token => !token.reward)) };
}
/**
 * Items the pre-start popup can offer for this attempt. Peek: any stage with "?" desserts, from the pass while
 * its peeks last, otherwise for a rewarded ad. +5 seconds is offered in timed play.
 */
function availableItems(game: GameState): Required<ItemChoice> {
  const campaign = game.stageId !== practiceStage.id && !isBonusStage(game.stageId);
  return {
    peek: campaign && hasHiddenDesserts(game),
    addTime: campaign && !game.relaxed,
  };
}
/** Whether peek comes out of the pass for this attempt; otherwise it costs a rewarded ad. */
export function peekFromPass(pass: Pass | undefined, now = Date.now()): boolean {
  return isPassActive(pass, now) && pass.peeks > 0;
}
/** Whether +5 seconds comes out of the pass for this attempt. */
export function addTimeFromPass(pass: Pass | undefined, now = Date.now()): boolean {
  return isPassActive(pass, now) && pass.timeBonuses > 0;
}
/** The items the pre-start popup can offer for this stage; the stage must be loaded. */
export function itemsBeforeStart(stageId: number, relaxed: boolean): Required<ItemChoice> {
  return availableItems({ ...createGame(getStage(stageId)), relaxed });
}
/**
 * Applies the pre-start choice: peek opens with the "?" desserts shown, +5 seconds starts on the clock.
 * Each comes out of the pass when it can. Ad-funded items leave pass inventory alone.
 */
function applyItems(game: GameState, pass: Pass | undefined, choice: ItemChoice | undefined, now: number, adItems?: ItemChoice): { game: GameState; pass?: Pass } {
  if (!choice) return { game, pass };
  const available = availableItems(game);
  const passPeek = !!choice.peek && available.peek && !adItems?.peek && peekFromPass(pass, now);
  const passTime = !!choice.addTime && available.addTime && !adItems?.addTime && addTimeFromPass(pass, now);
  const peek = passPeek || (!!choice.peek && available.peek && !!adItems?.peek);
  const addTime = passTime || (!!choice.addTime && available.addTime && !!adItems?.addTime);
  if (!peek && !addTime) return { game, pass };
  return {
    game: { ...game, ...(peek ? { peeked: true } : {}), ...(addTime ? { timeBonusUsed: true } : {}) },
    pass: passPeek || passTime ? { ...pass!, peeks: pass!.peeks - (passPeek ? 1 : 0), timeBonuses: pass!.timeBonuses - (passTime ? 1 : 0) } : pass,
  };
}
/** Where an attempt's heart came from; only regular hearts pay (spare hearts are charged into them first). */
export type HeartPayment = 'regular';
/** Regular hearts refill twice as fast up to the end of the latest pass. */
export function heartsFastUntil({ pass, hearts }: Pick<SessionState, 'pass' | 'hearts'>): number | undefined {
  if (pass?.expiresAt !== undefined) return pass.expiresAt;
  return pass?.fastRefills ? hearts.refillFrom + pass.fastRefills * HEART_REFILL_MS / 2 : undefined;
}

export const passTrayClears = (pass: Pass | undefined, now: number) =>
  isPassActive(pass, now) ? pass.trayClears ?? 0 : 0;
/** Practice and bonus stages cost no heart. */
export const isFreeStage = (id: number) => id === practiceStage.id || isBonusStage(id);
/** Pass spare hearts usable now: only while the pass runs. */
export function spareHearts(state: Pick<SessionState, 'pass'>, now = Date.now()): number {
  return isPassActive(state.pass, now) ? state.pass.spareHearts : 0;
}
/** Whether a paid attempt can start now: it takes a regular heart. Spare hearts never pay on their own. */
export function canAffordAttempt(state: SessionState, stageId: number, now = Date.now()): boolean {
  return state.unlimitedHearts || isFreeStage(stageId) || refillHearts(state.hearts, now, heartsFastUntil(state)).count >= 1;
}
/** How many spare hearts could be charged into the regular hearts now (they fill up to five). */
export function chargeableSpareHearts(state: SessionState, now = Date.now()): number {
  return Math.min(spareHearts(state, now), Math.max(0, MAX_HEARTS - refillHearts(state.hearts, now, heartsFastUntil(state)).count));
}
/** Pays one regular heart for an attempt at a campaign stage; null when none is left. */
function payForAttempt(state: SessionState, stageId: number, now: number): Pick<SessionState, 'hearts' | 'heartPaidFrom'> | null {
  if (state.unlimitedHearts || isFreeStage(stageId)) return { hearts: state.hearts, heartPaidFrom: undefined };
  const paid = spendHeart(state.hearts, now, heartsFastUntil(state));
  return paid ? { hearts: paid, heartPaidFrom: 'regular' } : null;
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
  const nowForRefill = ('now' in action ? action.now : undefined) ?? Date.now();
  if (state.pass?.fastRefills) {
    const hearts = refillHearts(state.hearts, nowForRefill, heartsFastUntil(state));
    const gained = hearts.count - state.hearts.count;
    if (gained > 0) {
      state = { ...state, hearts, pass: { ...state.pass, fastRefills: Math.max(0, state.pass.fastRefills - gained) } };
    }
  }
  switch (action.type) {
    case 'HOME': return { ...state, screen: 'start', bonus: undefined };
    case 'STAGES': return { ...state, screen: 'stages', bonus: undefined };
    case 'START': {
      if (!isUnlocked(action.stageId, state.stars, state.unlockAllStages)) return state;
      const now = action.now ?? Date.now();
      const payment = payForAttempt(state, action.stageId, now);
      if (!payment) return state;
      const created = withQuickOrders(createSessionGame(action.stageId, state, action.relaxed ?? false, now), state.quickOrders, state.pass, now);
      const { game, pass } = applyItems(created, state.pass, action.items, now, action.adItems);
      return { ...state, ...payment, pass, bonus: undefined, screen: 'game', game };
    }
    case 'COUNT_AD_GAME': return { ...state, gamesSinceAd: action.gamesSinceAd };
    case 'BUY_PASS': {
      // The running refill keeps its progress and goes on at double speed until the new end.
      const now = action.now ?? Date.now();
      const pass = purchasePass(state.pass, now);
      const game = state.screen === 'game'
        ? withQuickOrders({ ...state.game, trayClearsLeft: state.game.quickOrderAds
          ? state.game.trayClearsLeft + passTrayClears(pass, now) - passTrayClears(state.pass, now)
          : state.game.trayClearsLeft }, state.quickOrders, pass, now)
        : state.game;
      return { ...state, game, pass, hearts: rebaseRefill(state.hearts, now, heartsFastUntil(state), Infinity) };
    }
    case 'END_PASS': {
      const now = Date.now();
      const endedAt = heartsFastUntil(state);
      const game = state.screen === 'game' ? withQuickOrders({ ...state.game, trayClearsLeft: state.game.quickOrderAds ? Math.max(0, state.game.trayClearsLeft - passTrayClears(state.pass, now)) : state.game.trayClearsLeft }, state.quickOrders, undefined, now) : state.game;
      return { ...state, game, pass: undefined, hearts: rebaseRefill(state.hearts, now, endedAt, undefined) };
    }
    case 'CHARGE_SPARE': {
      // The player chose to move spare hearts into the regular hearts.
      const now = action.now ?? Date.now();
      const amount = Math.min(Math.max(0, Math.floor(action.amount)), chargeableSpareHearts(state, now));
      if (!amount) return state;
      const hearts = refillHearts(state.hearts, now, heartsFastUntil(state));
      return { ...state, hearts: { ...hearts, count: hearts.count + amount }, pass: { ...state.pass!, spareHearts: state.pass!.spareHearts - amount } };
    }
    case 'TEST_HEARTS': return { ...state, hearts: action.full ? fullHearts() : { count: 0, refillFrom: action.now ?? Date.now() } };
    case 'AD_HEARTS': return { ...state, hearts: addHeart(state.hearts, action.now ?? Date.now(), heartsFastUntil(state)) };
    case 'START_BONUS': {
      // Entering uses up the day's bonus stage, so leaving and coming back can't repeat it.
      const today = dayKey(action.now ?? Date.now());
      if (!action.testing && state.bonusDay === today) return state;
      const game = withQuickOrders(withMode(createGame(prepareBonusStage(action.dessert)), action.relaxed ?? false, 0), state.quickOrders, state.pass, action.now ?? Date.now());
      const bonusDay = action.testing ? state.bonusDay : today;
      return { ...state, screen: 'game', heartPaidFrom: undefined, bonus: { dessert: action.dessert, nextStageId: action.nextStageId }, bonusDay, game };
    }
    case 'GAME': {
      if (state.screen !== 'game') return state;
      const now = action.now ?? Date.now();
      const restart = action.action.type === 'RESTART';
      const payment = restart ? payForAttempt(state, state.game.stageId, now) : null;
      if (restart && !payment) return state;
      const before = state.game.passQuickOrders && !isPassActive(state.pass, now)
        ? withQuickOrders(state.game, state.quickOrders, undefined, now)
        : state.game;
      let game = reduceGame(before, action.action, getStage(before.stageId));
      if (game === before) return before === state.game ? state : { ...state, game };
      const relaxed = state.game.relaxed ?? false;
      if (restart) game = withQuickOrders(withMode(withoutUnearnableRewards(withoutSpentRewards({ ...game, quickOrderAds: before.quickOrderAds }, state.rewardedStages), earnable(state, now)), relaxed, state.trayClears + passTrayClears(state.pass, now)), state.quickOrders, state.pass, now);
      if (game.stageId === practiceStage.id) return { ...state, game };
      // The held quick order follows the attempt: picked up from a queue, or used on the customers.
      // Pass inventory is tracked separately so only uses from it are charged to the pass.
      const quickOrders = game.quickOrders === undefined ? state.quickOrders : game.quickOrders - (game.passQuickOrders ?? 0);
      const passQuickOrdersUsed = restart ? 0 : Math.max(0, (before.passQuickOrders ?? 0) - (game.passQuickOrders ?? 0));
      let pass = passQuickOrdersUsed && state.pass ? { ...state.pass, quickOrders: Math.max(0, state.pass.quickOrders - passQuickOrdersUsed) } : state.pass;
      const usedClear = action.action.type === 'CLEAR_TRAY' && game.trayClearsLeft < state.game.trayClearsLeft;
      let trayClears = state.trayClears;
      if (usedClear && trayClears > 0) trayClears -= 1;
      else if (usedClear && pass && passTrayClears(pass, now) > 0) pass = { ...pass, trayClears: (pass.trayClears ?? 0) - 1 };
      const earned = restart ? [] : (game.collectedRewards ?? []).slice(state.game.collectedRewards?.length ?? 0);
      let rewardedStages = state.rewardedStages;
      let rewardHearts = state.hearts;
      let dailyRewards = state.dailyRewards;
      if (earned.length) {
        if (!rewardedStages.includes(game.stageId)) rewardedStages = [...rewardedStages, game.stageId];
        const today = { ...rewardsToday(state, now) };
        for (const reward of earned) {
          today[reward] += 1;
          if (reward === 'heart') rewardHearts = addHeart(rewardHearts, now, heartsFastUntil(state));
          // A picked-up tray clear joins the owned pool (the attempt can use it at once too).
          if (reward === 'trayClear') trayClears = Math.min(MAX_TRAY_CLEARS, trayClears + 1);
        }
        dailyRewards = today;
      }
      state = { ...state, hearts: rewardHearts, rewardedStages, quickOrders, pass, dailyRewards };
      const newlyCleared = game.status === 'clear' && state.game.status !== 'clear';
      if (isBonusStage(game.stageId)) {
        // A bonus clear adds a heart (up to five); it leaves stars and tray clears alone.
        return { ...state, game, trayClears, hearts: newlyCleared ? addHeart(state.hearts, now, heartsFastUntil(state)) : state.hearts };
      }
      const paid = payment ?? { hearts: state.hearts, heartPaidFrom: state.heartPaidFrom };
      // A clear gives the attempt's heart back.
      const refund = newlyCleared && paid.heartPaidFrom
        ? { hearts: addHeart(paid.hearts, now, heartsFastUntil(state)), heartPaidFrom: undefined }
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
