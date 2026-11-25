import { useState } from 'react';
import type { DonutToken, StageDifficulty } from '../game/types';
import { StageDifficultyRibbon } from './StageDifficultyRibbon';
import { BASE_TRAY_CAPACITY } from '../game/constants';
import { Donut } from './Donut/Donut';
import { useMessages } from '../i18n/language';
import { ItemButtonIcon } from './ItemIcons';
type TrayLevel = 'calm' | 'warn' | 'danger';
function getTrayLevel(used: number, capacity: number): TrayLevel {
  if (capacity - used <= 1) return 'danger';
  return used / capacity >= 0.7 ? 'warn' : 'calm';
}

/**
 * clearsLeft: tray clears this game may still use; owned: the player's pool, shown on the badge; needsAd: the next one costs an ad.
 * quickOrders: held quick orders, shown beside the tray clear (practice leaves it out).
 * Each button shows only while it can be used this game: the tray clear until the game's clears run out,
 * the quick order while one is held (it pops in when picked up from a queue).
 */
export function DonutTray({ donuts, capacity, difficulty, inFlight, clearsLeft, owned, needsAd, canClear, onClear, quickOrders, canQuickOrder, onQuickOrder }: {
  donuts: DonutToken[]; capacity: number; difficulty?: StageDifficulty; inFlight?: ReadonlySet<string>; clearsLeft: number; owned: number; needsAd: boolean; canClear: boolean; onClear: () => void;
  quickOrders?: number; canQuickOrder?: boolean; onQuickOrder?: () => void;
}) {
  const t = useMessages();
  const level = getTrayLevel(donuts.length, capacity);
  const columns = Math.min(capacity, BASE_TRAY_CAPACITY);
  const showClear = clearsLeft > 0;
  const showQuickOrder = (quickOrders ?? 0) > 0;
  // Held from the start, the quick order is just there; picked up mid-game, it pops in.
  const [heldAtStart] = useState(showQuickOrder);
  const buttons = Number(showClear) + Number(showQuickOrder);
  // Every capacity spans the full width; dessert size stays tied to a 12-slot row in CSS.
  return <div className={`tray-row tray-row--${level} tray-row--buttons-${buttons}`}>
    <section className={`tray-section tray-section--${level}`} aria-label={t.tray(donuts.length, capacity)}>
    <StageDifficultyRibbon difficulty={difficulty} />
    <div className="tray"><ol className="tray-slots" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: capacity }, (_, i) => <li key={i} data-tray-slot={i} data-token-id={donuts[i]?.id} aria-label={donuts[i] ? t.items[donuts[i].type] : t.emptySlot(i + 1)}>{donuts[i] ? <span className="tray-donut" style={{ visibility: inFlight?.has(donuts[i].id) ? 'hidden' : undefined }}><Donut type={donuts[i].type} /></span> : null}</li>)}</ol></div>
  </section>
    {showClear && <button type="button" data-sfx="none" className="tray-clear-shortcut" onClick={onClear} disabled={!canClear} aria-label={needsAd ? t.clearTrayAdLabel : t.clearTrayLabel(owned)}>
      <ItemButtonIcon item="trayClear" />{needsAd
        ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span>
        : <span className="tray-clear-shortcut-count" aria-hidden="true">{owned}</span>}
    </button>}
    {showQuickOrder && <button type="button" data-sfx="none" className={`tray-clear-shortcut quick-order-shortcut${heldAtStart ? '' : ' quick-order-shortcut--new'}`} onClick={onQuickOrder} disabled={!canQuickOrder} aria-label={t.quickOrderLabel(quickOrders!)}>
      <ItemButtonIcon item="quickOrder" /><span className="tray-clear-shortcut-count" aria-hidden="true">{quickOrders}</span>
    </button>}
  </div>;
}
