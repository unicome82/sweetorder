import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LanguageContext, useMessages } from '../i18n/language';
import { PASS_DAYS, PASS_PEEKS, PASS_QUICK_ORDERS, PASS_SPARE_HEARTS, PASS_TIME_BONUSES } from '../monetization/pass';
import { PASS_PRICE } from '../monetization/billing';
import halfTime from '../assets/game/half-time.webp';
import { HeartIcon } from './HeartIcon';
import { AddTimeIcon, PeekIcon, QuickOrderIcon, TrayClearIcon } from './ItemIcons';
import { PassCrown } from './PassButton';

/**
 * The pass and what it gives, offered where the player gets stuck without it (tray clear for an ad, out of hearts,
 * the locked +5 seconds, a failed stage) and from the stage list. Ads stay available there, so this is never the only way on.
 */
export function PassOfferDialog({ onBuy, onClose }: { onBuy: () => void; onClose: () => void }) {
  const t = useMessages();
  const language = useContext(LanguageContext);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  // Inventory counts sit at the upper-right corner of the icon.
  const benefits: { key: string; icon: ReactNode; count?: string; text: string }[] = [
    { key: 'hearts', icon: <HeartIcon />, count: `+${PASS_SPARE_HEARTS}`, text: t.passOfferSpareHearts(PASS_SPARE_HEARTS) },
    { key: 'fast', icon: <img src={halfTime} alt="" />, text: t.passOfferFastHearts },
    { key: 'clears', icon: <TrayClearIcon />, text: t.passOfferFreeClears },
    { key: 'quick', icon: <QuickOrderIcon />, count: `+${PASS_QUICK_ORDERS}`, text: t.passOfferQuickOrders(PASS_QUICK_ORDERS) },
    { key: 'time', icon: <AddTimeIcon />, count: `+${PASS_TIME_BONUSES}`, text: t.passOfferTimeBonuses(PASS_TIME_BONUSES) },
    { key: 'peek', icon: <PeekIcon />, count: `+${PASS_PEEKS}`, text: t.passOfferPeeks(PASS_PEEKS) },
  ];
  return <dialog className="glass-popup tray-full-dialog pass-offer-dialog" ref={dialog} aria-labelledby="pass-offer-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <span className="pass-offer-crown" aria-hidden="true">
      <PassCrown />
    </span>
    <h2 id="pass-offer-heading">{t.passOfferTitle}</h2>
    <p className="pass-offer-lead">{t.passOfferLead(PASS_DAYS)}</p>
    <ul className="pass-offer-benefits">
      {benefits.map(({ key, icon, count, text }) => <li key={key} className={`pass-benefit pass-benefit--${key}`}>
        <span className="pass-benefit-icon" aria-hidden="true">{icon}{count && <span className="pass-benefit-count" lang="en">{count}</span>}</span>
        <span className="pass-benefit-text">{text}</span>
      </li>)}
    </ul>
    <p className="pass-offer-price"><strong>{PASS_PRICE[language]}</strong> <span>/ {t.passOfferDays(PASS_DAYS)}</span></p>
    <p className="pass-offer-note">{t.passOfferNote}</p>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.passOfferLater}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={onBuy}>{t.passOfferBuy}</button>
    </div>
  </dialog>;
}
