import { useLayoutEffect, useRef } from 'react';
import popupCat from '../assets/game/popup-cat.webp';
import { describeHearts, formatWait, type Hearts } from '../game/hearts';
import { useNow } from '../hooks/useNow';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

/**
 * Offers one way back in, in this order: move bonus hearts over, the daily bonus stage, or (once today's bonus
 * stage is used) a rewarded ad for a heart. bonusToday: whether the daily bonus stage is still unused today.
 */
export function NoHeartsDialog({ hearts, fastUntil, bonusToday, onClose, onCharge, onBonus, onWatchAd }: {
  hearts: Hearts; fastUntil?: number; bonusToday: boolean; onClose: () => void; onCharge: () => void; onBonus: () => void; onWatchAd: () => void;
}) {
  const t = useMessages();
  const now = useNow();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const { nextInMs, available, chargeable } = describeHearts(hearts, now, fastUntil);
  // Close on its own once a heart has refilled.
  useLayoutEffect(() => { if (available > 0) onClose(); }, [available, onClose]);
  return <dialog className="glass-popup tray-full-dialog no-hearts-dialog" ref={dialog} aria-labelledby="no-hearts-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <img className="popup-cat" src={popupCat} alt="" draggable={false} />
    <h2 id="no-hearts-heading"><HeartIcon className="heart-icon--empty" /><span>{t.noHearts}</span></h2>
    {nextInMs !== null && <p className="no-hearts-wait">{t.nextHeart(formatWait(nextInMs))}</p>}
    {chargeable > 0 && <p className="no-hearts-wait">{t.bonusHeartsLeft(hearts.bonus)}</p>}
    {chargeable === 0 && !bonusToday && <p className="no-hearts-wait">{t.bonusTomorrow}</p>}
    <div className="result-actions charge-hearts-actions">
      {chargeable > 0 && <button type="button" className="secondary-button" onClick={onCharge}>{t.chargeButton}</button>}
      {chargeable === 0 && bonusToday && <button type="button" className="secondary-button" onClick={onBonus}>{t.bonusStageButton}</button>}
      {chargeable === 0 && !bonusToday && <button type="button" className="secondary-button no-hearts-ad-button" onClick={onWatchAd}>
        <span className="start-item-ad" lang="en">AD</span>{t.adHeartButton}
      </button>}
      <button type="button" className="primary-button popup-primary-button" onClick={onClose}>{t.ok}</button>
    </div>
  </dialog>;
}
