import { describe, expect, it } from 'vitest';
import { fakeAds, fakeAdStore } from './ads';

describe('가짜 광고', () => {
  it('끝까지 보면 보상, 중간에 닫으면 보상 없음, 한 번에 하나만 띄운다', async () => {
    const watched = fakeAds.showRewarded('trayClear');
    expect(fakeAdStore.current()).toMatchObject({ kind: 'rewarded', placement: 'trayClear' });
    expect(await fakeAds.showRewarded('peek')).toBe(false);
    fakeAdStore.current()!.finish(true);
    expect(await watched).toBe(true);
    expect(fakeAdStore.current()).toBeNull();

    const skipped = fakeAds.showRewarded('hearts');
    fakeAdStore.current()!.finish(false);
    expect(await skipped).toBe(false);
  });
});
