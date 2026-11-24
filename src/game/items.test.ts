import { describe, expect, it } from 'vitest';
import { hasHiddenDesserts } from './reducer';
import { createSession, reduceSession, type SessionState } from './session';
import { loadAllStages } from './stages';
import { createGame } from './engine';
import { PASS_PEEKS, PASS_TIME_BONUSES } from '../monetization/pass';

const stages = await loadAllStages();
const hiddenStage = stages.find(stage => hasHiddenDesserts(createGame(stage)))!;
const plainStage = stages.find(stage => !hasHiddenDesserts(createGame(stage)))!;
const DAY = 24 * 60 * 60_000;

function start(session: SessionState, stageId: number, relaxed = false) {
  return reduceSession({ ...session, unlockAllStages: true }, { type: 'START', stageId, relaxed, now: 1 });
}
const game = (session: SessionState, type: 'PEEK' | 'ADD_TIME' | 'RESTART', now = 2) =>
  reduceSession(session, { type: 'GAME', action: { type }, now });
const withPass = reduceSession(createSession(), { type: 'BUY_PASS', now: 0 });

describe('엿보기', () => {
  it('판당 1회 물음표를 공개하고, 다시 시작하면 다시 쓸 수 있다', () => {
    const started = start(createSession(), hiddenStage.id);
    const peeked = game(started, 'PEEK');
    expect(peeked.game.peeked).toBe(true);
    expect(hasHiddenDesserts(peeked.game)).toBe(false);
    expect(game(peeked, 'PEEK')).toBe(peeked);
    expect(game(peeked, 'RESTART').game.peeked).toBeUndefined();
  });

  it('물음표가 없는 판에서는 쓸 수 없다', () => {
    const started = start(createSession(), plainStage.id);
    expect(game(started, 'PEEK')).toBe(started);
  });

  it('패스는 엿보기 1회를 차감하고, 다 쓰면 광고로 쓴 것처럼 차감 없이 공개한다', () => {
    const peeked = game(start(withPass, hiddenStage.id), 'PEEK');
    expect(peeked.pass!.peeks).toBe(PASS_PEEKS - 1);
    const none = { ...withPass, pass: { ...withPass.pass!, peeks: 0 } };
    const viaAd = game(start(none, hiddenStage.id), 'PEEK');
    expect(viaAd.game.peeked).toBe(true);
    expect(viaAd.pass!.peeks).toBe(0);
    // An expired pass keeps its leftover count.
    const expired = game(start(withPass, hiddenStage.id), 'PEEK', 31 * DAY);
    expect(expired.pass!.peeks).toBe(PASS_PEEKS);
  });
});

describe('타이머 +5초', () => {
  it('패스가 있으면 타이머 모드에서 판당 1회 쓰고 1회 차감한다', () => {
    const used = game(start(withPass, plainStage.id), 'ADD_TIME');
    expect(used.game.timeBonusUsed).toBe(true);
    expect(used.pass!.timeBonuses).toBe(PASS_TIME_BONUSES - 1);
    expect(game(used, 'ADD_TIME')).toBe(used);
    const restarted = game(used, 'RESTART');
    expect(restarted.game.timeBonusUsed).toBeUndefined();
    expect(game(restarted, 'ADD_TIME').pass!.timeBonuses).toBe(PASS_TIME_BONUSES - 2);
  });

  it('패스가 없거나, 만료됐거나, 남은 횟수가 없거나, 여유 모드면 쓸 수 없다', () => {
    const noPass = start(createSession(), plainStage.id);
    expect(game(noPass, 'ADD_TIME')).toBe(noPass);
    const started = start(withPass, plainStage.id);
    expect(game(started, 'ADD_TIME', 31 * DAY)).toBe(started);
    const empty = start({ ...withPass, pass: { ...withPass.pass!, timeBonuses: 0 } }, plainStage.id);
    expect(game(empty, 'ADD_TIME')).toBe(empty);
    const relaxed = start(withPass, plainStage.id, true);
    expect(game(relaxed, 'ADD_TIME')).toBe(relaxed);
  });
});
