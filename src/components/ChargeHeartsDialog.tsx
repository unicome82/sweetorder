import { useLayoutEffect, useRef, useState } from 'react';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

/** Out of hearts with pass spare hearts left: picks how many (1 up to what fits under five) move into the regular hearts. */
export function ChargeHeartsDialog({ max, spare, onCharge, onClose }: { max: number; spare: number; onCharge: (amount: number) => void; onClose: () => void }) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const [picked, setPicked] = useState(max);
  const amount = Math.min(Math.max(1, picked), Math.max(1, max));
  return <dialog className="glass-popup tray-full-dialog no-hearts-dialog" ref={dialog} aria-labelledby="charge-hearts-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="charge-hearts-heading"><HeartIcon /><span>{t.chargeHearts}</span></h2>
    <p className="no-hearts-wait">{t.chargeHeartsHint(spare)}</p>
    <div className="charge-stepper">
      <button type="button" data-repeat-tap className="icon-button charge-stepper-button" onClick={() => setPicked(previous => Math.min(Math.max(1, previous), Math.max(1, max)) - 1)} disabled={amount <= 1} aria-label={t.chargeLess}>
        <span aria-hidden="true">−</span>
      </button>
      <output className="charge-stepper-value" aria-live="polite" lang="en">{amount}</output>
      <button type="button" data-repeat-tap className="icon-button charge-stepper-button" onClick={() => setPicked(previous => Math.min(Math.max(1, previous), Math.max(1, max)) + 1)} disabled={amount >= max} aria-label={t.chargeMore}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={() => onCharge(amount)} disabled={max < 1}>{t.charge}</button>
    </div>
  </dialog>;
}
