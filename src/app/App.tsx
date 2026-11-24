import { useCallback, useEffect, useState } from 'react';
import { LanguageContext, readLanguagePreference, saveLanguagePreference } from '../i18n/language';
import type { MouseEvent } from 'react';
import { playSound, readSoundPreference, saveSoundPreference, setMusicScene, unlockSound } from '../effects/sound';
import { canAffordAttempt, canPlayBonusToday, getCurrentStage } from '../game/session';
import { MAX_HEARTS } from '../game/hearts';
import { isBonusStage, isStageLoaded, loadStage, practiceStage, preloadStage } from '../game/stages';
import { randomBonusDessert } from '../game/stages/bonus';
import { BONUS_AT_STAGE_00_FOR_TESTING } from '../game/constants';
import { NoHeartsDialog } from '../components/NoHeartsDialog';
import { ChargeHeartsDialog } from '../components/ChargeHeartsDialog';
import { useGame } from '../hooks/useGame';
import { hasModePreference, readModePreference, saveModePreference, type PlayMode } from './modePreference';
import { ModeChoiceDialog } from '../components/ModeChoiceDialog';
import type { SettingsProps } from '../components/SettingsButton';
import type { Language } from '../i18n/messages';
import { StartPage } from '../pages/StartPage';
import { GamePage } from '../pages/GamePage';
import { StageSelectPage } from '../pages/StageSelectPage';

export function App() {
  const { session, dispatch } = useGame();
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const [language, setLanguage] = useState(readLanguagePreference);
  const [mode, setMode] = useState(readModePreference);
  const [modeChosen, setModeChosen] = useState(hasModePreference);
  const relaxed = mode === 'relaxed';
  function changeLanguage(next: Language) {
    saveLanguagePreference(next);
    setLanguage(next);
  }
  function changeMode(next: PlayMode) {
    saveModePreference(next);
    setMode(next);
    setModeChosen(true);
  }
  function toggleSound() {
    const enabled = !soundEnabled;
    if (enabled) unlockSound();
    saveSoundPreference(enabled);
    setSoundEnabled(enabled);
    if (enabled) playSound('tap');
  }
  // Every button taps softly unless it plays its own cue (data-sfx="none").
  function onClickCapture(event: MouseEvent) {
    if (!soundEnabled) return;
    unlockSound();
    const button = (event.target as Element).closest?.('button');
    if (button && !button.disabled && button.dataset.sfx !== 'none') playSound('tap');
  }
  const { screen, game, stars } = session;
  const displayedHearts = session.unlimitedHearts ? { ...session.hearts, count: MAX_HEARTS } : session.hearts;
  // Bonus stages have their own track.
  const musicScene = screen !== 'game' ? 'menu' : isBonusStage(game.stageId) ? 'bonus' : 'game';
  useEffect(() => setMusicScene(musicScene), [musicScene]);
  const currentStage = getCurrentStage(stars);
  const [loadingStage, setLoadingStage] = useState<number>();
  // The stage the player couldn't afford, while the out-of-hearts popup is open.
  const [outOfHearts, setOutOfHearts] = useState<number>();
  const closeOutOfHearts = useCallback(() => setOutOfHearts(undefined), []);
  const [chargeOpen, setChargeOpen] = useState(false);
  function openCharge() { setOutOfHearts(undefined); setChargeOpen(true); }
  // Out of hearts, the daily bonus stage can be entered once a day; it leads back to the stage that was wanted.
  function startDailyBonus(nextStageId: number) {
    setOutOfHearts(undefined);
    dispatch({ type: 'START_BONUS', dessert: randomBonusDessert(), nextStageId, relaxed, now: Date.now() });
  }
  // Stage data arrives in 100-stage chunks; fetch the one a START needs before entering it.
  function start(stageId: number) {
    if (BONUS_AT_STAGE_00_FOR_TESTING && stageId === practiceStage.id) {
      dispatch({ type: 'START_BONUS', dessert: randomBonusDessert(), nextStageId: currentStage, relaxed, testing: true });
      return;
    }
    if (!canAffordAttempt(session, stageId)) { setOutOfHearts(stageId); return; }
    if (isStageLoaded(stageId)) { dispatch({ type: 'START', stageId, relaxed }); return; }
    setLoadingStage(stageId);
    loadStage(stageId).then(() => dispatch({ type: 'START', stageId, relaxed }), () => undefined)
      .finally(() => setLoadingStage(previous => previous === stageId ? undefined : previous));
  }
  function next() {
    start(isBonusStage(game.stageId) ? session.bonus?.nextStageId ?? currentStage : game.stageId + 1);
  }
  const settings: SettingsProps = { soundEnabled, onToggleSound: toggleSound, language, onLanguage: changeLanguage, mode, onMode: changeMode };
  // Warm the chunks the player is likely to open next.
  useEffect(() => preloadStage(currentStage), [currentStage]);
  useEffect(() => { if (screen === 'game') preloadStage(game.stageId + 1); }, [screen, game.stageId]);
  return <LanguageContext value={language}><div className="app-shell" lang={language} onPointerUpCapture={soundEnabled ? unlockSound : undefined} onClickCapture={onClickCapture}>
    {screen === 'start'
      ? <StartPage stage={currentStage} settings={settings} onGame={() => start(currentStage)} onStages={() => dispatch({ type: 'STAGES' })} />
      : screen === 'stages'
        ? <StageSelectPage stars={stars} hearts={displayedHearts} onChargeHearts={openCharge} settings={settings} unlockAllStages={session.unlockAllStages} onGame={start} />
        : <GamePage key={game.stageId} settings={settings} state={game} dispatch={action => dispatch({ type: 'GAME', action, now: Date.now() })} onStages={() => dispatch({ type: 'STAGES' })} onNext={next}
          trayClearsOwned={session.trayClears}
          canRestart={() => canAffordAttempt(session, game.stageId)} onOutOfHearts={() => setOutOfHearts(game.stageId)} />
    }
    {screen === 'start' && !modeChosen && <ModeChoiceDialog onChoose={changeMode} />}
    {outOfHearts !== undefined && <NoHeartsDialog hearts={displayedHearts} bonusToday={canPlayBonusToday(session)} onClose={closeOutOfHearts} onCharge={openCharge}
      onBonus={() => startDailyBonus(outOfHearts)} />}
    {chargeOpen && <ChargeHeartsDialog hearts={displayedHearts} onClose={() => setChargeOpen(false)}
      onCharge={amount => { dispatch({ type: 'CHARGE_HEARTS', amount, now: Date.now() }); setChargeOpen(false); }} />}
    {loadingStage !== undefined && <p className="stage-loading" role="status">Loading…</p>}
  </div></LanguageContext>;
}
