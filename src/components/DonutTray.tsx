import type { DonutToken, StageDifficulty } from '../game/types';
import { StageDifficultyRibbon } from './StageDifficultyRibbon';
import { BASE_TRAY_CAPACITY } from '../game/constants';
import { Donut } from './Donut/Donut';
import { useMessages } from '../i18n/language';
import { Icon } from './Icon';
import { QuickOrderIcon } from './ItemIcons';
type TrayLevel = 'calm' | 'warn' | 'danger';
function getTrayLevel(used: number, capacity: number): TrayLevel {
  if (capacity - used <= 1) return 'danger';
  return used / capacity >= 0.7 ? 'warn' : 'calm';
}

/**
 * clearsLeft: tray clears this game may still use; owned: the player's pool, shown on the badge; needsAd: the next one costs an ad.
 * quickOrders: held quick orders, shown beside the tray clear (practice leaves it out).
 */
export function DonutTray({ donuts, capacity, difficulty, inFlight, clearsLeft, owned, needsAd, canClear, onClear, quickOrders, canQuickOrder, onQuickOrder }: {
  donuts: DonutToken[]; capacity: number; difficulty?: StageDifficulty; inFlight?: ReadonlySet<string>; clearsLeft: number; owned: number; needsAd: boolean; canClear: boolean; onClear: () => void;
  quickOrders?: number; canQuickOrder?: boolean; onQuickOrder?: () => void;
}) {
  const t = useMessages();
  const level = getTrayLevel(donuts.length, capacity);
  const columns = Math.min(capacity, BASE_TRAY_CAPACITY);
  // Every capacity spans the full width; dessert size stays tied to a 12-slot row in CSS.
  return <div className={`tray-row tray-row--${level}${quickOrders !== undefined ? ' tray-row--quick-order' : ''}`}>
    <section className={`tray-section tray-section--${level}`} aria-label={t.tray(donuts.length, capacity)}>
    <StageDifficultyRibbon difficulty={difficulty} />
    <div className="tray"><ol className="tray-slots" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: capacity }, (_, i) => <li key={i} data-tray-slot={i} data-token-id={donuts[i]?.id} aria-label={donuts[i] ? t.items[donuts[i].type] : t.emptySlot(i + 1)}>{donuts[i] ? <span className="tray-donut" style={{ visibility: inFlight?.has(donuts[i].id) ? 'hidden' : undefined }}><Donut type={donuts[i].type} /></span> : null}</li>)}</ol></div>
  </section>
    <button type="button" data-sfx="none" className="tray-clear-shortcut" onClick={onClear} disabled={!canClear || clearsLeft <= 0} aria-label={needsAd ? t.clearTrayAdLabel : t.clearTrayLabel(owned)}>
      <Icon name="basket" />{needsAd
        ? <span className="tray-clear-shortcut-count tray-clear-ad" lang="en" aria-hidden="true">AD</span>
        : <span className="tray-clear-shortcut-count" aria-hidden="true">{owned}</span>}
    </button>
    {quickOrders !== undefined && <button type="button" data-sfx="none" className="tray-clear-shortcut quick-order-shortcut" onClick={onQuickOrder} disabled={!canQuickOrder || quickOrders <= 0} aria-label={t.quickOrderLabel(quickOrders)}>
      <QuickOrderIcon /><span className="tray-clear-shortcut-count" aria-hidden="true">{quickOrders}</span>
    </button>}
  </div>;
}
