// When the forced (interstitial) ad shows: only once a campaign attempt has ended (cleared or lost), never during play.
// Stages up to AD_FREE_THROUGH_STAGE are ad-free; after that every INTERSTITIAL_EVERY-th finished attempt shows one.

export const AD_FREE_THROUGH_STAGE = 10;
export const INTERSTITIAL_EVERY = 3;

/** Whether a finished attempt on this stage counts toward the next interstitial (practice and bonus stages don't). */
export function countsForInterstitial(stageId: number, isCampaignStage: boolean): boolean {
  return isCampaignStage && stageId > AD_FREE_THROUGH_STAGE;
}

/** Counts one finished attempt; `show` is true when this one is due an ad, and the count then starts again. */
export function countFinishedAttempt(gamesSinceAd: number): { show: boolean; gamesSinceAd: number } {
  const count = gamesSinceAd + 1;
  return count >= INTERSTITIAL_EVERY ? { show: true, gamesSinceAd: 0 } : { show: false, gamesSinceAd: count };
}
