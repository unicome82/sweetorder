import { useLayoutEffect, useRef, useState } from 'react';
import type { PassItemChoice } from '../game/session';
import type { Pass } from '../monetization/pass';
import { useMessages } from '../i18n/language';
import { AddTimeIcon, PeekIcon } from './ItemIcons';

/**
 * Before a pass holder's attempt: switch on peek and/or +5 seconds for it. Only the items this stage can use
 * (`available`) are listed; `initial` is the previous choice.
 */
export function PassItemsDialog({ pass, available, initial, onStart, onClose }: {
  pass: Pass; available: Required<PassItemChoice>; initial: PassItemChoice;
  onStart: (choice: PassItemChoice) => void; onClose: () => void;
}) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<PassItemChoice>(() => ({ peek: initial.peek && available.peek, addTime: initial.addTime && available.addTime }));
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const toggle = (item: keyof PassItemChoice) => setChoice(previous => ({ ...previous, [item]: !previous[item] }));
  return <dialog className="glass-popup tray-full-dialog pass-items-dialog" ref={dialog} aria-labelledby="pass-items-heading" aria-describedby="pass-items-hint"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="pass-items-heading">{t.passItemsTitle}</h2>
    <p id="pass-items-hint" className="no-hearts-wait">{t.passItemsHint}</p>
    <div className="pass-items">
      {available.peek && <button type="button" className="pass-item" aria-pressed={!!choice.peek} onClick={() => toggle('peek')}>
        <span className="pass-item-icon"><PeekIcon /></span>
        <span className="pass-item-name">{t.passItemPeek}</span>
        <span className="pass-item-left">{t.passItemsLeft(pass.peeks)}</span>
      </button>}
      {available.addTime && <button type="button" className="pass-item" aria-pressed={!!choice.addTime} onClick={() => toggle('addTime')}>
        <span className="pass-item-icon"><AddTimeIcon /></span>
        <span className="pass-item-name">{t.passItemAddTime}</span>
        <span className="pass-item-left">{t.passItemsLeft(pass.timeBonuses)}</span>
      </button>}
    </div>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={() => onStart(choice)}>{t.start}</button>
    </div>
  </dialog>;
}
