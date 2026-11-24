import { useLayoutEffect, useRef } from 'react';
import popupCat from '../assets/game/popup-cat.webp';
import { describeHearts, formatWait, type Hearts } from '../game/hearts';
import { useNow } from '../hooks/useNow';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

/** bonusToday: whether the daily bonus stage is still unused today; it is offered only when no bonus heart can refill instead. */
export function NoHeartsDialog({ hearts, bonusToday, onClose, onCharge, onBonus }: { hearts: Hearts; bonusToday: boolean; onClose: () => void; onCharge: () => void; onBonus: () => void }) {
  const t = useMessages();
  const now = useNow();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const { nextInMs, available, chargeable } = describeHearts(hearts, now);
  // Close on its own once a heart has refilled.
  useLayoutEffect(() => { if (available > 0) onClose(); }, [available, onClose]);
  return <dialog className="glass-popup tray-full-dialog no-hearts-dialog" ref={dialog} aria-labelledby="no-hearts-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <img className="popup-cat" src={popupCat} alt="" draggable={false} />
    <h2 id="no-hearts-heading"><HeartIcon className="heart-icon--empty" /><span>{t.noHearts}</span></h2>
    {nextInMs !== null && <p className="no-hearts-wait">{t.nextHeart(formatWait(nextInMs))}</p>}
    {chargeable > 0 && <p className="no-hearts-wait">{t.bonusHeartsLeft(hearts.bonus)}</p>}
    {chargeable === 0 && !bonusToday && <p className="no-hearts-wait">{t.bonusTomorrow}</p>}
    <div className={`result-actions${chargeable > 0 || bonusToday ? ' charge-hearts-actions' : ''}`}>
      {chargeable > 0 && <button type="button" className="secondary-button" onClick={onCharge}>{t.chargeButton}</button>}
      {chargeable === 0 && bonusToday && <button type="button" className="secondary-button" onClick={onBonus}>{t.bonusStageButton}</button>}
      <button type="button" className="primary-button popup-primary-button" onClick={onClose}>{t.ok}</button>
    </div>
  </dialog>;
}
