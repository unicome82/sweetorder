import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FAKE_AD_MS, fakeAdStore, type FakeAd } from '../monetization/ads';
import { useMessages } from '../i18n/language';

/** Shows the stand-in ad the fake ad service asks for, above every other popup. */
export function FakeAdHost() {
  const ad = useSyncExternalStore(fakeAdStore.subscribe, fakeAdStore.current);
  return ad ? <FakeAdDialog key={ad.id} ad={ad} /> : null;
}

function FakeAdDialog({ ad }: { ad: FakeAd }) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [left, setLeft] = useState(FAKE_AD_MS);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const end = performance.now() + FAKE_AD_MS;
    const timer = setInterval(() => {
      const remaining = Math.max(0, end - performance.now());
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  const done = left === 0;
  return <dialog ref={dialog} className="fake-ad" aria-labelledby="fake-ad-heading" data-placement={ad.placement}
    onCancel={event => { event.preventDefault(); ad.finish(false); }}>
    <p className="fake-ad-tag" lang="en">TEST AD</p>
    <h2 id="fake-ad-heading">{t.fakeAdRewarded}</h2>
    <p className="fake-ad-timer" aria-live="polite">{done ? t.fakeAdRewardReady : t.fakeAdSeconds(Math.ceil(left / 1000))}</p>
    <div className="result-actions">
      {done
        ? <button type="button" className="primary-button popup-primary-button" onClick={() => ad.finish(true)}>{t.fakeAdClaim}</button>
        : <button type="button" className="secondary-button" onClick={() => ad.finish(false)}>{t.fakeAdSkip}</button>}
    </div>
  </dialog>;
}
