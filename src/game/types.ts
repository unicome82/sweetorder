export const DONUT_TYPES = ['strawberryDonut', 'chocolateDonut', 'vanillaDonut', 'raspberryCroffle', 'lemonCake', 'tiramisu', 'purpleRollCake', 'lemonPosset', 'mintBrownie', 'pretzel', 'cherryPie', 'greenRollCake', 'hamSandwich', 'canele', 'croissant', 'strawberryCake', 'caramelPudding', 'cinnamonCroffle', 'matchaCroffle', 'chocolateCake', 'matchaPudding', 'raspberryMacaron', 'lemonMacaron', 'blueberryCupcake', 'chocolateCupcake', 'strawberryTart', 'blueberryTart', 'chocolateCroissant', 'chocolateCookie', 'whiteCookie', 'berryScone', 'matchaScone', 'vanillaIceCream', 'chocolateIceCream'] as const;
export type DonutType = typeof DONUT_TYPES[number];
// A reward takes its own slot in a queue and is collected (never sent to the tray) when tapped at the front.
export type RewardKind = 'heart' | 'trayClear' | 'quickOrder';
// hidden: shown as "?" until the token reaches the front of its queue.
// reward: this slot is a reward, not a dessert; its type only copies a neighbour's and is never used.
export interface DonutToken { id: string; type: DonutType; hidden?: boolean; reward?: RewardKind }
export interface OrderDefinition { id: string; sequence: number; items: Partial<Record<DonutType, number>> }
export interface ActiveOrder { definitionId: string; sequence: number; remaining: Partial<Record<DonutType, number>> }
export type StageDifficulty = 'easy' | 'normal' | 'hard';
export interface StageDefinition {
  difficulty?: StageDifficulty;
  id: number; revision: number; donutTypes: DonutType[]; targetOrders: number;
  trayCapacity: number; queues: DonutToken[][]; orders: OrderDefinition[];
}
export type GameStatus = 'ready' | 'playing' | 'paused' | 'blocked' | 'clear' | 'gameover';
export interface GameState {
  stageId: number; stageRevision: number; status: GameStatus;
  orders: Array<ActiveOrder | null>; nextOrderIndex: number;
  queues: DonutToken[][]; tray: DonutToken[]; trayCapacity: number;
  pendingMatchIds?: string[];
  /** Relaxed mode: no clock or stars, and one free tray clear instead of the carried ones. */
  relaxed?: boolean;
  clearStars?: number;
  // Why play stopped while blocked or lost: the tray filled, or no reachable dessert can be picked up.
  blockedReason?: 'full' | 'stuck';
  /** Set when a timed attempt was lost because the clock ran out. */
  failReason?: 'time';
  completedOrders: number; trayClearsLeft: number; transitionId: number;
  /** Rewards picked up from the queues during this attempt, in order. */
  collectedRewards?: RewardKind[];
  /** Peek was used this attempt: every "?" in the queues shows its dessert. */
  peeked?: boolean;
  /** The pass's +5 seconds was used this attempt. */
  timeBonusUsed?: boolean;
  /** Quick orders the player can use in this attempt: the owned one (at most one), plus any picked up from the queues. */
  quickOrders?: number;
  /** How many of quickOrders came from the pass for this attempt (0 or 1); the owned one is used first. */
  passQuickOrders?: number;
  quickOrderAds?: boolean;
}
