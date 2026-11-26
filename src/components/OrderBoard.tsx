import displayShelf from '../assets/game/display-shelf.webp';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { MOVE_DURATION } from '../effects/turnEffects';
import { CUSTOMER_GOODBYE_MS } from '../effects/customerTiming';
import { playSound } from '../effects/sound';
import { Donut } from './Donut/Donut';
import { Customer } from './Customer';
import { useMessages } from '../i18n/language';
import { ORDER_SLOTS } from '../game/constants';
import { DONUT_TYPES, type ActiveOrder } from '../game/types';

const ARRIVAL_DURATION = 160;
const FIRST_ARRIVAL_STAGGER = 130;
const BUBBLE_FADE_DURATION = 180;
const ORDER_PREVIEW_DURATION = 250;
const REPLACEMENT_ARRIVAL_DELAY = 390;

function canAnimate() {
  return typeof Element.prototype.animate === 'function'
    && document.visibilityState === 'visible'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CustomerOrder({ order, slot, portraitOffset, onOrderReady }: {
  order: ActiveOrder; slot: number; portraitOffset: number; onOrderReady: (id: string) => void;
}) {
  const t = useMessages();
  const root = useRef<HTMLElement>(null);
  const { definitionId: orderId, sequence } = order;

  const previousRemaining = useRef(order.remaining);
  useLayoutEffect(() => {
    const previous = previousRemaining.current;
    previousRemaining.current = order.remaining;
    if (!canAnimate()) return;
    for (const type of DONUT_TYPES) {
      const remaining = order.remaining[type] ?? 0;
      if (remaining > 0 && remaining < (previous[type] ?? 0)) {
        root.current?.querySelector(`[data-order-item="${type}"] strong`)?.animate(
          [{ scale: '1.3' }, { scale: '1' }],
          { duration: 180, easing: 'ease-out' },
        );
      }
    }
  }, [order.remaining]);

  useLayoutEffect(() => {
    const container = root.current;
    const animations: Animation[] = [];
    let readyAfter = ORDER_PREVIEW_DURATION;
    if (container && canAnimate()) {
      const arrivalDelay = sequence <= ORDER_SLOTS ? (sequence - 1) * FIRST_ARRIVAL_STAGGER : REPLACEMENT_ARRIVAL_DELAY;
      const fadeDelay = arrivalDelay + ARRIVAL_DURATION;
      const scene = container.querySelector('.customer-scene');
      const bubble = container.querySelector('.speech-bubble');
      if (scene) animations.push(scene.animate([
        { transform: 'translateX(28px)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ], { duration: ARRIVAL_DURATION, delay: arrivalDelay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' }));
      if (bubble) animations.push(bubble.animate([
        { opacity: 0, visibility: 'hidden' },
        { opacity: 1, visibility: 'visible' },
      ], { duration: BUBBLE_FADE_DURATION, delay: fadeDelay, easing: 'ease-out', fill: 'both' }));
      readyAfter += fadeDelay + BUBBLE_FADE_DURATION;
    }
    const ready = setTimeout(() => {
      for (const animation of animations) animation.cancel();
      onOrderReady(orderId);
    }, readyAfter);
    return () => {
      clearTimeout(ready);
      for (const animation of animations) animation.cancel();
    };
  }, [onOrderReady, orderId, sequence]);

  return <article ref={root} className="order-card" style={{ gridColumn: slot + 1, gridRow: 1 }}
    data-order-id={orderId} data-order-slot={slot} aria-label={t.orderLabel(sequence)}>
    <div className="customer-visit"><div className="customer-scene"><Customer sequence={order.sequence + portraitOffset} />
      <span className="order-delivery" aria-hidden="true" /></div><div className="speech-bubble"><ul className="order-items">{DONUT_TYPES.filter(type => (order.remaining[type] ?? 0) > 0).map(type => <li key={type} data-order-item={type} aria-label={t.orderItem(t.items[type], order.remaining[type] ?? 0)}><Donut type={type} /><strong>{order.remaining[type]}</strong></li>)}</ul>
    </div></div>
  </article>;
}
interface CardSnapshot { node: HTMLElement; left: number; top: number; width: number; height: number; layoutVersion: number }

function animateDeparture(grid: HTMLElement, snapshot: CardSnapshot) {
  const { node, left, top, width, height } = snapshot;
  node.classList.add('customer-leaving');
  node.removeAttribute('data-order-id');
  node.removeAttribute('data-order-slot');
  node.setAttribute('aria-hidden', 'true');
  // Drop the grid placement: an absolutely placed grid item with a column measures left/top from that
  // column, which pushed every customer but the first one column further right as they left.
  Object.assign(node.style, { gridColumn: '', gridRow: '', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });

  const scene = node.querySelector('.customer-scene');
  if (scene) {
    const hearts = document.createElement('span');
    hearts.className = 'customer-hearts';
    for (const [direction, glyph] of [['left', '♥'], ['center', '♥'], ['right', '♥'], ['spark-left', '✦'], ['spark-right', '✦']] as const) {
      const particle = document.createElement('span');
      particle.className = `customer-heart--${direction}`;
      particle.textContent = glyph;
      hearts.append(particle);
    }
    scene.append(hearts);
  }
  grid.append(node);
  node.querySelector('.speech-bubble')?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: BUBBLE_FADE_DURATION, delay: MOVE_DURATION, easing: 'ease-out', fill: 'forwards',
  });
  const animation = node.animate([
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(0)', opacity: 1, offset: .28 },
    { transform: 'translateX(-24px)', opacity: 0 },
  ], { duration: CUSTOMER_GOODBYE_MS, easing: 'ease-out', fill: 'forwards' });
  // The customer starts walking off 28% into the goodbye animation.
  playSound('departure', CUSTOMER_GOODBYE_MS * 0.28);
  void animation.finished.then(() => node.remove(), () => node.remove());
}

// Memoized: it only needs to render when the orders (or the stage) change.
export const OrderBoard = memo(function OrderBoard({ orders, stageId, onOrderReady }: { orders: Array<ActiveOrder | null>; stageId: number; onOrderReady: (id: string) => void }) {
  const t = useMessages();
  const grid = useRef<HTMLDivElement>(null);
  const snapshots = useRef(new Map<string, CardSnapshot>());
  // Bumped on resize so the cards' cached boxes are measured again.
  const layoutVersion = useRef(0);
  useEffect(() => {
    const bump = () => { layoutVersion.current += 1; };
    window.addEventListener('resize', bump);
    return () => window.removeEventListener('resize', bump);
  }, []);
  // Each stage starts further along the portrait cycle, so consecutive stages open with new faces.
  const portraitOffset = (stageId - 1) * 13;
  const arranged = orders.flatMap((order, slot) => order ? [{ order, slot }] : []);

  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const previous = snapshots.current;
    const current = new Map<string, CardSnapshot>();
    const animate = canAnimate();
    for (const card of element.querySelectorAll<HTMLElement>('[data-order-id]')) {
      const id = card.dataset.orderId!;
      // A card keeps its slot, so its box is measured once (and again after a resize), not on every update:
      // measuring right after the board changes forces a layout.
      const known = previous.get(id);
      const box = known && known.layoutVersion === layoutVersion.current ? known
        : { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
      const { left, top, width, height } = box;
      current.set(id, { node: card.cloneNode(true) as HTMLElement, left, top, width, height, layoutVersion: layoutVersion.current });
    }
    if (animate) {
      for (const [id, snapshot] of previous) {
        if (!current.has(id)) animateDeparture(element, snapshot);
      }
    }
    snapshots.current = current;
  }, [orders]);

  return <section className="order-section" aria-label={t.orders}>
    <div ref={grid} className="order-grid">
      {arranged.map(({ order, slot }) => <CustomerOrder key={order.definitionId} slot={slot} order={order} portraitOffset={portraitOffset} onOrderReady={onOrderReady} />)}
    </div>
    <img className="display-shelf" src={displayShelf} alt="" aria-hidden="true" draggable={false} />
  </section>;
});
