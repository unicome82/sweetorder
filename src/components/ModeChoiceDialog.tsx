import { useLayoutEffect, useRef } from 'react';
import popupCat from '../assets/game/popup-cat.webp';
import { useMessages } from '../i18n/language';
import type { PlayMode } from '../app/modePreference';

/** Asked once on the first visit: how the player wants to play. Settings can change it later. */
export function ModeChoiceDialog({ onChoose }: { onChoose: (mode: PlayMode) => void }) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const choices: Array<[PlayMode, string, string, string]> = [
    ['timed', '⏱️', t.modeTimedTitle, t.modeTimedHint],
    ['relaxed', '🌿', t.modeRelaxedTitle, t.modeRelaxedHint],
  ];
  return <dialog className="glass-popup tray-full-dialog mode-choice-dialog" ref={dialog} aria-labelledby="mode-choice-heading"
    onCancel={event => event.preventDefault()}>
    <img className="popup-cat" src={popupCat} alt="" draggable={false} />
    <h2 id="mode-choice-heading">{t.modeChoiceTitle}</h2>
    <div className="mode-choice-list">
      {choices.map(([mode, emoji, title, hint]) => <button key={mode} type="button" className="mode-choice" onClick={() => onChoose(mode)}>
        <span className="mode-choice-title"><span aria-hidden="true">{emoji}</span>{title}</span>
        <span className="mode-choice-hint">{hint}</span>
      </button>)}
    </div>
    <p className="settings-hint mode-choice-note">{t.modeChoiceNote}</p>
  </dialog>;
}
