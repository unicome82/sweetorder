import { memo, useState } from 'react';
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
 * busy: desserts are still moving; the buttons ignore taps without greying out, so fast play doesn't make them flicker.
 * Each button shows only while it can be used this game: the tray clear until the game's clears run out,
 * quick order shows the inventory count or an ad badge.
 */
// Memoized: the game page re-renders for timers and deliveries that often leave the tray as it was.
export const DonutTray = memo(function DonutTray({ donuts, capacity, difficulty, inFlight, busy, clearsLeft, owned, needsAd, canClear, onClear, quickOrders, quickNeedsAd, canQuickOrder, onQuickOrder }: {
  donuts: DonutToken[]; capacity: number; difficulty?: StageDifficulty; inFlight?: ReadonlySet<string>; busy?: boolean; clearsLeft: number; owned: number; needsAd: boolean; canClear: boolean; onClear: () => void;
  quickOrders?: number; quickNeedsAd?: boolean; canQuickOrder?: boolean; onQuickOrder?: () => void;
}) {
  const t = useMessages();
  const level = getTrayLevel(donuts.length, capacity);
  const columns = Math.min(capacity, BASE_TRAY_CAPACITY);
  const showClear = clearsLeft > 0;
  const showQuickOrder = quickNeedsAd || (quickOrders ?? 0) > 0;
  // Held from the start, the quick order is just there; picked up mid-game, it pops in.
  const [heldAtStart] = useState(showQuickOrder);
  const buttons = Number(showClear) + Number(showQuickOrder);
  // Every capacity spans the full width; dessert size stays tied to a 12-slot row in CSS.
  return <div className={`tray-row tray-row--${level} tray-row--buttons-${buttons}`}>
    <section className={`tray-section tray-section--${level}`} aria-label={t.tray(donuts.length, capacity)}>
    <StageDifficultyRibbon difficulty={difficulty} />
    <div className="tray"><ol className="tray-slots" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: capacity }, (_, i) => <li key={i} data-tray-slot={i} data-token-id={donuts[i]?.id} aria-label={donuts[i] ? t.items[donuts[i].type] : t.emptySlot(i + 1)}>{donuts[i] ? <span className="tray-donut" style={{ visibility: inFlight?.has(donuts[i].id) ? 'hidden' : undefined }}><Donut type={donuts[i].type} /></span> : null}</li>)}</ol></div>
  </section>
    {showClear && <button type="button" data-sfx="none" className="tray-clear-shortcut" onClick={() => { if (!busy) onClear(); }} disabled={!canClear} aria-disabled={busy || undefined} aria-label={needsAd ? t.clearTrayAdLabel : t.clearTrayLabel(owned)}>
      <ItemButtonIcon item="trayClear" />{needsAd
        ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span>
        : <span className="tray-clear-shortcut-count" aria-hidden="true">{owned}</span>}
    </button>}
    {showQuickOrder && <button type="button" data-sfx="none" className={`tray-clear-shortcut quick-order-shortcut${heldAtStart ? '' : ' quick-order-shortcut--new'}`} onClick={() => { if (!busy) onQuickOrder?.(); }} disabled={!canQuickOrder} aria-disabled={busy || undefined} aria-label={quickNeedsAd ? t.quickOrderAdLabel : t.quickOrderLabel(quickOrders ?? 0)}>
      <ItemButtonIcon item="quickOrder" />{quickNeedsAd ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span> : <span className="tray-clear-shortcut-count" aria-hidden="true">{quickOrders}</span>}
    </button>}
  </div>;
});
