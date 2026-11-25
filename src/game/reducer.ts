import { createGame, clearTray, selectDonut, matchTray, pickupTray, quickOrder } from './engine';
import { getGameTimeLimit, getTimeStars } from './stageTime';
import type { GameState, StageDefinition } from './types';

export type GameAction = (
  | { type: 'SELECT_DONUT'; queueIndex: number; expectedDonutId: string }
  | { type: 'QUEUE_DONUT'; queueIndex: number; expectedDonutId: string }
  | { type: 'MATCH_TRAY'; donutId: string }
  | { type: 'TRAY_READY'; donutId: string }
  | { type: 'PICKUP_TRAY'; readyOrders: readonly string[]; parallel?: boolean }
  | { type: 'CLEAR_TRAY' }
  | { type: 'QUICK_ORDER'; adWatched?: boolean }
  | { type: 'GIVE_UP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART' }
) & { remainingTimeMs?: number };

/** Whether any dessert behind a queue's front still shows as "?". */
export function hasHiddenDesserts(state: Pick<GameState, 'queues' | 'peeked'>): boolean {
  return !state.peeked && state.queues.some(queue => queue.some((token, position) => position > 0 && token.hidden && !token.reward));
}

export function reduceGame(state: GameState, action: GameAction, stage: StageDefinition): GameState {
  const { remainingTimeMs } = action;
  const timeLimit = getGameTimeLimit(state, stage);
  const next = applyGameAction(state, action, stage);
  return next !== state && next.status === 'clear' && timeLimit > 0 && remainingTimeMs !== undefined
    ? { ...next, clearStars: getTimeStars(remainingTimeMs, timeLimit) }
    : next;
}

function applyGameAction(state: GameState, action: GameAction, stage: StageDefinition): GameState {
  switch (action.type) {
    case 'SELECT_DONUT': return selectDonut(state, stage, action.queueIndex, action.expectedDonutId).state;
    case 'QUEUE_DONUT': return selectDonut(state, stage, action.queueIndex, action.expectedDonutId, true).state;
    case 'MATCH_TRAY': return matchTray(state, stage, action.donutId).state;
    case 'TRAY_READY': return matchTray(state, stage, action.donutId, true).state;
    case 'PICKUP_TRAY': return pickupTray(state, stage, action.readyOrders, action.parallel).state;
    case 'CLEAR_TRAY': return clearTray(state, stage).state;
    case 'QUICK_ORDER': return quickOrder(state, stage, action.adWatched).state;
    case 'GIVE_UP': return state.status === 'blocked' ? { ...state, status: 'gameover', transitionId: state.transitionId + 1 } : state;
    case 'PAUSE': return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'RESUME': return state.status === 'paused' ? { ...state, status: 'playing' } : state;
    case 'RESTART': return { ...createGame(stage), transitionId: state.transitionId + 1 };
  }
}
