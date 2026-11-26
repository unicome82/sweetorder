// iOS Safari can still zoom on a quick double tap (for example over a briefly disabled
// queue button or the gaps between columns). Cancelling the second touchend stops the
// zoom; queue taps use pointer events, which fire before touchend, so they still register.
// Buttons meant to be tapped quickly in a row ([data-repeat-tap]: steppers, page jumps) are left alone:
// cancelling their touchend would also drop their click, and touch-action: manipulation stops the zoom there.
// The same goes for every enabled button: a quick tap on a popup's OK right after play must still click it.
const doubleTapMs = 350;

export function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener('touchend', event => {
    const now = event.timeStamp;
    const target = event.target as HTMLElement | null;
    const exempt = target?.closest('input, textarea, select, [data-repeat-tap], button:enabled');
    if (!exempt && now - lastTouchEnd < doubleTapMs) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}
