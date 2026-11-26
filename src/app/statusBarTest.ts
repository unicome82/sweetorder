// Temporary: switches between iOS status bar blur workarounds from the settings popup.
export type StatusBarTest = 'off' | 'strip' | 'backdrop' | 'scroller';
export const statusBarTests: StatusBarTest[] = ['off', 'strip', 'backdrop', 'scroller'];
const key = 'sweet-order-status-bar-test';

export function readStatusBarTest(): StatusBarTest {
  try {
    const value = localStorage.getItem(key) as StatusBarTest | null;
    return value && statusBarTests.includes(value) ? value : 'off';
  } catch { return 'off'; }
}

export function applyStatusBarTest(test: StatusBarTest) {
  document.documentElement.dataset.statusBarTest = test;
  try { localStorage.setItem(key, test); } catch { /* Private mode keeps the choice for this visit only. */ }
}
