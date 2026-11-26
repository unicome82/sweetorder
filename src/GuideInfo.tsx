import type { ReactNode } from 'react';
import { HeartIcon } from './components/HeartIcon';
import { AddTimeIcon, MysteryIcon, QuickOrderIcon, TrayClearIcon } from './components/ItemIcons';
import { BASE_TRAY_CAPACITY, MAX_ORDER_QUANTITY, ORDER_SLOTS, QUEUE_COUNT } from './game/constants';
import { HEART_REFILL_MS, MAX_HEARTS } from './game/hearts';
import { MAX_QUICK_ORDERS } from './game/engine';
import {
  DAILY_REWARD_LIMITS, MAX_TRAY_CLEARS, POINTS_PER_ORDER, RELAXED_TRAY_CLEARS, STARTING_TRAY_CLEARS, TIMED_TRAY_CLEARS_PER_GAME,
} from './game/session';
import { QUICK_ORDER_FROM_STAGE, REWARD_MIN_DEPTH, REWARD_SPLIT_PERCENT, REWARD_STAGE_PERCENT, REWARDS_FROM_STAGE } from './game/stages/extras';
import { STAGE_COUNT, firstHiddenCount, hiddenDessertsAfterStage, maxHiddenCount } from './game/stages/schedule';
import { TRAY_CAPACITY_BY_DIFFICULTY } from './game/trayCapacity';
import {
  PASS_FAST_REFILLS, PASS_TRAY_CLEARS, PASS_PEEKS, PASS_QUICK_ORDERS, PASS_SPARE_HEARTS, PASS_TIME_BONUS_MS, PASS_TIME_BONUSES,
} from './monetization/pass';

// Game facts for the guide. Numbers come straight from the game's constants, so the page follows any change to them.
const minutes = (ms: number) => ms / 60_000;

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return <div className="info-table-wrap">
    <table className="info-table">
      <thead><tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

const overview = <div className="info-cards">
  <article className="info-card">
    <h3>한 줄 정의</h3>
    <p>카페 손님들의 디저트 주문을, 대기열에서 디저트를 골라 트레이에 담아 채워 주는 <b>캐주얼 정렬 퍼즐</b>.</p>
  </article>
  <article className="info-card">
    <h3>목표</h3>
    <p>트레이가 가득 차기 전에 스테이지의 <b>목표 주문 수</b>를 모두 채우면 클리어.</p>
  </article>
  <article className="info-card">
    <h3>규모</h3>
    <p>캠페인 <b>{STAGE_COUNT.toLocaleString()}스테이지</b> · 대기열 <b>{QUEUE_COUNT}줄</b> · 손님 <b>{ORDER_SLOTS}명</b> · 한 손님 주문 최대 <b>{MAX_ORDER_QUANTITY}개</b></p>
  </article>
  <article className="info-card">
    <h3>모드</h3>
    <p>⏱️ <b>타이머</b>: 남은 시간으로 별 1~3개<br />🌿 <b>릴랙스</b>: 시간 제한 없음, 별 없음</p>
  </article>
</div>;

const howTo = <ol className="info-steps">
  <li><span><b>디저트 고르기</b> — 각 대기열의 맨 앞 디저트만 탭할 수 있어요.</span></li>
  <li><span><b>트레이에 담기</b> — 고른 디저트는 트레이로 이동해요. (트레이 {TRAY_CAPACITY_BY_DIFFICULTY.easy}/{TRAY_CAPACITY_BY_DIFFICULTY.normal}/{TRAY_CAPACITY_BY_DIFFICULTY.hard}칸: 쉬움/보통/어려움)</span></li>
  <li><span><b>자동 서빙</b> — 손님 주문과 맞으면 자동으로 전달되고, 맞지 않으면 트레이에 남아 다음 주문을 기다려요.</span></li>
  <li><span><b>주문 완료</b> — 다 채운 손님은 떠나고 새 손님이 와요. 주문 1개당 {POINTS_PER_ORDER}점.</span></li>
  <li><span><b>클리어 / 막힘</b> — 목표 주문을 채우면 클리어. 트레이가 꽉 차 움직일 수 없으면 트레이 비우기·퀵오더·다시하기 중에서 골라요.</span></li>
  <li><span><b>별</b> — 남은 시간 50% 이상 ★3, 25% 이상 ★2, 그 외 ★1. 시간이 다 되면 실패 (이미 놓은 디저트는 마저 전달하고, 그걸로 클리어하면 ★1). 연습 · 보너스 스테이지는 시간이 지나도 계속.</span></li>
</ol>;

const items = <ul className="info-items">
  <li>
    <span className="info-item-icon"><HeartIcon /></span>
    <div><h3>하트</h3><p>스테이지 입장에 1개 사용, 클리어하면 돌려받아요. 최대 {MAX_HEARTS}개, {minutes(HEART_REFILL_MS)}분마다 1개 충전. 부족하면 광고로 충전.</p></div>
  </li>
  <li>
    <span className="info-item-icon"><TrayClearIcon /></span>
    <div><h3>트레이 비우기</h3><p>트레이의 디저트를 대기열로 돌려보내요. 시작 시 {STARTING_TRAY_CLEARS}개 지급, 스테이지 보상으로 최대 {MAX_TRAY_CLEARS}개까지 보유, 보유분은 한 판에 모두 쓸 수 있어요. 다 쓰면 광고로 타이머 {TIMED_TRAY_CLEARS_PER_GAME}회 · 릴랙스 {RELAXED_TRAY_CLEARS}회까지 사용.</p></div>
  </li>
  <li>
    <span className="info-item-icon"><QuickOrderIcon /></span>
    <div><h3>퀵오더</h3><p>화면의 손님 주문을 한 번에 채워요 (트레이 → 대기열 순). 최대 {MAX_QUICK_ORDERS}개 보유, 스테이지 보상으로 획득. 일반 보유분과 패스 잔여분을 한 판에 모두 쓸 수 있어요.</p></div>
  </li>
  <li>
    <span className="info-item-icon"><MysteryIcon /></span>
    <div><h3>미리보기</h3><p>가려진 “?” 디저트를 공개한 채로 시작해요. 시작 전 선택, 광고 또는 패스로 사용.</p></div>
  </li>
  <li>
    <span className="info-item-icon"><AddTimeIcon /></span>
    <div><h3>+5초</h3><p>제한 시간을 {PASS_TIME_BONUS_MS / 1000}초 늘리고 시작해요. 타이머 모드 시작 전 선택, 광고 또는 패스로 사용.</p></div>
  </li>
</ul>;

const settings = <>
  <h3 className="info-subheading">스테이지</h3>
  <Table head={['항목', '값']} rows={[
    ['난이도별 트레이 칸', `쉬움 ${TRAY_CAPACITY_BY_DIFFICULTY.easy} · 보통 ${TRAY_CAPACITY_BY_DIFFICULTY.normal} · 어려움 ${TRAY_CAPACITY_BY_DIFFICULTY.hard} (기본 ${BASE_TRAY_CAPACITY})`],
    ['가려진 디저트', `${hiddenDessertsAfterStage}스테이지 이후 어려움 단계, ${firstHiddenCount}개부터 최대 ${maxHiddenCount}개`],
    ['제한 시간', '10초 + 디저트 1개당 1.0 / 1.1 / 1.2초 (5초 단위 올림)'],
  ]} />
  <h3 className="info-subheading">아이템</h3>
  <Table head={['아이템', '시작', '최대 보유', '한 판 사용', '없을 때']} rows={[
    ['하트', MAX_HEARTS, MAX_HEARTS, '입장 1개', `${minutes(HEART_REFILL_MS)}분 충전 · 광고`],
    ['트레이 비우기', STARTING_TRAY_CLEARS, MAX_TRAY_CLEARS, '보유분', `광고 ${TIMED_TRAY_CLEARS_PER_GAME}회 (릴랙스 ${RELAXED_TRAY_CLEARS}회)`],
    ['퀵오더', 0, MAX_QUICK_ORDERS, '일반·패스 보유분', '광고 (판당 제한 없음)'],
    ['미리보기', '—', '—', '1', '광고'],
    ['+5초', '—', '—', '1', '광고'],
  ]} />
  <h3 className="info-subheading">스테이지 보상</h3>
  <Table head={['항목', '값']} rows={[
    ['보상 시작', `${REWARDS_FROM_STAGE}스테이지부터, 스테이지의 ${REWARD_STAGE_PERCENT}%에 1개씩`],
    ['보상 위치', `대기열 ${REWARD_MIN_DEPTH + 1}번째 이후`],
    ['보상 종류 비율', `하트 ${REWARD_SPLIT_PERCENT.heart} : 트레이 비우기 ${REWARD_SPLIT_PERCENT.trayClear} : 퀵오더 ${REWARD_SPLIT_PERCENT.quickOrder} (퀵오더는 ${QUICK_ORDER_FROM_STAGE}스테이지부터, 그 전엔 하트)`],
    ['스테이지당 확률', `하트 ${REWARD_STAGE_PERCENT * REWARD_SPLIT_PERCENT.heart / 100}% · 트레이 비우기 ${REWARD_STAGE_PERCENT * REWARD_SPLIT_PERCENT.trayClear / 100}% · 퀵오더 ${REWARD_STAGE_PERCENT * REWARD_SPLIT_PERCENT.quickOrder / 100}%`],
    ['하루 한도', `하트 ${DAILY_REWARD_LIMITS.heart} · 트레이 비우기 ${DAILY_REWARD_LIMITS.trayClear} · 퀵오더 ${DAILY_REWARD_LIMITS.quickOrder} (기기 날짜 기준)`],
    ['나오지 않는 경우', '하루 한도에 닿았을 때 · 보유가 가득할 때 · 이미 받은 스테이지 (앞의 두 경우는 다음에 다시 나옴)'],
    ['보너스 스테이지', '하루 1회, 클리어 시 하트 1개'],
  ]} />
</>;

const pass = <div className="info-pass">
  <p className="info-pass-lead"><b>1회 구매 패스</b> · 사용 기한 없이 보유하고, 다시 사면 남은 수량에 더해져요.</p>
  <Table head={['혜택', '무료', '패스']} rows={[
    ['여분 하트', '—', `${PASS_SPARE_HEARTS}개`],
    ['하트 충전', `${minutes(HEART_REFILL_MS)}분에 1개`, `${minutes(HEART_REFILL_MS) / 2}분에 1개 (총 ${PASS_FAST_REFILLS}회)`],
    ['트레이 비우기', `보유분 → 광고`, `${PASS_TRAY_CLEARS}개`],
    ['미리보기', '광고', `${PASS_PEEKS}회`],
    ['+5초', '광고', `${PASS_TIME_BONUSES}회`],
    ['퀵오더', '보상 또는 광고', `+ ${PASS_QUICK_ORDERS}개`],
  ]} />
</div>;

export const infoSections: { id: string; title: string; body: ReactNode }[] = [
  { id: 'overview', title: '게임 정의', body: overview },
  { id: 'how-to', title: '플레이 방법', body: howTo },
  { id: 'items', title: '아이템', body: items },
  { id: 'settings', title: '설정값', body: settings },
  { id: 'pass', title: '패스', body: pass },
];
