import { stageDifficulty } from '../game/stages';
import { StageDifficultyRibbon } from '../components/StageDifficultyRibbon';
import { useState } from 'react';
import { useMessages } from '../i18n/language';
import { SettingsButton, type SettingsProps } from '../components/SettingsButton';

const posterSources = import.meta.glob<string>('../assets/home/*.webp', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const posterBackgrounds: Record<string, string> = {
  bakery: 'linear-gradient(#c4affb, #f6c4d2)',
  berry: 'linear-gradient(#fbbbc3, #f7b8c2)',
  honey: 'linear-gradient(#fece61, #fdd06f)',
  lavender: 'linear-gradient(#cdb5fb, #b796ef)',
  night: 'linear-gradient(#28478f, #9185d0)',
  rose: 'linear-gradient(#fcbfe3, #fdbfe4)',
  shop: 'linear-gradient(#fed9c1, #f8a18a)',
  sky: 'linear-gradient(#5cb2f8, #90b735)',
};
const posters = Object.entries(posterSources).map(([path, src]) => ({
  src,
  background: posterBackgrounds[path.split('/').at(-1)?.replace('.webp', '') ?? ''],
}));

export function StartPage({ stage, onGame, onStages, settings }: {
  stage: number; onGame: () => void; onStages: () => void; settings: SettingsProps;
}) {
  const t = useMessages();
  const [poster] = useState(() => posters[Math.floor(Math.random() * posters.length)]);
  const [diagnostic, setDiagnostic] = useState('default');
  return <main className="start-page" data-diagnostic={diagnostic} style={{ backgroundImage: diagnostic === 'stripes' ? undefined : poster?.background }}>
    <h1 className="sr-only">Sweet Order</h1>
    <img className="start-poster" src={poster?.src} width={800} height={1800} alt="" draggable={false} fetchPriority="high" />
    <select className="pwa-diagnostic" aria-label="iOS PWA 진단" value={diagnostic} onChange={event => setDiagnostic(event.target.value)}>
      <option value="default">진단 · 기본 상태</option>
      <option value="filters">필터 끄기</option>
      <option value="screen-height">화면 높이 보정 끄기</option>
      <option value="viewport">높이를 100dvh로 고정</option>
      <option value="safe-area">상단 safe-area 끄기</option>
      <option value="stripes">줄무늬 배경</option>
    </select>
    <div className="top-actions">
      <SettingsButton {...settings} />
    </div>
    <div className="start-actions">
      <button className="primary-button stage-button" onClick={onGame}><span>Stage {String(stage).padStart(2, '0')}</span><StageDifficultyRibbon difficulty={stageDifficulty(stage)} /></button>
      <button className="secondary-button" onClick={onStages}>{t.stageSelect}</button>
    </div>
  </main>;
}
