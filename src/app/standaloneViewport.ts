export function syncStandaloneViewport() {
  // iOS can report a viewport shorter than the display in a home-screen web app.
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  if (!appleNavigator.standalone) return;
  document.documentElement.classList.add('standalone');

  // With an opaque status bar the page starts below it, so the display height would be too tall.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)';

  function updateHeight() {
    const style = document.documentElement.style;
    document.body.append(probe);
    const drawsUnderStatusBar = probe.getBoundingClientRect().height > 0;
    probe.remove();
    const { width, height } = window.screen;
    const viewportWidth = window.innerWidth;
    const fullHeight = !drawsUnderStatusBar ? 0
      : Math.abs(viewportWidth - width) <= 1 ? height
      : Math.abs(viewportWidth - height) <= 1 ? width
      : 0; // A window narrower than the display, such as iPad Split View.
    if (fullHeight) style.setProperty('--ios-full-height', `${fullHeight}px`);
    else style.removeProperty('--ios-full-height');
  }

  updateHeight();
  window.addEventListener('resize', updateHeight);
  window.addEventListener('pageshow', updateHeight);
}
