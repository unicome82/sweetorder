// Set to true to open every stage for playtesting.
export const UNLOCK_ALL_STAGES_FOR_TESTING = false;

// Set to false to restore normal heart costs and counter display after playtesting.
export const UNLIMITED_HEARTS_FOR_TESTING = false;

export const QUEUE_COUNT = 8;
export const ORDER_SLOTS = 4;
export const BASE_TRAY_CAPACITY = 12;
export const MAX_ORDER_QUANTITY = 16;

// Set to false before release: shows stand-in ads and a pass switch in Settings instead of AdMob and the stores.
export const FAKE_MONETIZATION_FOR_TESTING = true;

// Set to true so the Stage 00 tile opens a bonus stage instead of practice, for playtesting.
export const BONUS_AT_STAGE_00_FOR_TESTING = true;
// Bonus stages live outside the campaign's 1–10,000 ids.
export const BONUS_STAGE_ID = 100_000;

// Set to true to open the stages below at once for playtesting, with their new features up front:
// the first customer is a VIP, and in stage 25 a heart and a tray clear sit second in two queues.
// Their rewards can be collected on every attempt.
export const FEATURE_PREVIEW_FOR_TESTING = false;
export const FEATURE_PREVIEW_STAGES: readonly number[] = [25];
export const isFeaturePreviewStage = (id: number) => FEATURE_PREVIEW_FOR_TESTING && FEATURE_PREVIEW_STAGES.includes(id);
