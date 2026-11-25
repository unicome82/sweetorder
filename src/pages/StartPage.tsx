import { stageDifficulty } from '../game/stages';
import { StageDifficultyRibbon } from '../components/StageDifficultyRibbon';
import { useEffect, useRef, useState } from 'react';
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
const diagnosticKey = 'sweetorder:pwa-diagnostic';

export function StartPage({ stage, onGame, onStages, settings }: {
  stage: number; onGame: () => void; onStages: () => void; settings: SettingsProps;
}) {
  const t = useMessages();
  const [poster] = useState(() => posters[Math.floor(Math.random() * posters.length)]);
  const [diagnostic, setDiagnostic] = useState(() => {
    try { return localStorage.getItem(diagnosticKey) ?? 'default'; }
    catch { return 'default'; }
  });
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const diagnosticColor = themeColor?.dataset.diagnosticColor;
  const solidBackground = diagnostic === 'solid';
  const changeDiagnostic = (next: string) => {
    const reload = (diagnostic === 'status-bar') !== (next === 'status-bar');
    try { localStorage.setItem(diagnosticKey, next); }
    catch {
      if (reload) {
        window.alert('이 옵션을 적용하려면 브라우저 저장소를 사용할 수 있어야 합니다.');
        return;
      }
    }
    if (reload) window.location.reload();
    else setDiagnostic(next);
  };
  const page = useRef<HTMLElement>(null);
  const stageSelect = useRef<HTMLButtonElement>(null);
  const diagnosticResult = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const color = diagnostic === 'theme-color' ? diagnosticColor : themeColor?.dataset.defaultColor;
    if (themeColor && color) themeColor.content = color;

    const panel = page.current;
    const button = stageSelect.current;
    const result = diagnosticResult.current;
    if (!panel || !button || !result) return;

    const measure = () => {
      const buttonStyle = getComputedStyle(button);
      const blur = buttonStyle.backdropFilter || buttonStyle.getPropertyValue('-webkit-backdrop-filter') || '미지원';
      result.textContent = `페이지 ${panel.offsetHeight}px / 뷰포트 ${window.innerHeight}px · 버튼 ${blur} · 테마 ${themeColor?.content ?? '없음'}`;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [diagnostic, diagnosticColor, themeColor]);

  return <main ref={page} className="start-page" data-diagnostic={diagnostic} style={{
    backgroundColor: solidBackground ? diagnosticColor : undefined,
    backgroundImage: solidBackground || diagnostic === 'stripes' ? undefined : poster?.background,
  }}>
    <h1 className="sr-only">Sweet Order</h1>
    {!solidBackground && <img className="start-poster" src={poster?.src} width={800} height={1800} alt="" draggable={false} fetchPriority="high" />}
    <div className="pwa-diagnostic">
      <select aria-label="iOS PWA 진단" value={diagnostic} onChange={event => changeDiagnostic(event.target.value)}>
        <option value="default">진단 · 기본 상태</option>
        <option value="filters">필터 끄기</option>
        <option value="screen-height">화면 높이 보정 끄기</option>
        <option value="viewport">높이를 100dvh로 고정</option>
        <option value="safe-area">상단 safe-area 끄기</option>
        <option value="stripes">줄무늬 배경</option>
        <option value="status-bar">상태바 뒤 배경 끄기</option>
        <option value="solid">포스터를 단색으로</option>
        <option value="theme-color">테마색만 변경</option>
      </select>
      <output ref={diagnosticResult} />
    </div>
    <div className="top-actions">
      <SettingsButton {...settings} />
    </div>
    <div className="start-actions">
      <button className="primary-button stage-button" onClick={onGame}><span>Stage {String(stage).padStart(2, '0')}</span><StageDifficultyRibbon difficulty={stageDifficulty(stage)} /></button>
      <button ref={stageSelect} className="secondary-button" onClick={onStages}>{t.stageSelect}</button>
    </div>
  </main>;
}
