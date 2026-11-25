import { useCallback, useEffect, useState } from 'react';
import { LanguageContext, readLanguagePreference, saveLanguagePreference } from '../i18n/language';
import type { MouseEvent } from 'react';
import { playSound, readSoundPreference, saveSoundPreference, setMusicScene, unlockSound } from '../effects/sound';
import { addTimeFromPass, canAffordAttempt, canPlayBonusToday, chargeableSpareHearts, getCurrentStage, heartsFastUntil, itemsBeforeStart, peekFromPass, passTrayClears, spareHearts, type ItemChoice } from '../game/session';
import { StartItemsDialog } from '../components/StartItemsDialog';
import { ads } from '../monetization/ads';
import { getStage } from '../game/stages';
import { MAX_HEARTS } from '../game/hearts';
import { isBonusStage, isStageLoaded, loadStage, practiceStage, preloadStage } from '../game/stages';
import { randomBonusDessert } from '../game/stages/bonus';
import { BONUS_AT_STAGE_00_FOR_TESTING, FAKE_MONETIZATION_FOR_TESTING } from '../game/constants';
import { isPassActive } from '../monetization/pass';
import { billing } from '../monetization/billing';
import { FakeAdHost } from '../components/FakeAdHost';
import { NoHeartsDialog } from '../components/NoHeartsDialog';
import { PassOfferDialog } from '../components/PassOfferDialog';
import { ChargeHeartsDialog } from '../components/ChargeHeartsDialog';
import { useGame } from '../hooks/useGame';
import { useNow } from '../hooks/useNow';
import { hasModePreference, readModePreference, saveModePreference, type PlayMode } from './modePreference';
import { ModeChoiceDialog } from '../components/ModeChoiceDialog';
import type { SettingsProps } from '../components/SettingsButton';
import type { Language } from '../i18n/messages';
import { StartPage } from '../pages/StartPage';
import { GamePage } from '../pages/GamePage';
import { StageSelectPage } from '../pages/StageSelectPage';

export function App() {
  const { session, dispatch } = useGame();
  // Pass expiry only needs minute precision; a purchase lands well inside the pass either way.
  const passNow = useNow(60_000);
  const passActive = isPassActive(session.pass, passNow);
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
  const fastUntil = heartsFastUntil(session);
  // Bonus stages have their own track.
  const musicScene = screen !== 'game' ? 'menu' : isBonusStage(game.stageId) ? 'bonus' : 'game';
  useEffect(() => setMusicScene(musicScene), [musicScene]);
  const currentStage = getCurrentStage(stars);
  const [loadingStage, setLoadingStage] = useState<number>();
  // The stage the player couldn't afford, while the out-of-hearts popup is open.
  const [outOfHearts, setOutOfHearts] = useState<number>();
  const closeOutOfHearts = useCallback(() => setOutOfHearts(undefined), []);
  // A rewarded ad gives a heart; the out-of-hearts popup then closes by itself.
  async function watchHeartAd() {
    if (await ads.showRewarded('hearts')) dispatch({ type: 'AD_HEARTS', now: Date.now() });
  }
  const [chargeOpen, setChargeOpen] = useState(false);
  /**
   * Out of hearts for a stage: pass spare hearts are offered to charge first, then the daily bonus stage opens at once
   * (it leads back to the stage that was wanted), and once both are used up a rewarded ad can give a heart.
   */
  function handleOutOfHearts(stageId: number) {
    if (chargeableSpareHearts(session) > 0) setChargeOpen(true);
    else if (canPlayBonusToday(session)) dispatch({ type: 'START_BONUS', dessert: randomBonusDessert(), nextStageId: stageId, relaxed, now: Date.now() });
    else setOutOfHearts(stageId);
  }
  // Items are chosen before each attempt (retries included), when the stage can use one; the last choice is kept.
  const [preStart, setPreStart] = useState<{ stageId: number }>();
  const [itemChoice, setItemChoice] = useState<ItemChoice>({});
  // Every START is a fresh attempt, so the game page starts over even on the same stage.
  const [attempt, setAttempt] = useState(0);
  function begin(stageId: number, items?: ItemChoice, adItems?: ItemChoice) {
    setAttempt(previous => previous + 1);
    dispatch({ type: 'START', stageId, relaxed, items, adItems, now: Date.now() });
  }
  function enter(stageId: number) {
    const available = itemsBeforeStart(stageId, relaxed);
    if (available.peek || available.addTime) setPreStart({ stageId });
    else begin(stageId);
  }
  function startWithItems(choice: ItemChoice, watched: ItemChoice) {
    if (!preStart) return;
    setItemChoice({ peek: choice.peek && !watched.peek, addTime: choice.addTime && !watched.addTime });
    setPreStart(undefined);
    begin(preStart.stageId, choice, watched);
  }
  // Stage data arrives in 100-stage chunks; fetch the one a START needs before entering it.
  function start(stageId: number) {
    if (BONUS_AT_STAGE_00_FOR_TESTING && stageId === practiceStage.id) {
      dispatch({ type: 'START_BONUS', dessert: randomBonusDessert(), nextStageId: currentStage, relaxed, testing: true });
      return;
    }
    if (!canAffordAttempt(session, stageId)) { handleOutOfHearts(stageId); return; }
    if (isStageLoaded(stageId)) { enter(stageId); return; }
    setLoadingStage(stageId);
    loadStage(stageId).then(() => enter(stageId), () => undefined)
      .finally(() => setLoadingStage(previous => previous === stageId ? undefined : previous));
  }
  function next() {
    start(isBonusStage(game.stageId) ? session.bonus?.nextStageId ?? currentStage : game.stageId + 1);
  }
  async function buyPass() {
    if (await billing.purchasePass()) dispatch({ type: 'BUY_PASS', now: Date.now() });
  }
  // The pass offer opens from the popups where it helps; buying closes it and the popup below carries on with the pass.
  const [passOfferOpen, setPassOfferOpen] = useState(false);
  async function buyFromOffer() {
    if (!await billing.purchasePass()) return;
    dispatch({ type: 'BUY_PASS', now: Date.now() });
    setPassOfferOpen(false);
    // Out of hearts: the new spare hearts can be charged straight away.
    if (outOfHearts !== undefined) { setOutOfHearts(undefined); setChargeOpen(true); }
  }
  const showPass = () => setPassOfferOpen(true);
  const testPass = FAKE_MONETIZATION_FOR_TESTING
    ? {
      pass: session.pass, onBuy: () => void buyPass(), onEnd: () => dispatch({ type: 'END_PASS' }),
      onFillHearts: () => dispatch({ type: 'TEST_HEARTS', full: true }), onEmptyHearts: () => dispatch({ type: 'TEST_HEARTS', full: false, now: Date.now() }),
    }
    : undefined;
  const settings: SettingsProps = { soundEnabled, onToggleSound: toggleSound, language, onLanguage: changeLanguage, mode, onMode: changeMode, testPass };
  // Warm the chunks the player is likely to open next.
  useEffect(() => preloadStage(currentStage), [currentStage]);
  useEffect(() => { if (screen === 'game') preloadStage(game.stageId + 1); }, [screen, game.stageId]);
  return <LanguageContext value={language}><div className="app-shell" lang={language} onPointerUpCapture={soundEnabled ? unlockSound : undefined} onClickCapture={onClickCapture}>
    {screen === 'start'
      ? <StartPage stage={currentStage} settings={settings} onGame={() => start(currentStage)} onStages={() => dispatch({ type: 'STAGES' })} />
      : screen === 'stages'
        ? <StageSelectPage stars={stars} hearts={displayedHearts} spareHearts={session.unlimitedHearts ? 0 : spareHearts(session, passNow)} heartsFastUntil={fastUntil} settings={settings} unlockAllStages={session.unlockAllStages} onGame={start} onShowPass={showPass} />
        : <GamePage key={`${game.stageId}:${attempt}`} settings={settings} state={game} dispatch={action => dispatch({ type: 'GAME', action, now: Date.now() })} onStages={() => dispatch({ type: 'STAGES' })} onNext={next}
          trayClearsOwned={session.trayClears + passTrayClears(session.pass, passNow)} legacyAdFree={passActive && session.pass?.expiresAt !== undefined} passActive={passActive} onRetry={() => start(game.stageId)} onShowPass={() => setPassOfferOpen(true)}
          canRestart={() => canAffordAttempt(session, game.stageId)} onOutOfHearts={() => handleOutOfHearts(game.stageId)} />
    }
    {screen === 'start' && !modeChosen && <ModeChoiceDialog onChoose={changeMode} />}
    {outOfHearts !== undefined && <NoHeartsDialog hearts={displayedHearts} fastUntil={fastUntil} onClose={closeOutOfHearts} onWatchAd={() => void watchHeartAd()} onShowPass={showPass} />}
    {chargeOpen && <ChargeHeartsDialog max={chargeableSpareHearts(session)} spare={spareHearts(session)} onClose={() => setChargeOpen(false)}
      onCharge={amount => { dispatch({ type: 'CHARGE_SPARE', amount, now: Date.now() }); setChargeOpen(false); }} />}
    {preStart && <StartItemsDialog pass={passActive ? session.pass : undefined} available={itemsBeforeStart(preStart.stageId, relaxed)}
      peekNeedsAd={!peekFromPass(session.pass, passNow)} addTimeNeedsAd={!addTimeFromPass(session.pass, passNow)}
      dessert={getStage(preStart.stageId).queues.flat().find(token => token.hidden && !token.reward)?.type}
      initial={itemChoice} onStart={startWithItems} onClose={() => setPreStart(undefined)} />}
    {passOfferOpen && <PassOfferDialog onBuy={() => void buyFromOffer()} onClose={() => setPassOfferOpen(false)} />}
    <FakeAdHost />
    {loadingStage !== undefined && <p className="stage-loading" role="status">Loading…</p>}
  </div></LanguageContext>;
}
