import { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react';
import rewardStar from '../assets/game/reward-star.webp';
import { clockPhase, getTimeStars, type ClockPhase } from '../game/stageTime';
import { useMessages } from '../i18n/language';

// Each star sits where it is lost: the third at 50%, the second at 25%, the last at 0%.
const starPositions = [0, 25, 50];
const BONUS_HIGHLIGHT_HOLD_MS = 450;

function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * showStars: false on a bonus stage, which pays a heart instead of stars.
 * bump: counts up as +5 seconds joins the clock one second at a time; each change pops the time and flashes the bar.
 * highlight: while that count runs, the clock sits above the intro's dimming, its time large and blue.
 */
export function StageClock({ remainingMs, limitMs, showStars = true, bump = 0, highlight = false }: {
  remainingMs: number; limitMs: number; showStars?: boolean; bump?: number; highlight?: boolean;
}) {
  const t = useMessages();
  // +5 seconds can run past the limit; the bar stays full until it is back under.
  const remainingPercent = Math.min(100, remainingMs / limitMs * 100);
  const stars = getTimeStars(remainingMs, limitMs);
  return <div className={`stage-clock${highlight ? ' stage-clock--bonus' : ''}`} role="progressbar" aria-label={t.timeLeft}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPercent)}
    aria-valuetext={showStars ? t.timeText(formatTime(remainingMs), stars) : formatTime(remainingMs)}>
    <span className="stage-clock-bar" aria-hidden="true">
      <span className="stage-clock-track">
        <span className={`stage-clock-fill stage-clock-fill--${stars}`} style={{ width: `${remainingPercent}%` }} />
        {bump > 0 && <span key={bump} className="stage-clock-flash" />}
      </span>
      {showStars && starPositions.map((position, index) => <span key={index} className={`stage-clock-star${index >= stars ? ' stage-clock-star--lost' : ''}`}
        style={{ left: `${position}%` }}>
        <img src={rewardStar} width={20} height={20} alt="" draggable={false} />
      </span>)}
    </span>
    <span key={bump} className={`stage-clock-time${bump > 0 ? ' stage-clock-time--bump' : ''}`} aria-hidden="true">{formatTime(remainingMs)}</span>
  </div>;
}

/**
 * The running clock. It ticks on its own every 100ms so the game page only re-renders when its phase changes
 * (a star lost, each of the last ten seconds, 0:00) rather than ten times a second.
 * frozenMs: the time shown while paused or blocked. bonusAt: until then the bar holds at the stage's own limit.
 */
export function LiveStageClock({ deadline, running, frozenMs, clockMax, limitMs, bonusAt, bonusStepMs, showStars, onPhase }: {
  deadline: number; running: boolean; frozenMs?: number; clockMax: number; limitMs: number; bonusAt: number; bonusStepMs: number; showStars?: boolean;
  onPhase: (phase: ClockPhase) => void;
}) {
  // Seconds past the stage's limit (+5 seconds), added one at a time from bonusAt, one every bonusStepMs.
  const extraSteps = Math.round(Math.max(0, clockMax - limitMs) / 1000);
  const countEnd = bonusAt + extraSteps * bonusStepMs;
  const stepAt = (now: number) => now < bonusAt ? 0 : Math.min(extraSteps, Math.floor((now - bonusAt) / bonusStepMs) + 1);
  const [remaining, setRemaining] = useState(() => Math.min(clockMax, limitMs));
  const [bonusStep, setBonusStep] = useState(() => stepAt(performance.now()));
  // The clock stays highlighted a moment after the last second lands.
  const [highlightOver, setHighlightOver] = useState(() => performance.now() >= countEnd + BONUS_HIGHLIGHT_HOLD_MS);
  useLayoutEffect(() => {
    if (!running) return;
    const update = () => {
      const now = performance.now();
      const left = Math.min(clockMax, Math.max(0, deadline - now));
      const step = stepAt(now);
      setBonusStep(step);
      setRemaining(step < extraSteps ? Math.min(left, limitMs + step * 1000) : left);
      if (left === 0) clearInterval(interval);
    };
    const interval = setInterval(update, 100);
    const deadlineTimer = setTimeout(update, Math.max(0, Math.ceil(deadline - performance.now())));
    // Each added second lands on time, not on the next 100ms tick.
    const stepTimers = Array.from({ length: extraSteps }, (_, i) => bonusAt + i * bonusStepMs - performance.now())
      .filter(wait => wait >= 0).map(wait => setTimeout(update, Math.ceil(wait)));
    const holdWait = countEnd + BONUS_HIGHLIGHT_HOLD_MS - performance.now();
    const holdTimer = holdWait > 0 ? setTimeout(() => setHighlightOver(true), holdWait) : undefined;
    update();
    return () => { clearInterval(interval); clearTimeout(deadlineTimer); stepTimers.forEach(clearTimeout); clearTimeout(holdTimer); };
    // stepAt only reads the props listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, running, clockMax, bonusAt, bonusStepMs, limitMs]);
  const shown = frozenMs ?? remaining;
  const { stars, second, out } = clockPhase(shown, limitMs);
  const report = useEffectEvent(() => onPhase({ stars, second, out }));
  useEffect(() => { report(); }, [stars, second, out]);
  return <StageClock remainingMs={shown} limitMs={limitMs} showStars={showStars} bump={highlightOver ? 0 : bonusStep} highlight={bonusStep > 0 && !highlightOver} />;
}
