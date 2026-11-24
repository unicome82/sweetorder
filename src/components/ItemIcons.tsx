import type { DonutType } from '../game/types';
import { Donut } from './Donut/Donut';

/** Peek: a "?" that keeps turning into the dessert behind it, so the effect reads at a glance. */
export function PeekIcon({ dessert = 'strawberryDonut' }: { dessert?: DonutType }) {
  return <span className="peek-icon" aria-hidden="true">
    <span className="peek-icon-mystery">?</span>
    <span className="peek-icon-dessert"><Donut type={dessert} /></span>
  </span>;
}

/** +5 seconds: a stopwatch with "+5s" on its face. */
export function AddTimeIcon() {
  return <svg className="add-time-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9.5" y="0.8" width="5" height="2.4" rx="1.2" fill="currentColor" />
    <path d="M18.6 4.6l1.6 1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="13.4" r="9.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <text x="12" y="16.3" textAnchor="middle" fontSize="8" fontFamily="Jua, sans-serif" fill="currentColor" lang="en">+5s</text>
  </svg>;
}
