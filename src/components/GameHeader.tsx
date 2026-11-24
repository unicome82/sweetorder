import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { useMessages } from '../i18n/language';
/** items: in-game helper buttons on the left (peek, +5 seconds). */
export function GameHeader({ stage, title, onPause, canPause, settings, items }: { stage: number; title?: string; onPause?: () => void; canPause?: boolean; settings?: ReactNode; items?: ReactNode }) {
  const t = useMessages();
  return <header className="game-header">
    {items && <div className="game-header-items">{items}</div>}
    <h1>{title ?? `Stage ${String(stage).padStart(2, '0')}`}</h1>
    {settings}
    {onPause && <button type="button" data-sfx="none" className="icon-button pause-button" onClick={onPause} disabled={!canPause} aria-label={t.pause}><Icon name="pause" /></button>}
  </header>;
}
