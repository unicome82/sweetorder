import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SoundControls } from './SoundControls';
import { useMessages } from '../i18n/language';
import type { Language } from '../i18n/messages';
import type { PlayMode } from '../app/modePreference';
import { useNow } from '../hooks/useNow';
import { isPassActive, type Pass } from '../monetization/pass';

export interface SettingsProps {
  soundEnabled: boolean; onToggleSound: () => void;
  language: Language; onLanguage: (language: Language) => void;
  mode: PlayMode; onMode: (mode: PlayMode) => void;
  /** Playtesting only: the fake pass and a switch for it. */
  testPass?: { pass?: Pass; onBuy: () => void; onEnd: () => void; onFillHearts: () => void; onEmptyHearts: () => void };
}

function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: Array<[T, string, string?]>; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div className="settings-segmented" role="group" aria-label={label}>
    {options.map(([option, text, lang]) => <button key={option} type="button" lang={lang} aria-pressed={value === option}
      disabled={disabled} onClick={() => onChange(option)}>{text}</button>)}
  </div>;
}

function TestPass({ pass, onBuy, onEnd, onFillHearts, onEmptyHearts }: NonNullable<SettingsProps['testPass']>) {
  const t = useMessages();
  const active = isPassActive(pass, useNow());
  return <>
    <p className="settings-hint">{t.testPass}: {active ? t.testPassOn : t.testPassOff}</p>
    <div className="settings-test-actions" role="group" aria-label={t.testPass}>
      <button type="button" className="secondary-button" onClick={onBuy}>{t.testPassBuy}</button>
      <button type="button" className="secondary-button" disabled={!pass} onClick={onEnd}>{t.testPassEnd}</button>
    </div>
    <p className="settings-hint">{t.testHearts}</p>
    <div className="settings-test-actions" role="group" aria-label={t.testHearts}>
      <button type="button" className="secondary-button" onClick={onFillHearts}>{t.testHeartsFill}</button>
      <button type="button" className="secondary-button" onClick={onEmptyHearts}>{t.testHeartsEmpty}</button>
    </div>
  </>;
}

/**
 * One popup for language, game mode and sound. In a game the mode is locked (`inGame`),
 * and onOpen/onClose let the game pause and resume around it.
 */
export function SettingsButton({ language, onLanguage, mode, onMode, testPass, inGame, onOpen, onClose, className = '', ...sound }: SettingsProps & {
  inGame?: boolean; onOpen?: () => void; onClose?: () => void; className?: string;
}) {
  const t = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  const close = () => { if (!open) return; setOpen(false); onClose?.(); };
  return <>
    <button type="button" data-sfx={inGame ? 'none' : undefined} className={`icon-button ${className}`} onClick={() => { onOpen?.(); setOpen(true); }} aria-label={t.settings} aria-haspopup="dialog">
      <Icon name="settings" />
    </button>
    <dialog ref={dialog} className="glass-popup tray-full-dialog sound-dialog settings-dialog" aria-labelledby="settings-heading"
      onClose={close}>
      <header className="settings-header">
        <h2 id="settings-heading">{t.settings}</h2>
        <button type="button" className="icon-button settings-close" onClick={close} aria-label={t.close}><Icon name="close" /></button>
      </header>
      <section className="settings-section">
        <h3>{t.language}</h3>
        <Segmented label={t.language} value={language} onChange={onLanguage}
          options={[['ko', '한국어', 'ko'], ['en', 'English', 'en']]} />
      </section>
      <section className="settings-section">
        <h3>{t.mode}</h3>
        <Segmented label={t.mode} value={mode} onChange={onMode} disabled={inGame}
          options={[['timed', t.modeTimed], ['relaxed', t.modeRelaxed]]} />
        <p className="settings-hint">{inGame ? t.modeLocked : mode === 'timed' ? t.modeTimedHint : t.modeRelaxedHint}</p>
      </section>
      <section className="settings-section">
        <SoundControls {...sound} title={t.soundSection} />
      </section>
      {testPass && <section className="settings-section">
        <h3>{t.testSection}</h3>
        <TestPass {...testPass} />
      </section>}
    </dialog>
  </>;
}
