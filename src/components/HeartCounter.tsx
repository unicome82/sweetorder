import { describeHearts, formatWait, type Hearts } from '../game/hearts';
import { useNow } from '../hooks/useNow';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

// Regular hearts are counted beside the heart, bonus hearts in a red badge on the box's top right,
// and the refill countdown follows while there are fewer than five.
// Pass spare hearts sit in a gold badge on the top left, and the countdown runs at the pass's double speed.
// With onCharge it becomes a button whenever bonus hearts can top the regular hearts up.
export function HeartCounter({ hearts, spare = 0, fastUntil, className = '', onCharge }: {
  hearts: Hearts; spare?: number; fastUntil?: number; className?: string; onCharge?: () => void;
}) {
  const t = useMessages();
  const now = useNow();
  const { count, bonus, nextInMs, chargeable } = describeHearts(hearts, now, fastUntil);
  const wait = nextInMs === null ? undefined : formatWait(nextInMs);
  const label = t.heartsLabel(count, bonus, wait) + (spare > 0 ? `, ${t.spareHeartsLabel(spare)}` : '');
  const content = <>
    <HeartIcon />
    <span className="heart-counter-count" lang="en" aria-hidden="true">{count}</span>
    {wait && <span className="heart-counter-timer" lang="en" aria-hidden="true">{wait}</span>}
    {bonus > 0 && <span className="heart-counter-bonus" lang="en" aria-hidden="true">{bonus}</span>}
    {spare > 0 && <span className="heart-counter-spare" lang="en" aria-hidden="true">{spare}</span>}
  </>;
  return onCharge && chargeable > 0
    ? <button type="button" className={`heart-counter heart-counter--chargeable ${className}`} onClick={onCharge} aria-label={`${label}. ${t.chargeHearts}`}>{content}</button>
    : <div className={`heart-counter ${className}`} role="status" aria-label={label}>{content}</div>;
}
