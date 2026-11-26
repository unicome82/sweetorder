import { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react';
import rewardStar from '../assets/game/reward-star.webp';
import { clockPhase, getTimeStars, type ClockPhase } from '../game/stageTime';
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

/**
 * The running clock. It ticks on its own every 100ms so the game page only re-renders when its phase changes
 * (a star lost, each of the last ten seconds, 0:00) rather than ten times a second.
 * frozenMs: the time shown while paused or blocked. bonusAt: until then the bar holds at the stage's own limit.
 */
export function LiveStageClock({ deadline, running, frozenMs, clockMax, limitMs, bonusAt, onPhase }: {
  deadline: number; running: boolean; frozenMs?: number; clockMax: number; limitMs: number; bonusAt: number;
  onPhase: (phase: ClockPhase) => void;
}) {
  const [remaining, setRemaining] = useState(() => Math.min(clockMax, limitMs));
  useLayoutEffect(() => {
    if (!running) return;
    const update = () => {
      const now = performance.now();
      const left = Math.min(clockMax, Math.max(0, deadline - now));
      setRemaining(now < bonusAt ? Math.min(left, limitMs) : left);
      if (left === 0) clearInterval(interval);
    };
    const interval = setInterval(update, 100);
    const deadlineTimer = setTimeout(update, Math.max(0, Math.ceil(deadline - performance.now())));
    update();
    return () => { clearInterval(interval); clearTimeout(deadlineTimer); };
  }, [deadline, running, clockMax, bonusAt, limitMs]);
  const shown = frozenMs ?? remaining;
  const { stars, second, out } = clockPhase(shown, limitMs);
  const report = useEffectEvent(() => onPhase({ stars, second, out }));
  useEffect(() => { report(); }, [stars, second, out]);
  return <StageClock remainingMs={shown} limitMs={limitMs} />;
}
