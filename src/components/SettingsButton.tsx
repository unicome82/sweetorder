import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SoundControls } from './SoundControls';
import { useMessages } from '../i18n/language';
import type { Language } from '../i18n/messages';
import type { PlayMode } from '../app/modePreference';

export interface SettingsProps {
  soundEnabled: boolean; onToggleSound: () => void;
  language: Language; onLanguage: (language: Language) => void;
  mode: PlayMode; onMode: (mode: PlayMode) => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<[T, string, string?]>; onChange: (value: T) => void;
}) {
  return <div className="settings-segmented" role="group" aria-label={label}>
    {options.map(([option, text, lang]) => <button key={option} type="button" lang={lang} aria-pressed={value === option}
      onClick={() => onChange(option)}>{text}</button>)}
  </div>;
}

/** One popup for language, game mode and sound, on the start and stage screens. */
export function SettingsButton({ language, onLanguage, mode, onMode, ...sound }: SettingsProps) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return <>
    <button type="button" className="icon-button" onClick={() => setOpen(true)} aria-label={t.settings} aria-haspopup="dialog">
      <Icon name="settings" />
    </button>
    <dialog ref={dialog} className="glass-popup tray-full-dialog sound-dialog settings-dialog" aria-labelledby="settings-heading"
      onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <h2 id="settings-heading">{t.settings}</h2>
      <section className="settings-section">
        <h3>{t.language}</h3>
        <Segmented label={t.language} value={language} onChange={onLanguage}
          options={[['ko', '한국어', 'ko'], ['en', 'English', 'en']]} />
      </section>
      <section className="settings-section">
        <h3>{t.mode}</h3>
        <Segmented label={t.mode} value={mode} onChange={onMode}
          options={[['timed', t.modeTimed], ['relaxed', t.modeRelaxed]]} />
        <p className="settings-hint">{mode === 'timed' ? t.modeTimedHint : t.modeRelaxedHint}</p>
      </section>
      <section className="settings-section">
        <h3>{t.soundSection}</h3>
        <SoundControls {...sound} />
      </section>
      <div className="result-actions"><button type="button" className="primary-button popup-primary-button" onClick={() => setOpen(false)}>{t.close}</button></div>
    </dialog>
  </>;
}
