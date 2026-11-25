import { describe, expect, it } from 'vitest';
import { hasHiddenDesserts } from './reducer';
import { addTimeFromPass, createSession, itemsBeforeStart, peekFromPass, reduceSession, type ItemChoice, type SessionState } from './session';
import { loadAllStages } from './stages';
import { createGame } from './engine';
import { PASS_PEEKS, PASS_TIME_BONUSES } from '../monetization/pass';

const stages = await loadAllStages();
const hiddenStage = stages.find(stage => hasHiddenDesserts(createGame(stage)))!;
const plainStage = stages.find(stage => !hasHiddenDesserts(createGame(stage)))!;
const DAY = 24 * 60 * 60_000;

const withPass = { ...reduceSession(createSession(), { type: 'BUY_PASS', now: 0 }), unlockAllStages: true };
const noPass = { ...createSession(), unlockAllStages: true };
const start = (session: SessionState, stageId: number, items?: ItemChoice, { relaxed = false, now = 1, adItems = {} as ItemChoice } = {}) =>
  reduceSession(session, { type: 'START', stageId, relaxed, now, items, adItems });

describe('시작 전 아이템 선택', () => {
  it('엿보기는 물음표 스테이지, +5초는 타이머 모드에서 고를 수 있다', () => {
    expect(itemsBeforeStart(hiddenStage.id, false)).toEqual({ peek: true, addTime: true });
    expect(itemsBeforeStart(plainStage.id, false)).toEqual({ peek: false, addTime: true });
    expect(itemsBeforeStart(plainStage.id, true)).toEqual({ peek: false, addTime: false });
    expect(addTimeFromPass(noPass.pass, 1)).toBe(false);
    expect(addTimeFromPass(withPass.pass, 1)).toBe(true);
    expect(addTimeFromPass(withPass.pass, 31 * DAY)).toBe(false);
  });

  it('패스는 고른 아이템을 1회씩 차감하고, 엿보기는 물음표가 공개된 채로, +5초는 쓴 채로 시작한다', () => {
    const started = start(withPass, hiddenStage.id, { peek: true, addTime: true });
    expect(started.game).toMatchObject({ peeked: true, timeBonusUsed: true });
    expect(hasHiddenDesserts(started.game)).toBe(false);
    expect(started.pass).toMatchObject({ peeks: PASS_PEEKS - 1, timeBonuses: PASS_TIME_BONUSES - 1 });
    expect(start(withPass, hiddenStage.id).game.peeked).toBeUndefined();
  });

  it('패스 엿보기가 없으면 (광고로 산) 엿보기는 차감 없이 적용된다', () => {
    expect(peekFromPass(noPass.pass, 1)).toBe(false);
    expect(start(noPass, hiddenStage.id, { peek: true }, { adItems: { peek: true } }).game.peeked).toBe(true);
    const used = { ...withPass, pass: { ...withPass.pass!, peeks: 0 } };
    expect(peekFromPass(used.pass, 1)).toBe(false);
    expect(start(used, hiddenStage.id, { peek: true }, { adItems: { peek: true } }).pass).toEqual(used.pass);
  });

  it('광고를 끝까지 보면 패스 없이도 +5초를 쓰고 패스 보유분은 차감하지 않는다', () => {
    const choice = { addTime: true };
    const paid = { adItems: { addTime: true } };
    expect(start(noPass, plainStage.id, choice, paid).game.timeBonusUsed).toBe(true);
    const used = { ...withPass, pass: { ...withPass.pass!, timeBonuses: 0 } };
    expect(addTimeFromPass(used.pass, 1)).toBe(false);
    const started = start(used, plainStage.id, choice, paid);
    expect(started.game.timeBonusUsed).toBe(true);
    expect(started.pass).toEqual(used.pass);
    expect(start(noPass, plainStage.id, choice, { ...paid, relaxed: true }).game.timeBonusUsed).toBeUndefined();
  });

  it('두 아이템은 각각 광고를 완료해야 적용한다', () => {
    const choice = { peek: true, addTime: true };
    const peekOnly = start(noPass, hiddenStage.id, choice, { adItems: { peek: true } }).game;
    expect(peekOnly.peeked).toBe(true);
    expect(peekOnly.timeBonusUsed).toBeUndefined();
    const timeOnly = start(noPass, hiddenStage.id, choice, { adItems: { addTime: true } }).game;
    expect(timeOnly.timeBonusUsed).toBe(true);
    expect(timeOnly.peeked).toBeUndefined();
  });

  it('스테이지에서 쓸 수 없는 아이템은 골라도 적용 · 차감하지 않는다', () => {
    const started = start(withPass, plainStage.id, { peek: true, addTime: true }, { relaxed: true });
    expect(started.game.peeked).toBeUndefined();
    expect(started.game.timeBonusUsed).toBeUndefined();
    expect(started.pass).toEqual(withPass.pass);
    expect(start(noPass, plainStage.id, { addTime: true }).game.timeBonusUsed).toBeUndefined();
  });
});
