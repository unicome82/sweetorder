import { useMessages } from '../i18n/language';

/** The stage list's "PASS" pill: opens the pass offer. Shown only while there is no pass. */
export function PassButton({ onClick }: { onClick: () => void }) {
  const t = useMessages();
  return <button type="button" className="pass-nav-button" onClick={onClick} aria-label={t.passNavLabel}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5L3 8.5Z" fill="currentColor" /></svg>
    <span lang="en">PASS</span>
  </button>;
}
