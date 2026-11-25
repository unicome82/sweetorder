import { stageDifficulty } from '../game/stages';
import { StageDifficultyRibbon } from '../components/StageDifficultyRibbon';
import { useMessages } from '../i18n/language';
import { SettingsButton, type SettingsProps } from '../components/SettingsButton';

export function StartPage({ stage, onGame, onStages, settings }: {
  stage: number; onGame: () => void; onStages: () => void; settings: SettingsProps;
}) {
  const t = useMessages();
  return <main className="start-page">
    <h1 className="sr-only">Sweet Order</h1>
    <div className="top-actions">
      <SettingsButton {...settings} />
    </div>
    <div className="start-actions">
      <button className="primary-button stage-button" onClick={onGame}><span>Stage {String(stage).padStart(2, '0')}</span><StageDifficultyRibbon difficulty={stageDifficulty(stage)} /></button>
      <button className="secondary-button" onClick={onStages}>{t.stageSelect}</button>
    </div>
  </main>;
}
