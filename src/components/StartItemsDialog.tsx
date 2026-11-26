import { useLayoutEffect, useRef, useState } from 'react';
import type { ItemChoice } from '../game/session';
import type { DonutType } from '../game/types';
import type { Pass } from '../monetization/pass';
import { ads } from '../monetization/ads';
import { useMessages } from '../i18n/language';
import { AddTimeIcon, PeekIcon } from './ItemIcons';
import { StageDifficultyRibbon } from './StageDifficultyRibbon';
import { isBonusStage, stageDifficulty } from '../game/stages';

/** Choose pre-start items funded by pass inventory or a rewarded ad. */
export function StartItemsDialog({ stageId, pass, available, peekNeedsAd, addTimeNeedsAd, dessert, initial, onStart, onClose }: {
  stageId: number; pass?: Pass; available: Required<ItemChoice>; peekNeedsAd: boolean; addTimeNeedsAd: boolean; dessert?: DonutType; initial: ItemChoice;
  onStart: (choice: ItemChoice, watched: ItemChoice) => void; onClose: () => void;
}) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<ItemChoice>(() => ({ peek: initial.peek && available.peek && !peekNeedsAd, addTime: initial.addTime && available.addTime && !addTimeNeedsAd }));
  const [watched, setWatched] = useState<ItemChoice>({});
  const [watching, setWatching] = useState(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  async function toggle(item: keyof ItemChoice, needsAd: boolean) {
    if (watching || watched[item]) return;
    if (!needsAd) {
      setChoice(previous => ({ ...previous, [item]: !previous[item] }));
      return;
    }
    setWatching(true);
    try {
      if (!await ads.showRewarded(item)) return;
      setWatched(previous => ({ ...previous, [item]: true }));
      setChoice(previous => ({ ...previous, [item]: true }));
    } finally {
      setWatching(false);
    }
  }
  // The card's top right shows what's left (or AD); once chosen it turns into a green check.
  const badge = (chosen: boolean | undefined, left: number | 'AD') => chosen
    ? <span className="start-item-count start-item-count--chosen" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
    : left === 'AD'
      ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span>
      : <span className="start-item-count" aria-hidden="true">{left}</span>;
  return <dialog className="glass-popup tray-full-dialog start-items-dialog" ref={dialog} aria-labelledby="start-items-heading"
    onCancel={event => { event.preventDefault(); if (!watching) onClose(); }}>
    {/* Names the stage about to start, since the popup hides the screen it was picked on. */}
    <p className="start-items-stage" lang="en">
      <span className="start-items-stage-title">{isBonusStage(stageId) ? 'Bonus Stage' : `Stage ${String(stageId).padStart(2, '0')}`}</span>
      {!isBonusStage(stageId) && <StageDifficultyRibbon difficulty={stageDifficulty(stageId)} />}
    </p>
    <h2 id="start-items-heading">{t.startItemsTitle}</h2>
    <div className="start-items">
      {available.peek && <button type="button" className="start-item" aria-pressed={!!choice.peek} aria-disabled={watching || !!watched.peek} onClick={() => void toggle('peek', peekNeedsAd)}>
        {badge(choice.peek, peekNeedsAd ? 'AD' : pass!.peeks)}
        <span className="start-item-icon"><PeekIcon dessert={dessert} /></span>
        <span className="start-item-name">{t.passItemPeek}</span>
        <span className="sr-only">{peekNeedsAd ? `AD${t.startItemAd}` : t.passItemsLeft(pass!.peeks)}</span>
      </button>}
      {available.addTime && <button type="button" className="start-item" aria-pressed={!!choice.addTime} aria-disabled={watching || !!watched.addTime} onClick={() => void toggle('addTime', addTimeNeedsAd)}>
        {badge(choice.addTime, addTimeNeedsAd ? 'AD' : pass!.timeBonuses)}
        <span className="start-item-icon"><AddTimeIcon /></span>
        <span className="start-item-name">{t.passItemAddTime}</span>
        <span className="sr-only">{addTimeNeedsAd ? `AD${t.startItemAd}` : t.passItemsLeft(pass!.timeBonuses)}</span>
      </button>}
    </div>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" disabled={watching} onClick={onClose}>{t.cancel}</button>
      <button type="button" className="primary-button popup-primary-button" disabled={watching} onClick={() => onStart(choice, watched)}>{t.start}</button>
    </div>
  </dialog>;
}
