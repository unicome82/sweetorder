import heart from '../assets/game/heart.webp';

export function HeartIcon({ className = '' }: { className?: string }) {
  return <img className={`heart-icon ${className}`} src={heart} alt="" />;
}
