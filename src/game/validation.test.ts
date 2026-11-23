import { describe, expect, it } from 'vitest';
import { stage01 } from './stages/stage01';
import { loadAllStages } from './stages';
import { validateStage } from './validation';
import { difficultyForStage, hiddenDessertCount } from './stages/schedule';
import { clearTray, createGame } from './engine';

const stages = await loadAllStages();
describe('고정 스테이지 데이터 계약', () => {
  it.each([['easy', 10, 12, 126, 140], ['normal', 12, 10, 160, 176], ['hard', 14, 8, 200, 216]] as const)(
    '%s는 종류별 준비량과 주문량이 같고 지정된 트레이를 사용한다', (difficulty, variety, capacity, minDesserts, maxDesserts) => {
      for (const stage of stages.filter(stage => stage.difficulty === difficulty)) {
        expect(validateStage(stage)).toEqual([]);
        expect(new Set(stage.queues.flat().filter(token => !token.reward).map(token => token.type)).size).toBe(variety);
        expect(new Set(stage.orders.flatMap(order => Object.keys(order.items))).size).toBe(variety);
        expect(stage.trayCapacity).toBe(capacity);
        expect(stage.queues.flat().filter(token => !token.reward).length).toBeGreaterThanOrEqual(minDesserts);
        expect(stage.queues.flat().filter(token => !token.reward).length).toBeLessThanOrEqual(maxDesserts);
      }
    },
  );
  it('스테이지1의 구조와 종류별 공급량이 유효하다', () => expect(validateStage(stage01)).toEqual([]));
  it('중복 토큰 ID와 공급 부족을 감지한다', () => {
    const invalid = structuredClone(stage01);
    invalid.queues = Array.from({ length: 8 }, () => [{ id: 'duplicate', type: 'vanillaIceCream' as const }]);
    expect(validateStage(invalid)).toContain('도넛 ID가 비어 있거나 중복됩니다.');
    expect(validateStage(invalid)).toContain('croissant 공급이 부족합니다.');
  });
  it('총수량 16개를 넘는 주문을 거부한다', () => {
    const invalid = structuredClone(stage01);
    invalid.orders[0] = { id: 'oversized', sequence: 1, items: { croissant: 16, chocolateIceCream: 1 } };
    expect(validateStage(invalid)).toContain('주문 총수량은 16개 이하여야 합니다.');
  });
  it('잘못된 주문 수량과 순번을 감지한다', () => {
    const invalid = structuredClone(stage01);
    invalid.orders[0] = { id: 'invalid', sequence: 7, items: { croissant: 0 } };
    expect(validateStage(invalid)).toContain('주문 순번이 올바르지 않습니다.');
    expect(validateStage(invalid)).toContain('주문 종류 또는 수량이 올바르지 않습니다.');
  });
  it('난이도 순서를 따르고 첫 Hard는 11번 스테이지다', () => {
    for (const stage of stages) expect(stage.difficulty).toBe(difficultyForStage(stage.id));
    expect(stages.find(stage => stage.difficulty === 'hard')?.id).toBe(11);
  });
  it('가려진 디저트는 50번 이후 Hard에만 4개부터 늘어나며 줄의 앞 두 칸에는 없다', () => {
    expect(stages.find(stage => stage.queues.flat().some(token => token.hidden))?.id).toBe(51);
    expect(hiddenDessertCount(51, 'hard')).toBe(4);
    expect(hiddenDessertCount(55, 'hard')).toBe(5);
    for (const stage of stages) {
      const covered = stage.queues.flatMap(queue => queue.flatMap((token, index) => token.hidden ? [index] : []));
      expect(covered).toHaveLength(hiddenDessertCount(stage.id, stage.difficulty ?? 'easy'));
      expect(covered.every(index => index >= 2)).toBe(true);
    }
  });
  it('트레이를 비우면 돌아온 디저트는 가려지지 않는다', () => {
    const stage = stages.find(candidate => candidate.queues.some(queue => queue.some(token => token.hidden)))!;
    const column = stage.queues.findIndex(queue => queue.some(token => token.hidden));
    const token = stage.queues[column]!.find(candidate => candidate.hidden)!;
    const game = createGame(stage);
    const queues = game.queues.map(queue => queue.filter(candidate => candidate.id !== token.id));
    const returned = clearTray({ ...game, queues, tray: [{ ...token }] }, stage).state;
    expect(returned.tray).toHaveLength(0);
    expect(returned.queues[column]!.at(-1)).toEqual({ id: token.id, type: token.type });
  });

});
