// The game asks for ads only through `ads`. For now it is a fake that shows a stand-in ad on screen
// (see FakeAdHost); the AdMob version will replace it without the callers changing.

/** Ads the player chooses to watch for a reward. */
export type RewardedPlacement = 'trayClear' | 'peek' | 'addTime' | 'hearts';
/** Forced ads between stages. */
export type InterstitialPlacement = 'stageEnd';

export interface AdService {
  /** Resolves true only when the ad was watched to the end, so the reward may be given. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  /** Resolves once the ad has been closed. */
  showInterstitial(placement: InterstitialPlacement): Promise<void>;
}

export type FakeAd =
  | { id: number; kind: 'rewarded'; placement: RewardedPlacement; finish: (watched: boolean) => void }
  | { id: number; kind: 'interstitial'; placement: InterstitialPlacement; finish: (watched: boolean) => void };

/** How long the stand-in ad runs before it can be closed with the reward. */
export const FAKE_AD_MS = 3_000;

let current: FakeAd | null = null;
let nextId = 0;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

export const fakeAdStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  current: () => current,
};

function show(ad: Omit<FakeAd, 'id' | 'finish'>): Promise<boolean> {
  // One ad at a time: a second request while one is showing is turned down.
  if (current) return Promise.resolve(false);
  return new Promise(resolve => {
    const id = nextId += 1;
    current = { ...ad, id, finish: watched => {
      if (current?.id !== id) return;
      current = null;
      notify();
      resolve(watched);
    } } as FakeAd;
    notify();
  });
}

export const fakeAds: AdService = {
  showRewarded: placement => show({ kind: 'rewarded', placement }),
  showInterstitial: placement => show({ kind: 'interstitial', placement }).then(() => undefined),
};

export const ads: AdService = fakeAds;
