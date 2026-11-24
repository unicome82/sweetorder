import type { DonutToken, StageDifficulty } from '../game/types';
import { StageDifficultyRibbon } from './StageDifficultyRibbon';
import { BASE_TRAY_CAPACITY } from '../game/constants';
import { Donut } from './Donut/Donut';
import { useMessages } from '../i18n/language';
import { Icon } from './Icon';
type TrayLevel = 'calm' | 'warn' | 'danger';
function getTrayLevel(used: number, capacity: number): TrayLevel {
  if (capacity - used <= 1) return 'danger';
  return used / capacity >= 0.7 ? 'warn' : 'calm';
}

/** clearsLeft: tray clears this game may still use; owned: the player's whole pool, shown on the badge. */
export function DonutTray({ donuts, capacity, difficulty, inFlight, clearsLeft, owned, canClear, onClear }: { donuts: DonutToken[]; capacity: number; difficulty?: StageDifficulty; inFlight?: ReadonlySet<string>; clearsLeft: number; owned: number; canClear: boolean; onClear: () => void }) {
  const t = useMessages();
  const level = getTrayLevel(donuts.length, capacity);
  const columns = Math.min(capacity, BASE_TRAY_CAPACITY);
  // Every capacity spans the full width; dessert size stays tied to a 12-slot row in CSS.
  return <div className={`tray-row tray-row--${level}`}>
    <section className={`tray-section tray-section--${level}`} aria-label={t.tray(donuts.length, capacity)}>
    <StageDifficultyRibbon difficulty={difficulty} />
    <div className="tray"><ol className="tray-slots" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: capacity }, (_, i) => <li key={i} data-tray-slot={i} data-token-id={donuts[i]?.id} aria-label={donuts[i] ? t.items[donuts[i].type] : t.emptySlot(i + 1)}>{donuts[i] ? <span className="tray-donut" style={{ visibility: inFlight?.has(donuts[i].id) ? 'hidden' : undefined }}><Donut type={donuts[i].type} /></span> : null}</li>)}</ol></div>
  </section>
    <button type="button" data-sfx="none" className="tray-clear-shortcut" onClick={onClear} disabled={!canClear || clearsLeft <= 0} aria-label={t.clearTrayLabel(owned)}>
      <Icon name="basket" /><span className="tray-clear-shortcut-count" aria-hidden="true">{owned}</span>
    </button>
  </div>;
}
