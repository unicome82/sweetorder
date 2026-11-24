import { useLayoutEffect, useRef } from 'react';
import { useMessages } from '../i18n/language';
import { PASS_DAYS, PASS_PEEKS, PASS_QUICK_ORDERS, PASS_SPARE_HEARTS, PASS_TIME_BONUSES } from '../monetization/pass';

/**
 * The pass and what it gives, offered where the player gets stuck without it (tray clear for an ad, out of hearts,
 * the locked +5 seconds). Ads stay available there, so this is never the only way on.
 */
export function PassOfferDialog({ onBuy, onClose }: { onBuy: () => void; onClose: () => void }) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const benefits = [
    t.passOfferSpareHearts(PASS_SPARE_HEARTS), t.passOfferFastHearts, t.passOfferFreeClears,
    t.passOfferQuickOrders(PASS_QUICK_ORDERS), t.passOfferTimeBonuses(PASS_TIME_BONUSES), t.passOfferPeeks(PASS_PEEKS),
  ];
  return <dialog className="glass-popup tray-full-dialog pass-offer-dialog" ref={dialog} aria-labelledby="pass-offer-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="pass-offer-heading">{t.passOfferTitle}</h2>
    <p className="pass-offer-lead">{t.passOfferLead(PASS_DAYS)}</p>
    <ul className="pass-offer-benefits">
      {benefits.map(benefit => <li key={benefit}>{benefit}</li>)}
    </ul>
    <div className="result-actions charge-hearts-actions">
      <button type="button" className="secondary-button" onClick={onClose}>{t.passOfferLater}</button>
      <button type="button" className="primary-button popup-primary-button" onClick={onBuy}>{t.passOfferBuy}</button>
    </div>
  </dialog>;
}
