import type { ReactNode } from 'react';
import { HeartIcon } from './components/HeartIcon';
import { RewardHeart } from './components/RewardHeart';
import { itemNames } from './components/Donut/donutThemes';
import { DONUT_TYPES } from './game/types';
import './styles/guide.css';

const images = import.meta.glob<string>('./assets/{menu,menu-archive,customers,home,game,icons}/*.{webp,svg}', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
});

const scenes: Record<string, string> = {
  'home/sky': '스카이', 'home/shop': '상점', 'home/rose': '로즈', 'home/night': '밤',
  'home/lavender': '라벤더', 'home/honey': '허니', 'home/berry': '베리', 'home/bakery': '베이커리',
  'game/stage-select': '스테이지 선택 배경', 'game/cafe': '카페 배경',
  'game/cafe-playing': '플레이 중 카페 배경', 'game/display-shelf': '진열대',
  'game/clear-desserts': '클리어 디저트', 'game/popup-ribbon': '팝업 리본',
};
const archivedDesserts = {
  hamSandwich: '햄치즈 샌드위치',
  blueberryCupcake: '블루베리 컵케이크',
  chocolateCupcake: '초코 컵케이크',
  strawberryTart: '딸기 타르트',
  chocolateCookie: '초코칩 쿠키',
  lemonPosset: '레몬 포셋',
  purpleRollCake: '보라 롤케이크',
  whiteCookie: '화이트 초콜릿 쿠키',
  matchaPudding: '말차 푸딩',
  cinnamonCroffle: '시나몬 크러플',
};
const icons: Record<string, string> = {
  chevron_left: '뒤로', volume_up: '소리 켜기', volume_off: '소리 끄기', pause: '일시 정지',
  play_arrow: '재생', arrow_forward: '다음', refresh: '다시 시도', grid_view: '스테이지 목록',
  shopping_basket: '트레이 비우기', lock: '잠금', settings: '설정',
};

function ImagePreview({ url, label }: { url: string; label: string }) {
  return <a className="preview" href={url} target="_blank" rel="noreferrer" aria-label={`${label} 원본 이미지 열기`}>
    <img src={url} alt="" loading="lazy" decoding="async" />
  </a>;
}

interface Entry { label: string; preview: ReactNode }
function asset(label: string, path: string): Entry {
  const url = images[`./assets/${path}`];
  if (!url) throw new Error(`가이드 이미지가 없습니다: ${path}`);
  return { label, preview: <ImagePreview label={label} url={url} /> };
}

const sections = [
  { id: 'desserts', title: '디저트', entries: DONUT_TYPES.map(type => asset(itemNames[type], `menu/${type}.webp`)) },
  {
    id: 'archive', title: '교체 전 디저트',
    entries: Object.entries(archivedDesserts).map(([id, label]) => asset(label, `menu-archive/${id}.webp`)),
  },
  {
    id: 'characters', title: '캐릭터',
    entries: Object.keys(images).filter(path => path.includes('/customers/')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((path, index) => asset(`손님 ${index + 1}`, path.replace('./assets/', '')))
      .concat(asset('팝업 고양이', 'game/popup-cat.webp')),
  },
  {
    id: 'images', title: '배경과 일러스트',
    entries: Object.entries(scenes).map(([name, label]) =>
      asset(label, `${name}.webp`)),
  },
  {
    id: 'icons', title: '아이콘',
    entries: [
      ...Object.entries(icons).map(([name, label]) => asset(label, `icons/${name}.svg`)),
      asset('별 보상', 'game/reward-star.webp'),
      { label: '파비콘', preview: <ImagePreview label="파비콘" url="../favicon.svg" /> },
      { label: '홈 화면 아이콘', preview: <ImagePreview label="홈 화면 아이콘" url="../apple-touch-icon.png" /> },
      { label: '하트', preview: <span className="preview"><HeartIcon /></span> },
      { label: '하트 보상', preview: <span className="preview"><RewardHeart /></span> },
      { label: '타이머 모드', preview: <span className="preview" aria-hidden="true">⏱️</span> },
      { label: '릴랙스 모드', preview: <span className="preview" aria-hidden="true">🌿</span> },
      { label: '하트 효과', preview: <span className="preview effect-icon" aria-hidden="true">♥</span> },
      { label: '반짝임 효과', preview: <span className="preview effect-icon" aria-hidden="true">✦</span> },
      { label: '가려진 디저트', preview: <span className="preview" aria-hidden="true">?</span> },
    ],
  },
];

export function Guide() {
  return <>
    <header className="guide-heading">
      <div className="guide-shell">
        <div className="guide-top">
          <span className="guide-brand">Sweet Order</span>
          <a href="../">게임으로 돌아가기 <span aria-hidden="true">↗</span></a>
        </div>
        <h1>시각 자료 가이드</h1>
      </div>
    </header>
    <main className="guide-shell">
      <nav className="guide-nav" aria-label="자료 분류">
        {sections.map(({ id, title, entries }) => <a key={id} href={`#${id}`}>{title} <span>{entries.length}</span></a>)}
      </nav>
      {sections.map(({ id, title, entries }) => <section className={`guide-section guide-section--${id}`} id={id} key={id} aria-labelledby={`heading-${id}`}>
        <h2 id={`heading-${id}`}>{title}</h2>
        <ul className="guide-grid">
          {entries.map(({ label, preview }) => <li key={label}>
            {preview}
            <span className="asset-label">{label}</span>
          </li>)}
        </ul>
      </section>)}
    </main>
  </>;
}
