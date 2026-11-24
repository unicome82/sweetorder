import { describeHearts, formatWait, type Hearts } from '../game/hearts';
import { useNow } from '../hooks/useNow';
import { useMessages } from '../i18n/language';
import { HeartIcon } from './HeartIcon';

// Hearts are counted beside the heart, pass spare hearts in a red badge on the box's top right,
// and the refill countdown follows while there are fewer than five (at double speed during a pass).
export function HeartCounter({ hearts, spare = 0, fastUntil, className = '' }: {
  hearts: Hearts; spare?: number; fastUntil?: number; className?: string;
}) {
  const t = useMessages();
  const now = useNow();
  const { count, nextInMs } = describeHearts(hearts, now, fastUntil);
  const wait = nextInMs === null ? undefined : formatWait(nextInMs);
  return <div className={`heart-counter ${className}`} role="status" aria-label={t.heartsLabel(count, spare, wait)}>
    <HeartIcon />
    <span className="heart-counter-count" lang="en" aria-hidden="true">{count}</span>
    {wait && <span className="heart-counter-timer" lang="en" aria-hidden="true">{wait}</span>}
    {spare > 0 && <span className="heart-counter-spare" lang="en" aria-hidden="true">{spare}</span>}
  </div>;
}
