import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LanguageContext, useMessages } from '../i18n/language';
import { PASS_DAYS, PASS_PEEKS, PASS_QUICK_ORDERS, PASS_SPARE_HEARTS, PASS_TIME_BONUSES } from '../monetization/pass';
import { PASS_PRICE } from '../monetization/billing';
import { HeartIcon } from './HeartIcon';
import { Icon } from './Icon';
import { AddTimeIcon, PeekIcon, QuickOrderIcon } from './ItemIcons';

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
  const benefits: { key: string; icon: ReactNode; text: string }[] = [
    { key: 'hearts', icon: <HeartIcon />, text: t.passOfferSpareHearts(PASS_SPARE_HEARTS) },
    { key: 'fast', icon: <><HeartIcon /><span className="pass-benefit-tag" lang="en">x2</span></>, text: t.passOfferFastHearts },
    { key: 'clears', icon: <Icon name="basket" />, text: t.passOfferFreeClears },
    { key: 'quick', icon: <QuickOrderIcon />, text: t.passOfferQuickOrders(PASS_QUICK_ORDERS) },
    { key: 'time', icon: <AddTimeIcon />, text: t.passOfferTimeBonuses(PASS_TIME_BONUSES) },
    { key: 'peek', icon: <PeekIcon />, text: t.passOfferPeeks(PASS_PEEKS) },
  ];
  return <dialog className="glass-popup tray-full-dialog pass-offer-dialog" ref={dialog} aria-labelledby="pass-offer-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <span className="pass-offer-crown" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5L3 8.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><rect x="5" y="19.2" width="14" height="2.2" rx="1.1" fill="currentColor" /></svg>
    </span>
    <h2 id="pass-offer-heading">{t.passOfferTitle}</h2>
    <p className="pass-offer-lead">{t.passOfferLead(PASS_DAYS)}</p>
    <ul className="pass-offer-benefits">
      {benefits.map(({ key, icon, text }) => <li key={key} className={`pass-benefit pass-benefit--${key}`}>
        <span className="pass-benefit-icon" aria-hidden="true">{icon}</span>
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
