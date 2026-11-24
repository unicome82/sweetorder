import type { StageDifficulty } from '../types';

// Stages 1–8 alternate easy and normal so the first hard stage arrives at stage 11.
const opening: StageDifficulty[] = ['easy', 'easy', 'normal', 'easy', 'normal', 'easy', 'normal', 'easy'];
// From stage 9 the same eight-stage cadence repeats, with hard stages mixed in.
const cadence: StageDifficulty[] = ['normal', 'easy', 'hard', 'normal', 'easy', 'normal', 'hard', 'easy'];
const campaignEnd = 101;

export function difficultyForStage(id: number): StageDifficulty {
  return id <= opening.length ? opening[id - 1]! : cadence[(id - opening.length - 1) % cadence.length]!;
}

// The campaign has a fixed number of stages, stored in chunks of 100 (chunk 1 = stages 1–100).
export const STAGE_COUNT = 10_000;
export const CHUNK_SIZE = 100;
export const isStageId = (id: number) => Number.isInteger(id) && id >= 1 && id <= STAGE_COUNT;
export const chunkOf = (id: number) => Math.ceil(id / CHUNK_SIZE);

// Generator targets tighten along this 0–1 value: a ramp over the first 101 stages, then each
// later 100-stage chapter climbs again from 0.75 to 1 so long play keeps a rise-and-rest rhythm.
const chapterFloor = 0.75;
export function campaignProgress(id: number): number {
  if (id <= campaignEnd) return Math.min(1, Math.max(0, (id - 1) / (campaignEnd - 1)));
  const position = ((id - 1) % CHUNK_SIZE) / (CHUNK_SIZE - 1);
  return chapterFloor + (1 - chapterFloor) * position;
}

// Covered ("?") desserts appear only in hard stages after stage 50: four at first,
// then one more for each later hard stage (hard stages come every four stages).
export const hiddenDessertsAfterStage = 50;
export const firstHiddenCount = 4;
export const maxHiddenCount = 30;
export function hiddenDessertCount(id: number, difficulty: StageDifficulty): number {
  if (difficulty !== 'hard' || id <= hiddenDessertsAfterStage) return 0;
  return Math.min(maxHiddenCount, firstHiddenCount + Math.floor((id - hiddenDessertsAfterStage - 1) / 4));
}
export function hasHiddenDesserts(id: number, difficulty: StageDifficulty): boolean {
  return hiddenDessertCount(id, difficulty) > 0;
}
