import { useLayoutEffect, useRef } from 'react';
import popupCat from '../assets/game/popup-cat.webp';
import { describeHearts, formatWait, type Hearts } from '../game/hearts';
import { useNow } from '../hooks/useNow';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

/**
 * Out of hearts once spare hearts and today's bonus stage are used up: a rewarded ad gives a heart. Without a pass,
 * a link offers it (`onShowPass`).
 */
export function NoHeartsDialog({ hearts, fastUntil, onClose, onWatchAd, onShowPass }: {
  hearts: Hearts; fastUntil?: number; onClose: () => void; onWatchAd: () => void; onShowPass?: () => void;
}) {
  const t = useMessages();
  const now = useNow();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const { nextInMs, count } = describeHearts(hearts, now, fastUntil);
  // Close on its own once a heart has refilled.
  useLayoutEffect(() => { if (count > 0) onClose(); }, [count, onClose]);
  return <dialog className="glass-popup tray-full-dialog no-hearts-dialog" ref={dialog} aria-labelledby="no-hearts-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <img className="popup-cat" src={popupCat} alt="" draggable={false} />
    <h2 id="no-hearts-heading"><HeartIcon className="heart-icon--empty" /><span>{t.noHearts}</span></h2>
    {nextInMs !== null && <p className="no-hearts-wait">{t.nextHeart(formatWait(nextInMs))}</p>}
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button no-hearts-ad-button" onClick={onWatchAd}>
        <span className="ad-badge" lang="en">AD</span>{t.adHeartButton}
      </button>
      <button type="button" className="primary-button popup-primary-button" onClick={onClose}>{t.ok}</button>
    </div>
    {onShowPass && <button type="button" className="pass-link-button" onClick={onShowPass}>{t.passHearts}</button>}
  </dialog>;
}
