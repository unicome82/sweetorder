import { Icon } from '../components/Icon';
import popupRibbon from '../assets/game/popup-ribbon.webp';
import popupCat from '../assets/game/popup-cat.webp';
import clearDesserts from '../assets/game/clear-desserts.webp';
import rewardStar from '../assets/game/reward-star.webp';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { CUSTOMER_GOODBYE_MS } from '../effects/customerTiming';
import { GameHeader } from '../components/GameHeader';
import { OrderBoard } from '../components/OrderBoard';
import { DonutTray } from '../components/DonutTray';
import { DonutQueue } from '../components/DonutQueue';
import { getStage, isBonusStage, practiceStage, STAGE_COUNT } from '../game/stages';
import { HeartIcon } from '../components/HeartIcon';
import { canQuickOrder, getQueueHintColumns, getReadyTrayPickupOrders, getStars, selectDonut, clearTray, matchTray, pickupTray, quickOrder } from '../game/engine';
import { ItemButtonIcon, QuickOrderIcon, TrayClearIcon } from '../components/ItemIcons';
import type { DonutType, GameState, RewardKind } from '../game/types';
import type { GameAction } from '../game/reducer';
import { clockPhase, getGameTimeLimit, losesOnTimeUp, type ClockPhase } from '../game/stageTime';
import { LiveStageClock } from '../components/StageClock';
import { playSound, setMusicMood } from '../effects/sound';
import { haptic } from '../effects/haptics';
import { useMessages } from '../i18n/language';
import { createEffects } from '../effects/turnEffects';
import { SettingsButton, type SettingsProps } from '../components/SettingsButton';
import { ads, type RewardedPlacement } from '../monetization/ads';
import { PASS_TIME_BONUS_MS } from '../monetization/pass';
import { SIDEWAYS_PHONE } from '../components/RotateNotice';

// Keep the standard pickup cadence independent of visual effect duration.
const TRAY_READY_DELAY = 235;
const PICKUP_INTERVAL = 100;
// Every stage but practice opens with its title in the middle; the clock starts once it has gone.
const INTRO_MS = 1800;
// Items chosen before the start play out one after another once the title has gone, with the clock held:
// "+5s" pops in the middle on the intro layer, then after a short pause peek's "?" blink and
// turn into desserts (DonutQueue's CSS animation lasts PEEK_REVEAL_MS and starts at --peek-delay).
const PEEK_REVEAL_MS = 1300;
const TIME_BONUS_POP_MS = 1200;
const PEEK_AFTER_TIME_BONUS_MS = 500;

interface Delivery { orderId: string; type: DonutType }
/** A reward icon floating up from the queue column it was picked from (viewport coordinates). */
interface RewardPop { id: number; reward: RewardKind; x: number; y: number }
const POP_MS = 1000;
/** How long "Time's Up!" shows over the board before the result. */
const TIME_UP_MS = 1100;

interface Props {
  settings: SettingsProps; state: GameState; dispatch: (action: GameAction) => void; onStages: () => void; onNext: () => void;
  /** Whether a heart is available for another attempt; when not, onOutOfHearts runs instead of the restart. */
  canRestart: () => boolean; onOutOfHearts: () => void;
  /** The player's owned tray clears, shown on the tray-clear badges. */
  trayClearsOwned: number;
  /** Pass holders clear the tray without an ad and without using owned clears. */
  passActive: boolean;
  legacyAdFree: boolean;
  /** Offers the pass; the tray-full popup links to it while a tray clear costs an ad. */
  onShowPass: () => void;
  /** A campaign retry starts the stage afresh through the app, so the pre-start item popup can come first. */
  onRetry: () => void;
}
export function GamePage({ state, dispatch, onStages, onNext, settings, canRestart, onOutOfHearts, trayClearsOwned, legacyAdFree, passActive, onRetry, onShowPass }: Props) {
  const t = useMessages();
  const { soundEnabled } = settings;
  // Settings opened mid-play pause the game behind them and resume it when closed.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pausedForSettings = useRef(false);
  // A rewarded ad on screen pauses a running clock like Settings does, without the pause popup.
  const [adPlaying, setAdPlaying] = useState(false);
  const root = useRef<HTMLElement>(null);
  const latest = useRef(state);
  const matchTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const deferredMatches = useRef<string[]>([]);
  useLayoutEffect(() => { latest.current = state; }, [state]);
  const activeEffects = useRef(new Set<ReturnType<typeof createEffects>>());
  const mounted = useRef(true);
  const [readyOrders, setReadyOrders] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const timeLimit = getGameTimeLimit(state, getStage(state.stageId));
  const hasIntro = state.stageId !== practiceStage.id;
  const timeBonusMs = hasIntro && state.timeBonusUsed ? TIME_BONUS_POP_MS : 0;
  const peekPauseMs = timeBonusMs ? PEEK_AFTER_TIME_BONUS_MS : 0;
  const peekDelayMs = INTRO_MS + timeBonusMs + peekPauseMs;
  const peekMs = hasIntro && state.peeked ? peekPauseMs + PEEK_REVEAL_MS : 0;
  const introMs = hasIntro ? INTRO_MS + peekMs + timeBonusMs : 0;
  const [introRound, setIntroRound] = useState<number | null>(hasIntro ? 0 : null);
  const showIntro = introRound === round;
  // +5 seconds may take the clock past the stage's limit, by those 5 seconds at most.
  const clockMax = (game: GameState) => timeLimit + (game.timeBonusUsed ? PASS_TIME_BONUS_MS : 0);
  const currentClockMax = clockMax(state);
  // Chosen before the start, +5 seconds is on the clock from the first moment.
  const [deadline, setDeadline] = useState(() => performance.now() + currentClockMax + introMs);
  // The clock shows the stage's own limit until "+5s" pops, then the extra 5 seconds join it.
  const [timeBonusAt] = useState(() => performance.now() + INTRO_MS);
  const [pausedTimeMs, setPausedTimeMs] = useState<number>();
  // The clock ticks inside LiveStageClock; the page only hears about stars, the last ten seconds and 0:00.
  const [phase, setPhase] = useState<ClockPhase>(() => clockPhase(currentClockMax, timeLimit));
  const timerRunning = timeLimit > 0 && state.status === 'playing';
  const showClock = timerRunning || (timeLimit > 0 && (state.status === 'blocked' || state.status === 'paused'));
  // The clock stops at 0:00. Campaign stages then lose once the desserts already placed have been served;
  // practice and bonus stages play on, and a clear from then on earns one star.
  const nextPickupAt = useRef(new Map<string, number>());
  const onOrderReady = useCallback((id: string) => {
    setReadyOrders(previous => previous.includes(id) ? previous : [...previous, id]);
  }, []);
  const pickup = useEffectEvent(() => {
    const now = performance.now();
    const eligibleOrders = readyOrders.filter(id => (nextPickupAt.current.get(id) ?? 0) <= now);
    act({ type: 'PICKUP_TRAY', readyOrders: eligibleOrders, parallel: true });
  });
  useEffect(() => {
    if (state.status !== 'playing') return;
    const candidates = getReadyTrayPickupOrders(state, readyOrders);
    if (!candidates.length) return;
    const nextTime = Math.min(...candidates.map(id => nextPickupAt.current.get(id) ?? 0));
    let timer: ReturnType<typeof setTimeout>;
    const runPickup = () => {
      const remaining = Math.ceil(nextTime - performance.now());
      if (remaining > 0) {
        timer = setTimeout(runPickup, remaining);
        return;
      }
      pickup();
    };
    timer = setTimeout(runPickup, Math.max(0, Math.ceil(nextTime - performance.now())));
    return () => clearTimeout(timer);
  }, [state, readyOrders]);
  const [pendingDeliveries, setPendingDeliveries] = useState<Delivery[]>([]);
  const [rewardPops, setRewardPops] = useState<RewardPop[]>([]);
  const popId = useRef(0);
  function showPop(add: (id: number) => void, remove: (id: number) => void) {
    const id = popId.current += 1;
    add(id);
    const timer = setTimeout(() => { matchTimers.current.delete(timer); if (mounted.current) remove(id); }, POP_MS);
    matchTimers.current.add(timer);
  }
  const [returning, setReturning] = useState<ReadonlySet<string>>(new Set());
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    mounted.current = true;
    const active = activeEffects.current;
    const timers = matchTimers.current;
    return () => { mounted.current = false; for (const effect of active) effect.cleanup(); active.clear(); for (const timer of timers) clearTimeout(timer); timers.clear(); };
  }, []);
  function act(action: GameAction) {
    if (action.type === 'RESTART' && !canRestart()) { onOutOfHearts(); return; }
    if (action.type === 'RESTART') {
      for (const timer of matchTimers.current) clearTimeout(timer);
      matchTimers.current.clear();
      for (const effect of activeEffects.current) effect.cleanup();
      activeEffects.current.clear();
      setInFlight(new Set());
      setReturning(new Set());
      setPendingDeliveries([]);
      setRewardPops([]);
      setReadyOrders([]);
      setRound(previous => previous + 1);
      setDeadline(performance.now() + timeLimit + introMs);
      setPhase(clockPhase(timeLimit, timeLimit));
      setIntroRound(hasIntro ? round + 1 : null);
      setPausedTimeMs(undefined);
      nextPickupAt.current.clear();
      deferredMatches.current = [];
    }
    const current = latest.current;
    const now = performance.now();
    const remaining = timeLimit > 0
      ? (current.status === 'blocked' || current.status === 'paused' ? pausedTimeMs : undefined) ?? Math.min(clockMax(current), Math.max(0, deadline - now))
      : undefined;
    if (action.type === 'TRAY_READY' && current.status === 'paused') {
      deferredMatches.current.push(action.donutId);
      return;
    }
    if (action.type === 'PAUSE') {
      if (current.status !== 'playing') return;
      setPausedTimeMs(remaining);
      if (soundEnabled) playSound('pause');
      dispatch(action);
      return;
    }
    if (action.type === 'RESUME') {
      if (current.status !== 'paused') return;
      if (soundEnabled) playSound('resume');
      if (remaining !== undefined) {
        setDeadline(now + remaining);
      }
      setPausedTimeMs(undefined);
      const deferred = deferredMatches.current;
      deferredMatches.current = [];
      flushSync(() => dispatch(action));
      for (const donutId of deferred) act({ type: 'TRAY_READY', donutId });
      return;
    }
    const currentStage = getStage(current.stageId);
    const committedAction: GameAction = action.type === 'SELECT_DONUT' ? { ...action, type: 'QUEUE_DONUT' } : action;
    const result = action.type === 'SELECT_DONUT'
      ? selectDonut(current, currentStage, action.queueIndex, action.expectedDonutId, true)
      : action.type === 'TRAY_READY' ? matchTray(current, currentStage, action.donutId, true)
      : action.type === 'PICKUP_TRAY' ? pickupTray(current, currentStage, action.readyOrders, action.parallel)
      : action.type === 'CLEAR_TRAY' ? clearTray(current, currentStage)
      : action.type === 'QUICK_ORDER' ? quickOrder(current, currentStage, action.adWatched) : null;
    if (!result) { dispatch(action); return; }
    if (result.state === current || !root.current) return;
    if (action.type === 'CLEAR_TRAY') {
      haptic('select');
      if (soundEnabled) playSound('clearTray');
    }
    if (action.type === 'QUICK_ORDER') {
      haptic('order');
      if (soundEnabled) playSound('reward');
    }
    if (result.state.status === 'blocked' && current.status !== 'blocked') {
      setPausedTimeMs(remaining);
    }
    if (action.type === 'TRAY_READY') {
      dispatch({ ...action, remainingTimeMs: remaining });
      return;
    }
    if (action.type === 'PICKUP_TRAY') {
      const unlockTime = performance.now() + PICKUP_INTERVAL;
      for (const event of result.events) {
        if (event.type === 'consumed') nextPickupAt.current.set(event.orderId, unlockTime);
        if (event.type === 'orderCompleted') nextPickupAt.current.delete(event.orderId);
      }
    }
    for (const event of result.events) {
      if (event.type !== 'rewardCollected') continue;
      const column = root.current.querySelector(`[data-queue-index="${event.queueIndex}"]`)?.getBoundingClientRect();
      const x = column ? column.left + column.width / 2 : window.innerWidth / 2;
      const y = column ? column.top : window.innerHeight / 2;
      haptic('order');
      if (soundEnabled) playSound('reward');
      showPop(id => setRewardPops(previous => [...previous, { id, reward: event.reward, x, y }]), id => setRewardPops(previous => previous.filter(pop => pop.id !== id)));
    }
    const effects = createEffects();
    activeEffects.current.add(effects);
    const moved = result.events.find(event => event.type === 'moved');
    const deliveries = result.events.flatMap(event => {
      if (event.type !== 'consumed') return [];
      // A quick order also serves desserts straight from the queues.
      const token = current.tray.find(donut => donut.id === event.donutId)
        ?? current.queues.flat().find(donut => donut.id === event.donutId);
      return token ? [{ orderId: event.orderId, type: token.type }] : [];
    });
    const animateDelivery = document.visibilityState === 'visible' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealDeliveries = (orderId?: string) => {
      if (!deliveries.length) return;
      setPendingDeliveries(previous => previous.filter(delivery =>
        !deliveries.includes(delivery) || (orderId !== undefined && delivery.orderId !== orderId)));
    };
    // Capture all geometry before the DOM changes, but commit the action immediately.
    const returned = result.events.flatMap(event => event.type === 'returned' ? [event.donutId] : []);
    const completed = new Set(result.events.flatMap(event => event.type === 'orderCompleted' ? [event.orderId] : []));
    const feedback = effects.play(root.current, current, result.events, orderId => {
      flushSync(() => revealDeliveries(orderId));
      const orderDone = completed.delete(orderId);
      if (orderDone) haptic('order');
      if (soundEnabled) playSound(orderDone ? 'order' : 'delivery');
    });
    flushSync(() => {
      if ((action.type === 'CLEAR_TRAY' || action.type === 'QUICK_ORDER') && remaining !== undefined) {
        setDeadline(now + remaining);
        setPausedTimeMs(undefined);
      }
      if (animateDelivery && returned.length) setReturning(new Set(returned));
      if (animateDelivery && deliveries.length) setPendingDeliveries(previous => [...previous, ...deliveries]);
      if (moved && result.state.tray.some(token => token.id === moved.donutId)) {
        setInFlight(previous => new Set([...previous, moved.donutId]));
      }
      dispatch({ ...committedAction, remainingTimeMs: remaining });
    });
    if (moved) haptic('select');
    if (soundEnabled && moved) playSound('select');
    if (moved) {
      const timer = setTimeout(() => {
        matchTimers.current.delete(timer);
        if (mounted.current && latest.current.stageId === current.stageId) act({ type: 'TRAY_READY', donutId: moved.donutId });
      }, TRAY_READY_DELAY);
      matchTimers.current.add(timer);
    }
    void feedback.catch(() => undefined).finally(() => {
      if (!activeEffects.current.delete(effects)) return;
      if (mounted.current && latest.current.stageId === current.stageId) {
        revealDeliveries();
        if (returned.length) flushSync(() => setReturning(new Set()));
        if (moved) flushSync(() => setInFlight(previous => {
          const next = new Set(previous);
          next.delete(moved.donutId);
          return next;
        }));
      }
      effects.cleanup();
    });
  }

  const trayDialog = useRef<HTMLDialogElement>(null);
  const pauseDialog = useRef<HTMLDialogElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const { status } = state;
  const playing = status === 'playing';
  useLayoutEffect(() => {
    const dialog = trayDialog.current;
    if (!dialog) return;
    if (status === 'blocked' && !dialog.open) dialog.showModal();
    else if (status !== 'blocked' && dialog.open) dialog.close();
    const pause = pauseDialog.current;
    if (!pause) return;
    const showPause = status === 'paused' && !settingsOpen && !adPlaying;
    if (showPause && !pause.open) pause.showModal();
    else if (!showPause && pause.open) pause.close();
  }, [status, settingsOpen, adPlaying]);
  const showGoodbye = status === 'clear';
  const resultTitles = {
    ready: t.tryAgain,
    paused: t.tryAgain,
    clear: 'Stage Clear!',
    blocked: state.blockedReason === 'stuck' ? t.noMoves : t.trayFull,
    gameover: state.failReason === 'time' ? t.timeUp : state.trayClearsLeft > 0 ? t.tryAgain : state.blockedReason === 'stuck' ? t.noMoves : t.trayFull,
  };
  const failed = status === 'gameover';
  // Practice keeps its own single tray clear; elsewhere the badges show the owned pool.
  const practice = state.stageId === practiceStage.id;
  const clearsOwned = practice ? state.trayClearsLeft : trayClearsOwned;
  // With no owned clears left (and no pass), each clear is paid for with a rewarded ad.
  const clearNeedsAd = !practice && !legacyAdFree && trayClearsOwned <= 0;
  const actAfterAd = useRef(act);
  const adInProgress = useRef(false);
  useLayoutEffect(() => { actAfterAd.current = act; });
  /** Shows a rewarded ad with the clock paused, then applies the action if it was watched to the end. */
  async function actAfterRewardedAd(placement: RewardedPlacement, action: GameAction) {
    if (adInProgress.current) return;
    adInProgress.current = true;
    const pauseForAd = latest.current.status === 'playing' && timeLimit > 0;
    setAdPlaying(true);
    if (pauseForAd) act({ type: 'PAUSE' });
    let watched = false;
    try {
      watched = await ads.showRewarded(placement);
    } finally {
      adInProgress.current = false;
      if (mounted.current) {
        setAdPlaying(false);
        if (pauseForAd) actAfterAd.current({ type: 'RESUME' });
      }
    }
    if (watched && mounted.current) actAfterAd.current(action);
  }
  function requestTrayClear() {
    if (clearNeedsAd) void actAfterRewardedAd('trayClear', { type: 'CLEAR_TRAY' });
    else act({ type: 'CLEAR_TRAY' });
  }
  // Practice has no quick order.
  const quickOrders = practice ? undefined : (state.quickOrders ?? 0) - (passActive ? 0 : state.passQuickOrders ?? 0);
  const quickNeedsAd = !!state.quickOrderAds && quickOrders === 0;
  // Stable handlers for the memoized tray, always running the latest request functions.
  const trayActions = useRef({ clear: requestTrayClear, quick: () => {} });
  const onTrayClear = useCallback(() => trayActions.current.clear(), []);
  const onQuickOrder = useCallback(() => trayActions.current.quick(), []);
  const requestQuickOrder = () => {
    if (quickNeedsAd) void actAfterRewardedAd('quickOrder', { type: 'QUICK_ORDER', adWatched: true });
    else act({ type: 'QUICK_ORDER' });
  };
  useLayoutEffect(() => { trayActions.current = { clear: requestTrayClear, quick: requestQuickOrder }; });
  // Orders as shown: desserts still flying to a customer count as not yet delivered. Memoized so the clock's
  // ticks don't hand OrderBoard a new array (it measures and snapshots its cards whenever the orders change).
  const shownOrders = useMemo(() => pendingDeliveries.length ? state.orders.map(order => {
    if (!order) return null;
    const remaining = { ...order.remaining };
    for (const delivery of pendingDeliveries) {
      if (delivery.orderId === order.definitionId) remaining[delivery.type] = (remaining[delivery.type] ?? 0) + 1;
    }
    return { ...order, remaining };
  }) : state.orders, [state.orders, pendingDeliveries]);
  const boardVisible = playing || status === 'blocked' || status === 'paused';
  const [presentedResult, setPresentedResult] = useState<GameState | null>(null);
  const waitingForGoodbye = showGoodbye && presentedResult !== state;
  // Lost on time: "Time's Up!" shows over the board for a moment before the result.
  const waitingForTimeUp = status === 'gameover' && state.failReason === 'time' && presentedResult !== state;
  const showResult = !boardVisible && !waitingForGoodbye && !waitingForTimeUp;
  // Leaving the app (home screen, another tab, screen lock) pauses a timed game so the clock can't run out unseen.
  const pauseWhenHidden = useEffectEvent(() => {
    if (document.visibilityState === 'hidden' && timeLimit > 0 && latest.current.status === 'playing') act({ type: 'PAUSE' });
  });
  // Turning a phone sideways covers the game with the rotate notice, so a timed game pauses too.
  const pauseWhenSideways = useEffectEvent(() => {
    if (timeLimit > 0 && latest.current.status === 'playing') act({ type: 'PAUSE' });
  });
  useEffect(() => {
    const query = window.matchMedia(SIDEWAYS_PHONE);
    if (query.matches) pauseWhenSideways();
    const onChange = () => { if (query.matches) pauseWhenSideways(); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const onHide = () => pauseWhenHidden();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
  const playTrayFullSound = useEffectEvent(() => {
    haptic('blocked');
    if (soundEnabled) playSound('blocked');
  });
  useEffect(() => {
    if (status === 'blocked') playTrayFullSound();
  }, [status]);
  const resultWasShown = useRef(false);
  useEffect(() => {
    const newlyShown = showResult && !resultWasShown.current;
    resultWasShown.current = showResult;
    if (!newlyShown) return;
    if (status === 'clear') haptic('clear');
    else if (status === 'gameover') haptic('failed');
    if (!soundEnabled) return;
    if (status === 'clear') playSound('clear');
    else if (status === 'gameover') playSound('failed');
  }, [showResult, soundEnabled, status]);
  const stars = status === 'clear' ? getStars(state) : 0;
  const stage = getStage(state.stageId);
  const trayFull = state.tray.length >= state.trayCapacity;
  // Out of time: no more taps or items, but desserts already on their way are still served before the loss.
  const timeUp = timeLimit > 0 && losesOnTimeUp(state.stageId) && phase.out && (playing || status === 'paused');
  const queueDisabled = !playing || waitingForGoodbye || returning.size > 0 || showIntro || timeUp;
  const timeUpSettled = timeUp && playing && !state.pendingMatchIds?.length && inFlight.size === 0 && returning.size === 0
    && pendingDeliveries.length === 0 && !getReadyTrayPickupOrders(state, state.orders.flatMap(order => order ? [order.definitionId] : [])).length;
  const loseOnTime = useEffectEvent(() => act({ type: 'TIME_UP' }));
  useEffect(() => { if (timeUpSettled) loseOnTime(); }, [timeUpSettled]);
  const canShowHint = !queueDisabled && !trayFull && inFlight.size === 0 && pendingDeliveries.length === 0;
  const hintColumns = useMemo(() => canShowHint ? getQueueHintColumns(state, readyOrders) : [],
    [canShowHint, state, readyOrders]);
  function rejectSelection(element: HTMLElement) {
    haptic('denied');
    if (soundEnabled) playSound('denied');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const shake = [{ translate: '0' }, { translate: '-3px' }, { translate: '3px' }, { translate: '-2px' }, { translate: '0' }];
    const target = trayFull ? root.current?.querySelector('.tray-section') ?? element : element;
    target.animate(shake, { duration: 220, easing: 'ease-out' });
  }
  const lastStage = state.stageId === STAGE_COUNT;
  const bonus = isBonusStage(state.stageId);
  // Practice and bonus stages restart in place; campaign retries go back through the start and its item popup.
  function retry() {
    if (practice || bonus) act({ type: 'RESTART' });
    else onRetry();
  }
  // Every stage opens with a chime (practice excepted); bonus stages get a grander one.
  const playStartSound = useEffectEvent(() => {
    if (!soundEnabled || !hasIntro) return;
    playSound(bonus ? 'bonusStart' : 'stageStart');
  });
  useEffect(() => { playStartSound(); }, [round]);
  useEffect(() => {
    if (!showIntro) return;
    const timer = setTimeout(() => setIntroRound(null), introMs);
    return () => clearTimeout(timer);
  }, [showIntro, introMs]);
  useEffect(() => {
    if (!showGoodbye) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setPresentedResult(state), reduceMotion ? 0 : CUSTOMER_GOODBYE_MS);
    return () => clearTimeout(timer);
  }, [showGoodbye, state]);
  useEffect(() => {
    if (!waitingForTimeUp) return;
    haptic('blocked');
    if (soundEnabled) playSound('tickUrgent');
    const timer = setTimeout(() => setPresentedResult(state), TIME_UP_MS);
    return () => clearTimeout(timer);
  }, [waitingForTimeUp, state, soundEnabled]);
  useEffect(() => {
    if (showResult) resultHeading.current?.focus();
  }, [showResult, status]);
  // Red edge from one star left; in the last 10 seconds it shows and pulses whatever the stars.
  const timed = playing && !waitingForGoodbye && timeLimit > 0;
  const danger = timed && phase.stars === 1;
  const urgent = timed && phase.second > 0;
  // Tension cues: a falling chime when a star is lost, clock ticks through the last ten seconds.
  const timeStars = timeLimit > 0 ? phase.stars : 0;
  const previousTimeStars = useRef(timeStars);
  const lastTickSecond = useRef<number>(undefined);
  useEffect(() => {
    const lostStar = timeStars < previousTimeStars.current;
    previousTimeStars.current = timeStars;
    if (!timed) { lastTickSecond.current = undefined; return; }
    if (lostStar && timeStars > 0) {
      if (soundEnabled) playSound('starLost');
      return;
    }
    // The 10-second practice stage would tick throughout, so ticks start only on longer stages.
    const { second } = phase;
    if (timeLimit < 30_000 || !second) return;
    if (lastTickSecond.current === undefined) { lastTickSecond.current = second; return; }
    if (second === lastTickSecond.current) return;
    lastTickSecond.current = second;
    if (soundEnabled) playSound(second <= 3 ? 'tickUrgent' : 'tick');
  }, [phase, soundEnabled, timeLimit, timeStars, timed]);
  useEffect(() => {
    setMusicMood(status === 'paused' || status === 'blocked' || showResult ? 'muted' : urgent ? 'urgent' : 'normal');
  }, [showResult, status, urgent]);
  useEffect(() => () => setMusicMood('normal'), []);
  return <main className={`game-page game-status--${waitingForGoodbye || waitingForTimeUp || status === 'paused' ? 'playing' : status}${danger ? ' game-page--danger' : ''}${urgent ? ' game-page--urgent' : ''}`} ref={root} style={{ '--peek-delay': `${peekDelayMs}ms` } as CSSProperties}>
    {!showResult && <GameHeader stage={state.stageId} title={bonus ? 'Bonus Stage' : undefined} onPause={() => act({ type: 'PAUSE' })} canPause={playing && !waitingForGoodbye && !showIntro && !timeUp}
      settings={<SettingsButton {...settings} mode={state.relaxed ? 'relaxed' : 'timed'} inGame className="header-settings-button"
        onOpen={() => {
          setSettingsOpen(true);
          pausedForSettings.current = latest.current.status === 'playing';
          if (pausedForSettings.current) act({ type: 'PAUSE' });
        }}
        onClose={() => {
          setSettingsOpen(false);
          if (pausedForSettings.current) act({ type: 'RESUME' });
          pausedForSettings.current = false;
        }} />} />}
    {(showClock || (timeLimit > 0 && (waitingForGoodbye || waitingForTimeUp))) && <div className="stage-clock-wrap">
      <LiveStageClock deadline={deadline} running={timerRunning} frozenMs={pausedTimeMs} clockMax={currentClockMax}
        limitMs={timeLimit} bonusAt={timeBonusAt} onPhase={setPhase} />
    </div>}
    {/* An even 2px white outline around the reward images. */}
    <svg className="sr-only" aria-hidden="true"><filter id="white-outline" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="grown" />
      <feFlood floodColor="#fff" /><feComposite in2="grown" operator="in" />
      <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter></svg>
    {rewardPops.map(pop => <span key={pop.id} className={`reward-pop reward-pop--${pop.reward}`} role="status" style={{ left: pop.x, top: pop.y }}>
      {pop.reward === 'heart' ? <HeartIcon /> : pop.reward === 'quickOrder' ? <QuickOrderIcon /> : <TrayClearIcon />}<span aria-hidden="true">+1</span>
      <span className="sr-only">{pop.reward === 'heart' ? t.rewardHeart : pop.reward === 'quickOrder' ? t.rewardQuickOrder : t.rewardTrayClear}</span>
    </span>)}
    <p className="sr-only" role="status" aria-live="polite">{t.status(state.completedOrders, state.tray.length, state.trayCapacity)} {returning.size > 0 && t.returned}</p>
    {showResult && <section className="glass-popup result-panel" aria-labelledby="result-heading">
      {status === 'clear' && <img className="popup-ribbon" src={popupRibbon} alt="" draggable={false} />}
      {status === 'clear' && bonus && <div className="result-heart" role="img" aria-label={t.heartGained}>
        <HeartIcon /><span lang="en">+1</span>
      </div>}
      {status === 'clear' && !bonus && !state.relaxed && <div className="result-stars" role="img" aria-label={t.starsCount(stars)}>
        {[0, 1, 2].map(index => <span key={index} className={index < stars ? 'result-star--earned' : 'star--unearned'}><img src={rewardStar} alt="" draggable={false} /></span>)}
      </div>}
      <h2 id="result-heading" ref={resultHeading} tabIndex={-1} className={status === 'clear' ? 'result-display-title' : undefined}>
        {status === 'clear' && bonus ? 'Bonus Clear!' : status === 'clear' && lastStage ? 'All Stages Clear!' : resultTitles[status]}
      </h2>
      {status === 'clear' && <img className="result-desserts" src={clearDesserts} alt="" draggable={false} />}
      {failed && <div className="result-progress" role="img" aria-label={t.ordersDoneLabel(state.completedOrders, stage.targetOrders)}>
        <span className="result-progress-label" aria-hidden="true">{t.ordersDone} <strong>{state.completedOrders}</strong> / {stage.targetOrders}</span>
        <span className="result-progress-track" aria-hidden="true"><span style={{ width: `${state.completedOrders / stage.targetOrders * 100}%` }} /></span>
      </div>}
      {/* A bonus stage pays out once: its clear only leads back to the stage list. */}
      {bonus && status === 'clear' ? <div className="result-actions">
        <button type="button" className="primary-button popup-primary-button" onClick={onStages}>{t.ok}</button>
      </div> : <div className="result-actions">
        {status === 'clear' && !lastStage && <button type="button" className="primary-button popup-primary-button next-stage-button" onClick={onNext}>{t.nextStage}</button>}
        <button type="button" className={failed ? 'primary-button popup-primary-button' : 'secondary-button'} onClick={retry}><Icon name="retry" />{t.retry}</button>
        <button type="button" className="secondary-button" onClick={onStages}><Icon name="grid" />{t.stageSelect}</button>
      </div>}
      {failed && !practice && !bonus && <button type="button" className="pass-link-button" onClick={onShowPass}>{t.passFailed}</button>}
    </section>}
    {(boardVisible || waitingForGoodbye || waitingForTimeUp) && <div className="game-board">
    <OrderBoard key={round} orders={shownOrders} stageId={state.stageId} onOrderReady={onOrderReady} />
    <DonutTray inFlight={inFlight} donuts={state.tray} capacity={state.trayCapacity} difficulty={stage.difficulty} clearsLeft={state.trayClearsLeft} owned={clearsOwned} needsAd={clearNeedsAd}
      canClear={playing && !timeUp && !waitingForGoodbye && state.tray.length > 0 && !state.pendingMatchIds?.length && inFlight.size === 0 && returning.size === 0}
      onClear={onTrayClear}
      quickOrders={quickOrders} quickNeedsAd={quickNeedsAd} onQuickOrder={onQuickOrder}
      canQuickOrder={playing && !timeUp && canQuickOrder(state, quickNeedsAd) && !waitingForGoodbye && !showIntro && inFlight.size === 0 && returning.size === 0} />
    <DonutQueue key={round} queues={state.queues} revealed={state.peeked} returning={returning} disabled={queueDisabled} hintColumns={hintColumns} locked={trayFull} onReject={(_, element) => rejectSelection(element)} onSelect={(queueIndex, expectedDonutId) => { void act({ type: 'SELECT_DONUT', queueIndex, expectedDonutId }); }} />
    </div>}
    <dialog className="glass-popup tray-full-dialog pause-dialog" ref={pauseDialog} aria-labelledby="pause-heading" onCancel={event => { event.preventDefault(); act({ type: 'RESUME' }); }}>
      <h2 id="pause-heading">{t.pause}</h2>
      <div className="result-actions">
        <button type="button" data-sfx="none" className="primary-button popup-primary-button" onClick={() => act({ type: 'RESUME' })}><Icon name="play" />{t.resume}</button>
        <button type="button" className="secondary-button" onClick={retry}><Icon name="retry" />{t.retry}</button>
        <button type="button" className="secondary-button" onClick={onStages}><Icon name="grid" />{t.stageSelect}</button>
      </div>
    </dialog>
    <dialog className="glass-popup tray-full-dialog" ref={trayDialog} aria-labelledby="tray-full-heading" onCancel={event => event.preventDefault()}>
      <img className="popup-cat" src={popupCat} alt="" draggable={false} />
      <h2 id="tray-full-heading">{resultTitles.blocked}</h2>
      <div className="result-actions">
        {state.trayClearsLeft > 0 && <button type="button" data-sfx="none" className="primary-button popup-primary-button tray-clear-button" onClick={requestTrayClear} aria-label={clearNeedsAd ? t.clearTrayAdLabel : t.clearTrayLabel(clearsOwned)}>
          <ItemButtonIcon item="trayClear" />{t.clearTray} {clearNeedsAd
            ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span>
            : <span className="tray-clear-count" aria-hidden="true">{clearsOwned}</span>}
        </button>}
        {(!!quickOrders || quickNeedsAd) && <button type="button" data-sfx="none" className="primary-button popup-primary-button quick-order-button" onClick={requestQuickOrder}
          disabled={!canQuickOrder(state, quickNeedsAd)} aria-label={quickNeedsAd ? t.quickOrderAdLabel : t.quickOrderLabel(quickOrders ?? 0)}>
          <ItemButtonIcon item="quickOrder" />{t.quickOrder} {quickNeedsAd ? <span className="ad-badge" lang="en" aria-hidden="true">AD</span> : <span className="tray-clear-count" aria-hidden="true">{quickOrders}</span>}
        </button>}
        <button type="button" className="secondary-button" onClick={retry}><Icon name="retry" />{t.retry}</button>
        <button type="button" className="secondary-button" onClick={() => act({ type: 'GIVE_UP' })}>{t.giveUp}</button>
      </div>
      {clearNeedsAd && state.trayClearsLeft > 0 && <button type="button" className="pass-link-button" onClick={onShowPass}>{t.passClearTray}</button>}
    </dialog>
    {waitingForTimeUp && <div className="time-up-stamp" role="status"><span>{t.timeUp}</span></div>}
    {/* Dim the board for the title and +5s, then reveal the hidden desserts on the normal board. */}
    {showIntro && <div className={`stage-intro${bonus ? ' stage-intro--bonus' : ''}`} aria-hidden="true" style={{ '--intro-overlay-ms': `${INTRO_MS + timeBonusMs}ms` } as CSSProperties}>
      <span className="stage-intro-title">{bonus ? 'Bonus Stage!' : `Stage ${String(state.stageId).padStart(2, '0')}`}</span>
      {timeBonusMs > 0 && <span className="time-bonus-pop" lang="en"
        style={{ animationDelay: `${INTRO_MS}ms`, animationDuration: `${TIME_BONUS_POP_MS}ms` }}>+5s</span>}
    </div>}
    {showResult && status === 'clear' && <div className="confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <span key={i} style={{ left: `${(i * 29) % 100}%`, background: ['#ed96a6', '#a8d8c8', '#f5c66b', '#af9aca'][i % 4], animationDelay: `${(i % 9) * 55}ms`, transform: `rotate(${i * 37}deg)` }} />)}</div>}
  </main>;
}
