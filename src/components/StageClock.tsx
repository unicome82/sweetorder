import rewardStar from '../assets/game/reward-star.webp';
import { getTimeStars } from '../game/stageTime';
import { useMessages } from '../i18n/language';

// Each star sits where it is lost: the third at 50%, the second at 25%, the last at 0%.
const starPositions = [0, 25, 50];

function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StageClock({ remainingMs, limitMs }: { remainingMs: number; limitMs: number }) {
  const t = useMessages();
  // +5 seconds can run past the limit; the bar stays full until it is back under.
  const remainingPercent = Math.min(100, remainingMs / limitMs * 100);
  const stars = getTimeStars(remainingMs, limitMs);
  return <div className="stage-clock" role="progressbar" aria-label={t.timeLeft}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPercent)}
    aria-valuetext={t.timeText(formatTime(remainingMs), stars)}>
    <span className="stage-clock-bar" aria-hidden="true">
      <span className="stage-clock-track">
        <span className={`stage-clock-fill stage-clock-fill--${stars}`} style={{ width: `${remainingPercent}%` }} />
      </span>
      {starPositions.map((position, index) => <span key={index} className={`stage-clock-star${index >= stars ? ' stage-clock-star--lost' : ''}`}
        style={{ left: `${position}%` }}>
        <img src={rewardStar} width={20} height={20} alt="" draggable={false} />
      </span>)}
    </span>
    <span className="stage-clock-time" aria-hidden="true">{formatTime(remainingMs)}</span>
  </div>;
}
