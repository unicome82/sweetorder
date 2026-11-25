export function syncStandaloneViewport() {
  // iOS can report a viewport shorter than the display in a home-screen web app.
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  if (!appleNavigator.standalone) return;

  function updateHeight() {
    const { width, height } = window.screen;
    const viewportWidth = window.innerWidth;
    const fullHeight = Math.abs(viewportWidth - width) <= 1 ? height
      : Math.abs(viewportWidth - height) <= 1 ? width
      : 0; // A window narrower than the display, such as iPad Split View.
    const style = document.documentElement.style;
    if (fullHeight) style.setProperty('--ios-full-height', `${fullHeight}px`);
    else style.removeProperty('--ios-full-height');
  }

  updateHeight();
  window.addEventListener('resize', updateHeight);
  window.addEventListener('pageshow', updateHeight);
}
