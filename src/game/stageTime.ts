import { BONUS_STAGE_ID } from './constants';
import type { GameState, StageDefinition } from './types';

// Seconds granted per dessert in the queues; harder stages need more thinking per tap.
const secondsPerDessert = { easy: 1.0, normal: 1.1, hard: 1.2 } as const;
const baseSeconds = 10;

export function getStageTimeLimit(stage: StageDefinition): number {
  if (stage.id === 0) return 10_000;
  // Bonus stages can't be lost, so they get plenty of time.
  if (stage.id === BONUS_STAGE_ID) return 300_000;
  const desserts = stage.queues.reduce((sum, queue) => sum + queue.filter(token => !token.reward).length, 0);
  const seconds = baseSeconds + desserts * secondsPerDessert[stage.difficulty ?? 'easy'];
  return Math.ceil(seconds / 5) * 5_000;
}

/** The clock this attempt runs on; relaxed attempts have none. */
export function getGameTimeLimit(state: Pick<GameState, 'relaxed'>, stage: StageDefinition): number {
  return state.relaxed ? 0 : getStageTimeLimit(stage);
}

/** Whether running out of time loses this stage; practice and bonus stages play on past 0:00. */
export function losesOnTimeUp(stageId: number): boolean {
  return stageId !== 0 && stageId !== BONUS_STAGE_ID;
}

// A clear that lands at 0:00 (the last desserts still settling when time ran out) earns one star.
export function getTimeStars(remainingMs: number, limitMs: number): number {
  if (remainingMs <= 0) return 1;
  if (remainingMs * 2 >= limitMs) return 3;
  return remainingMs * 4 >= limitMs ? 2 : 1;
}
