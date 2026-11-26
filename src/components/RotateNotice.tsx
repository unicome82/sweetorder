import { useMessages } from '../i18n/language';

/** Media query for a phone held sideways; the notice below covers the game then. Keep in step with main.scss. */
export const SIDEWAYS_PHONE = '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)';

/** Asks for portrait on a phone held sideways. Shown only by CSS (see .rotate-notice). */
export function RotateNotice() {
  const t = useMessages();
  return <div className="rotate-notice" role="alert">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="6.5" y="2" width="11" height="20" rx="2.2" /><path d="M10.5 18.5h3" />
    </svg>
    <p>{t.rotateToPortrait}</p>
  </div>;
}
