import { describe, expect, it } from 'vitest';
import { AD_FREE_THROUGH_STAGE, countFinishedAttempt, countsForInterstitial } from './interstitial';

describe('interstitial timing', () => {
  it('skips stages up to the ad-free limit, practice and bonus stages', () => {
    expect(countsForInterstitial(AD_FREE_THROUGH_STAGE, true)).toBe(false);
    expect(countsForInterstitial(AD_FREE_THROUGH_STAGE + 1, true)).toBe(true);
    expect(countsForInterstitial(100_000, false)).toBe(false);
  });

  it('shows one ad every third finished attempt', () => {
    let gamesSinceAd = 0;
    const shown: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      const result = countFinishedAttempt(gamesSinceAd);
      shown.push(result.show);
      gamesSinceAd = result.gamesSinceAd;
    }
    expect(shown).toEqual([false, false, true, false, false, true]);
  });
});
