import { useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { useMessages } from '../i18n/language';
import { MUSIC_CREDIT, playSound, readVolumes, setVolume, toggleVolumeMute, type VolumeKind } from '../effects/sound';

/** title: shown on the sound switch's row (the settings section heading). */
interface Props { soundEnabled: boolean; onToggleSound: () => void; title?: string }

/** Mute switch plus separate sliders for sound effects and background music. */
export function SoundControls({ soundEnabled, onToggleSound, title }: Props) {
  const t = useMessages();
  const [levels, setLevels] = useState(readVolumes);
  function change(kind: VolumeKind, percent: number) {
    setVolume(kind, percent / 100);
    setLevels(readVolumes());
  }
  function toggleMute(kind: VolumeKind) {
    toggleVolumeMute(kind);
    const next = readVolumes();
    setLevels(next);
    if (kind === 'sfx' && next.sfx > 0) playSound('select');
  }
  const sliders: Array<[VolumeKind, string]> = [['sfx', t.sfxVolume], ['music', t.musicVolume]];
  const mute = <button type="button" data-sfx="none" className="secondary-button sound-mute-button" onClick={onToggleSound} aria-pressed={!soundEnabled}>
    <Icon name={soundEnabled ? 'sound' : 'sound-off'} />{soundEnabled ? t.soundOff : t.soundOn}
  </button>;
  return <div className="sound-controls">
    {title ? <div className="settings-section-head"><h3>{title}</h3>{mute}</div> : mute}
    {sliders.map(([kind, label]) => <div key={kind} className="sound-slider">
      <label htmlFor={`volume-${kind}`}>{label}</label>
      <input id={`volume-${kind}`} type="range" min={0} max={100} step={5} value={Math.round(levels[kind] * 100)} disabled={!soundEnabled}
        style={{ '--fill': `${levels[kind] * 100}%` } as CSSProperties}
        onChange={event => change(kind, Number(event.currentTarget.value))}
        onPointerUp={() => { if (kind === 'sfx') playSound('select'); }}
        onKeyUp={() => { if (kind === 'sfx') playSound('select'); }} />
      <button type="button" data-sfx="none" className="icon-button sound-channel-mute" disabled={!soundEnabled}
        onClick={() => toggleMute(kind)} aria-pressed={levels[kind] === 0} aria-label={t.muteChannel(label)}>
        <Icon name={levels[kind] > 0 ? 'sound' : 'sound-off'} />
      </button>
    </div>)}
    <p className="sound-credit" lang="en">{t.musicCredit} {MUSIC_CREDIT}</p>
  </div>;
}
