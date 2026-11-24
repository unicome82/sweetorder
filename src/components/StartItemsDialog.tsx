import { useLayoutEffect, useRef, useState } from 'react';
import type { ItemChoice } from '../game/session';
import type { DonutType } from '../game/types';
import type { Pass } from '../monetization/pass';
import { useMessages } from '../i18n/language';
import { AddTimeIcon, PeekIcon } from './ItemIcons';

/**
 * Before an attempt: switch on peek and/or +5 seconds for it; items can't be used once play starts. Only the items
 * this stage can use (`available`) are listed. Peek comes from the pass (`pass` with peeks left) or costs an ad
 * (`peekNeedsAd`), shown on Start. `initial` is the previous choice.
 */
export function StartItemsDialog({ pass, available, peekNeedsAd, dessert, initial, onStart, onClose }: {
  pass?: Pass; available: Required<ItemChoice>; peekNeedsAd: boolean; dessert?: DonutType; initial: ItemChoice;
  onStart: (choice: ItemChoice) => void; onClose: () => void;
}) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<ItemChoice>(() => ({ peek: initial.peek && available.peek, addTime: initial.addTime && available.addTime }));
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const toggle = (item: keyof ItemChoice) => setChoice(previous => ({ ...previous, [item]: !previous[item] }));
  const check = <span className="start-item-check" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
  return <dialog className="glass-popup tray-full-dialog start-items-dialog" ref={dialog} aria-labelledby="start-items-heading" aria-describedby="start-items-hint"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="start-items-heading">{t.startItemsTitle}</h2>
    <p id="start-items-hint" className="no-hearts-wait">{t.startItemsHint}</p>
    <div className="start-items">
      {available.peek && <button type="button" className="start-item" aria-pressed={!!choice.peek} onClick={() => toggle('peek')}>
        {check}
        <span className="start-item-icon"><PeekIcon dessert={dessert} />
          {peekNeedsAd
            ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span>
            : <span className="start-item-count" lang="en" aria-hidden="true">{pass!.peeks}</span>}
        </span>
        <span className="start-item-name">{t.passItemPeek}</span>
        <span className="sr-only">{peekNeedsAd ? `AD${t.startItemAd}` : t.passItemsLeft(pass!.peeks)}</span>
      </button>}
      {available.addTime && pass && <button type="button" className="start-item" aria-pressed={!!choice.addTime} onClick={() => toggle('addTime')}>
        {check}
        <span className="start-item-icon"><AddTimeIcon />
          <span className="start-item-count" lang="en" aria-hidden="true">{pass.timeBonuses}</span>
        </span>
        <span className="start-item-name">{t.passItemAddTime}</span>
        <span className="sr-only">{t.passItemsLeft(pass.timeBonuses)}</span>
      </button>}
    </div>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={() => onStart(choice)}>{t.start}</button>
    </div>
  </dialog>;
}
