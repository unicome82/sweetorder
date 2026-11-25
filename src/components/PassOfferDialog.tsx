import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LanguageContext, useMessages } from '../i18n/language';
import { PASS_FAST_REFILLS, PASS_TRAY_CLEARS, PASS_PEEKS, PASS_QUICK_ORDERS, PASS_SPARE_HEARTS, PASS_TIME_BONUSES } from '../monetization/pass';
import { PASS_PRICE } from '../monetization/billing';
import halfTime from '../assets/game/half-time.webp';
import { HeartIcon } from './HeartIcon';
import { AddTimeIcon, PeekIcon, QuickOrderIcon, TrayClearIcon } from './ItemIcons';
import { PassCrown } from './PassButton';

/**
 * The pass and what it gives, offered where the player gets stuck without it (tray clear for an ad, out of hearts,
 * a failed stage) and from the stage list. Ads stay available there, so this is never the only way on.
 */
export function PassOfferDialog({ onBuy, onClose }: { onBuy: () => void; onClose: () => void }) {
  const t = useMessages();
  const language = useContext(LanguageContext);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  // Each benefit has a quantity badge on its card.
  const benefits: { key: string; icon: ReactNode; count: string; text: string }[] = [
    { key: 'hearts', icon: <HeartIcon />, count: `+${PASS_SPARE_HEARTS}`, text: t.passOfferSpareHearts },
    { key: 'fast', icon: <img src={halfTime} alt="" />, count: `+${PASS_FAST_REFILLS}`, text: t.passOfferFastHearts },
    { key: 'clears', icon: <TrayClearIcon />, count: `+${PASS_TRAY_CLEARS}`, text: t.passOfferTrayClears },
    { key: 'quick', icon: <QuickOrderIcon />, count: `+${PASS_QUICK_ORDERS}`, text: t.passOfferQuickOrders },
    { key: 'time', icon: <AddTimeIcon />, count: `+${PASS_TIME_BONUSES}`, text: t.passOfferTimeBonuses },
    { key: 'peek', icon: <PeekIcon />, count: `+${PASS_PEEKS}`, text: t.passOfferPeeks },
  ];
  return <dialog className="glass-popup tray-full-dialog pass-offer-dialog" ref={dialog} aria-labelledby="pass-offer-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <span className="pass-offer-crown" aria-hidden="true">
      <PassCrown />
    </span>
    <h2 id="pass-offer-heading">{t.passOfferTitle}</h2>
    <p className="pass-offer-lead">{t.passOfferLead}</p>
    <ul className="pass-offer-benefits">
      {benefits.map(({ key, icon, count, text }) => <li key={key} className={`pass-benefit pass-benefit--${key}`}>
        <span className="pass-benefit-icon" aria-hidden="true">{icon}</span>
        <span className="pass-benefit-text">{text}</span>
        <span className="pass-benefit-count">{count}</span>
      </li>)}
    </ul>
    <p className="pass-offer-price"><strong>{PASS_PRICE[language]}</strong></p>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.passOfferLater}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={onBuy}>{t.passOfferBuy}</button>
    </div>
  </dialog>;
}
