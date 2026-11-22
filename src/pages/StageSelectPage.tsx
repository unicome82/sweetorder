import { useLayoutEffect, useRef, useState } from 'react';
import rewardStar from '../assets/game/reward-star.webp';
import { StageDifficultyRibbon } from '../components/StageDifficultyRibbon';
import { Icon } from '../components/Icon';
import { practiceStage, STAGE_COUNT, stageDifficulty } from '../game/stages';
import { unlockedThrough } from '../game/session';
import { useMessages } from '../i18n/language';
import { SettingsButton, type SettingsProps } from '../components/SettingsButton';
import { HeartCounter } from '../components/HeartCounter';
import { BONUS_AT_STAGE_00_FOR_TESTING, FEATURE_PREVIEW_FOR_TESTING, FEATURE_PREVIEW_STAGES, isFeaturePreviewStage } from '../game/constants';
import type { Hearts } from '../game/hearts';

const columns = 3;
const rowHeight = 146;
const overscan = 2;
// Locked stages listed past the last open one, as a short preview of what comes next.
const LOCKED_PREVIEW = 12;
// The jump buttons move between stages 1, 501, 1001, … so long lists stay quick to cross.
const JUMP_SIZE = 500;
const blockStart = (block: number) => block * JUMP_SIZE + 1;
const optionId = (index: number) => index === 0 ? practiceStage.id : index;

export function StageSelectPage({ onGame, onChargeHearts, stars, hearts, unlockAllStages, settings }: { onGame: (id: number) => void; onChargeHearts: () => void; stars: Record<number, number>; hearts: Hearts; unlockAllStages: boolean; settings: SettingsProps }) {
  const relaxed = settings.mode === 'relaxed';
  const t = useMessages();
  const openThrough = unlockedThrough(stars, unlockAllStages);
  const currentStage = unlockedThrough(stars);
  // Practice first, then stage ids up to the preview; tiles need only the id, so no stage data loads here.
  // Playtest stages stay in the list even when they lie beyond the preview.
  const previewEnd = FEATURE_PREVIEW_FOR_TESTING ? Math.max(0, ...FEATURE_PREVIEW_STAGES) : 0;
  const optionCount = Math.min(STAGE_COUNT, Math.max(openThrough + LOCKED_PREVIEW, previewEnd)) + 1;
  const rowCount = Math.ceil(optionCount / columns);
  const currentRow = Math.floor(currentStage / columns);
  const scrollArea = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: currentRow * rowHeight, height: 0 });
  const firstRow = Math.min(rowCount - 1, Math.max(0, Math.floor(viewport.top / rowHeight) - overscan));
  const lastRow = Math.max(firstRow + 1, Math.min(rowCount, Math.ceil((viewport.top + viewport.height) / rowHeight) + overscan));

  useLayoutEffect(() => {
    const element = scrollArea.current;
    if (!element) return;
    const measure = () => setViewport({
      top: element.scrollTop,
      height: element.clientHeight,
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const endPadding = Math.max(0, (viewport.height - rowHeight) / 2);
  // Option indexes equal stage ids (practice is 0), so the top row tells which stages are in view.
  const topRow = Math.floor(viewport.top / rowHeight);
  const firstShown = topRow * columns;
  const upTarget = firstShown > 1 ? blockStart(Math.ceil((firstShown - 1) / JUMP_SIZE) - 1) : undefined;
  const downCandidate = blockStart(Math.floor((firstShown + columns - 2) / JUMP_SIZE) + 1);
  const downTarget = downCandidate < optionCount && (rowCount - topRow) * rowHeight > viewport.height ? downCandidate : undefined;
  function jumpTo(stageId: number) {
    if (scrollArea.current) scrollArea.current.scrollTop = Math.floor(stageId / columns) * rowHeight;
  }
  useLayoutEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = currentRow * rowHeight - endPadding;
  }, [currentRow, endPadding]);

  return <main className="stage-page">
    <nav className="stage-navigation" aria-label={t.stageMenu}>
      <HeartCounter hearts={hearts} onCharge={onChargeHearts} />
      <SettingsButton {...settings} />
    </nav>
    <div className="stage-hero" aria-hidden="true" />
    <div className="stage-list-frame" data-scrolled={viewport.top > 0}>
      <div ref={scrollArea} className="stage-scroll" tabIndex={0} aria-label={t.stageList} role="region"
        onScroll={event => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
        <div className="stage-list"
          style={{ gridAutoRows: rowHeight, paddingTop: firstRow * rowHeight, paddingBottom: (rowCount - lastRow) * rowHeight + endPadding }}>
          {Array.from({ length: Math.min(optionCount, lastRow * columns) - firstRow * columns }, (_, offset) => {
            const id = optionId(firstRow * columns + offset);
            const stage = { id, difficulty: id === practiceStage.id ? practiceStage.difficulty : stageDifficulty(id) };
            const practice = id === practiceStage.id;
            const unlocked = practice || id <= openThrough || isFeaturePreviewStage(id);
            const score = stars[stage.id] ?? 0;
            const cleared = stars[stage.id] !== undefined;
            const current = stage.id === currentStage;
            // Relaxed mode marks clears with a "Clear" label and leaves other open stages as just the number;
            // timed mode shows the best stars from timed play.
            const plain = relaxed && unlocked && !practice && !cleared;
            const description = !unlocked ? t.locked : relaxed ? (cleared ? t.cleared : t.available) : score ? t.starsCount(score) : t.available;
            return <button type="button" key={stage.id} className={`stage-option${current ? ' stage-option--next' : ''}${plain ? ' stage-option--plain' : ''}`}
              aria-current={current ? 'step' : undefined} aria-label={practice ? (BONUS_AT_STAGE_00_FOR_TESTING ? t.bonusTestLabel : t.practiceLabel) : t.stageLabel(stage.id, stage.difficulty ?? '', description)}
              onClick={() => onGame(stage.id)} disabled={!unlocked}>
              <span className="stage-index" lang="en">
                <span className="stage-index-label">Stage</span>
                <span className="stage-index-number">{String(stage.id).padStart(2, '0')}</span>
              </span>
              <StageDifficultyRibbon difficulty={stage.difficulty} />
              {practice ? <span className="stage-practice-label">{BONUS_AT_STAGE_00_FOR_TESTING ? t.bonusTest : t.practice}</span>
                : plain ? null
                : unlocked && relaxed ? <span className="stage-clear-label" lang="en" aria-hidden="true">Clear</span>
                : unlocked ? <span className="stage-stars" aria-hidden="true">
                {[0, 1, 2].map(index => <span key={index} className={index < score ? undefined : 'star--unearned'}><img src={rewardStar} alt="" draggable={false} /></span>)}
              </span> : <span className="stage-lock"><Icon name="lock" /></span>}
            </button>;
          })}
        </div>
      </div>
      {optionCount > JUMP_SIZE && <div className="stage-jump">
        <button type="button" className="stage-jump-button" disabled={upTarget === undefined}
          aria-label={upTarget === undefined ? t.jumpUp : t.jumpToStage(upTarget)} onClick={() => upTarget && jumpTo(upTarget)}>
          <span className="stage-jump-arrow stage-jump-arrow--up" aria-hidden="true" /><span lang="en">{upTarget ?? '—'}</span>
        </button>
        <button type="button" className="stage-jump-button" disabled={downTarget === undefined}
          aria-label={downTarget === undefined ? t.jumpDown : t.jumpToStage(downTarget)} onClick={() => downTarget && jumpTo(downTarget)}>
          <span className="stage-jump-arrow stage-jump-arrow--down" aria-hidden="true" /><span lang="en">{downTarget ?? '—'}</span>
        </button>
      </div>}
    </div>
  </main>;
}
