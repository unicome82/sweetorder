type IconName = 'basket' | 'grid' | 'back' | 'arrow' | 'lock' | 'retry' | 'sound' | 'sound-off' | 'pause' | 'play' | 'settings';

export function Icon({ name }: { name: IconName }) {
  return <span className={`material-symbol material-symbol--${name}`} aria-hidden="true" />;
}
