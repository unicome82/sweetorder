import cafePlaying from '../assets/game/cafe-playing.webp?url&no-inline';
import cafe from '../assets/game/cafe.webp?url&no-inline';

const menu = import.meta.glob<string>('../assets/menu/*.webp', { eager: true, import: 'default', query: '?url&no-inline' });
const customers = import.meta.glob<string>('../assets/customers/*.webp', { eager: true, import: 'default', query: '?url&no-inline' });

// Held so the browser keeps the decoded pictures while the start screens are up.
const kept: HTMLImageElement[] = [];

/**
 * Loads the game screen's pictures (cafe, desserts, customers) once the first screen is idle, so starting a stage
 * doesn't show an empty board for a frame while they arrive. About 500KB, after the first screen has finished.
 */
export function preloadGameArt(): void {
  const load = () => {
    for (const src of [cafePlaying, cafe, ...Object.values(menu), ...Object.values(customers)]) {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      kept.push(image);
      image.decode().catch(() => undefined);
    }
  };
  const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1500));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}
