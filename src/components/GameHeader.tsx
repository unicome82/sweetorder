import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { useMessages } from '../i18n/language';
export function GameHeader({ stage, title, onPause, canPause, settings }: { stage: number; title?: string; onPause?: () => void; canPause?: boolean; settings?: ReactNode }) {
  const t = useMessages();
  return <header className="game-header">
    <h1>{title ?? `Stage ${String(stage).padStart(2, '0')}`}</h1>
    {settings}
    {onPause && <button type="button" data-sfx="none" className="icon-button pause-button" onClick={onPause} disabled={!canPause} aria-label={t.pause}><Icon name="pause" /></button>}
  </header>;
}
