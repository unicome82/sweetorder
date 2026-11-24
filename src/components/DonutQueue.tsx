import { useEffect, useRef } from 'react';
import type { DonutToken } from '../game/types';
import { Donut } from './Donut/Donut';
import { useMessages } from '../i18n/language';
import { RewardHeart } from './RewardHeart';
import { Icon } from './Icon';
export function DonutQueue({ queues, disabled, locked = false, returning, hintColumn, onSelect, onReject }: {
  queues: DonutToken[][]; disabled: boolean; locked?: boolean; returning: ReadonlySet<string>; hintColumn: number;
  onSelect: (queueIndex: number, expectedDonutId: string) => void;
  /** Called when a tap cannot pick anything: the tray is full or the column is empty. */
  onReject?: (queueIndex: number, element: HTMLElement) => void;
}) {
  const t = useMessages();
  const presses = useRef(new Map<number, number>());
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hintColumn < 0) return;
    const hintTarget = section.current?.querySelector<HTMLElement>(`[data-queue-index="${hintColumn}"] .queue-front img.donut`);
    if (!hintTarget) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const glow = { filter: 'brightness(1.28) drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px #fff)' };
    const resting = { filter: 'brightness(1) drop-shadow(0 0 2px #fff0) drop-shadow(0 0 5px #fff0)' };
    let animation: Animation | undefined;
    const syncHint = () => {
      animation?.cancel();
      if (document.hidden) return;
      animation = motionPreference.matches
        ? hintTarget.animate([glow, glow], { duration: 1000, iterations: Infinity })
        : hintTarget.animate([resting, glow], {
          duration: 850,
          direction: 'alternate',
          easing: 'ease-in-out',
          iterations: Infinity,
        });
    };
    syncHint();
    document.addEventListener('visibilitychange', syncHint);
    motionPreference.addEventListener('change', syncHint);
    return () => {
      animation?.cancel();
      document.removeEventListener('visibilitychange', syncHint);
      motionPreference.removeEventListener('change', syncHint);
    };
  }, [hintColumn, queues]);

  function selectColumn(column: number, element: HTMLElement) {
    if (disabled) return;
    const front = queues[column]?.[0];
    // A reward at the front can be collected even when the tray is full: it never goes there.
    if (front && (!locked || front.reward)) onSelect(column, front.id);
    else onReject?.(column, element);
  }

  const rewardName = (reward: 'heart' | 'trayClear') => reward === 'heart' ? t.rewardSlotHeart : t.rewardSlotTrayClear;
  const depth = Math.max(1, ...queues.map(queue => queue.length));
  return <section ref={section} className="queue-section" aria-label={t.queueSection}>
    <div className="queue-grid">{queues.map((queue, i) => <button type="button" data-sfx="none" className={`queue-column${queue.some(donut => returning.has(donut.id)) ? ' queue-column--returning' : ''}`} key={i} data-queue-index={i}
      style={{ gridTemplateRows: depth === 1 ? 'var(--queue-head)' : `var(--queue-head) repeat(${depth - 1}, var(--queue-step))` }}
      disabled={disabled}
      aria-disabled={locked || !queue.length || undefined}
      onPointerDown={event => {
        if (event.button !== 0) return;
        presses.current.set(event.pointerId, i);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onLostPointerCapture={event => presses.current.delete(event.pointerId)}
      onPointerCancel={event => presses.current.delete(event.pointerId)}
      onPointerUp={event => {
        const column = presses.current.get(event.pointerId);
        presses.current.delete(event.pointerId);
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (column === i && event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) {
          selectColumn(i, event.currentTarget);
        }
      }}
      onClick={event => { if (event.detail === 0) selectColumn(i, event.currentTarget); }}
      aria-label={t.queueLabel(i + 1, queue[0] && (queue[0].reward ? rewardName(queue[0].reward) : t.items[queue[0].type]), queue.length)}>
      {queue.map((donut, position) => <span
        className={position === 0 ? 'queue-front' : 'queue-back'}
        key={donut.id}
        data-token-id={donut.id}
        style={{ zIndex: position, visibility: returning.has(donut.id) ? 'hidden' : undefined }}>
        {donut.reward === 'heart' ? <span className="donut reward-tile reward-tile--heart"><RewardHeart /></span>
          : donut.reward ? <span className="donut reward-tile reward-tile--trayClear"><Icon name="basket" /></span> : donut.hidden && position > 0 ? <span className="donut donut--mystery">?</span> : <Donut type={donut.type} />}
      </span>)}
    </button>)}</div>
  </section>;
}
