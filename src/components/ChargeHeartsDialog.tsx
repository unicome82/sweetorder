import { useLayoutEffect, useRef, useState } from 'react';
import { chargeAmount, type Hearts } from '../game/hearts';
import { useMessages } from '../i18n/language';
import { useNow } from '../hooks/useNow';
import { HeartIcon } from './HeartIcon';

/** Picks how many bonus hearts (1 up to what fits under five) move into the regular hearts. */
export function ChargeHeartsDialog({ hearts, fastUntil, onCharge, onClose }: { hearts: Hearts; fastUntil?: number; onCharge: (amount: number) => void; onClose: () => void }) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const max = chargeAmount(hearts, useNow(), fastUntil);
  const [picked, setPicked] = useState(max);
  const amount = Math.min(Math.max(1, picked), Math.max(1, max));
  return <dialog className="glass-popup tray-full-dialog no-hearts-dialog" ref={dialog} aria-labelledby="charge-hearts-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="charge-hearts-heading"><HeartIcon /><span>{t.chargeHearts}</span></h2>
    <div className="charge-stepper">
      <button type="button" className="icon-button charge-stepper-button" onClick={() => setPicked(amount - 1)} disabled={amount <= 1} aria-label={t.chargeLess}>
        <span aria-hidden="true">−</span>
      </button>
      <output className="charge-stepper-value" aria-live="polite" lang="en">{amount}</output>
      <button type="button" className="icon-button charge-stepper-button" onClick={() => setPicked(amount + 1)} disabled={amount >= max} aria-label={t.chargeMore}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={() => onCharge(amount)} disabled={max < 1}>{t.charge}</button>
    </div>
  </dialog>;
}
