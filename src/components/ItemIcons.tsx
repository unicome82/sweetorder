import addTime from '../assets/game/add-time.webp';
import mystery from '../assets/game/mystery.webp';
import quickOrder from '../assets/game/quick-order.webp';
import trayClear from '../assets/game/tray-clear.webp';
import type { DonutType } from '../game/types';
import { Donut } from './Donut/Donut';

export function MysteryIcon({ className = '' }: { className?: string }) {
  return <img className={`mystery-icon ${className}`} src={mystery} alt="" />;
}

export function PeekIcon({ dessert = 'strawberryDonut' }: { dessert?: DonutType }) {
  return <span className="peek-icon" aria-hidden="true">
    <MysteryIcon className="peek-icon-mystery" />
    <span className="peek-icon-dessert"><Donut type={dessert} /></span>
  </span>;
}

export function AddTimeIcon() {
  return <img className="add-time-icon" src={addTime} alt="" />;
}

export function QuickOrderIcon() {
  return <img className="quick-order-icon" src={quickOrder} alt="" />;
}

export function TrayClearIcon() {
  return <img className="tray-clear-icon" src={trayClear} alt="" />;
}

export function ItemButtonIcon({ item }: { item: 'quickOrder' | 'trayClear' }) {
  return <svg className="item-button-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {item === 'quickOrder'
      ? <path d="M13.8 1.8 4.6 13.4h6.1l-1.5 8.8 9.2-11.6h-6.1l1.5-8.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      : <path fillRule="evenodd" d="M6.7 3a2.8 2.8 0 0 0-2.6 1.9L1.6 12a3 3 0 0 0-.1.9V18a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-5.1a3 3 0 0 0-.1-.9l-2.5-7.1A2.8 2.8 0 0 0 17.3 3H6.7Zm0 2.5h10.6l2.3 6.5h-4.3l-1.2 2h-4.2l-1.2-2H4.4l2.3-6.5Z" />}
  </svg>;
}
