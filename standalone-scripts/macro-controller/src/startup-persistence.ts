/**
 * MacroLoop Controller — SPA Persistence Observer
 *
 * Watches for SPA navigations that remove the controller's DOM elements
 * and re-injects the UI when needed. Uses narrow MutationObserver scope
 * (childList only, no subtree) per MC-04.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { log } from './logging';
import { nsReadTyped } from './api-namespace';
import { IDS, VERSION } from './shared-state';
import { resetRedockState } from './ui/redock-observer';

// CQ16: Extracted from setupPersistenceObserver closure
function tryReinjectUI(createUI: () => void): void {
  const isDestroyed = nsReadTyped('_internal.destroyed');

  if (isDestroyed) {
    log('Panel was destroyed by user — skipping re-injection', 'info');

    return;
  }

  const hasMarker = !!document.getElementById(IDS.SCRIPT_MARKER);
  const hasContainer = !!document.getElementById(IDS.CONTAINER);

  if (!hasMarker) {
    log('Marker removed by SPA navigation, re-placing', 'warn');
    const newMarker = document.createElement('div');
    newMarker.id = IDS.SCRIPT_MARKER;
    newMarker.style.display = 'none';
    newMarker.setAttribute('data-version', VERSION);
    document.body.appendChild(newMarker);
  }

  if (!hasContainer) {
    log('UI container removed by SPA navigation, re-creating', 'warn');
    resetRedockState();
    createUI();
  }
}

// PERF-13: Idle-callback handle type (window.requestIdleCallback may be absent).
interface IdleCallbackWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/** Install MutationObserver + visibilitychange listener for SPA persistence. */
export function setupPersistenceObserver(createUI: () => void): void {
  let reinjectTimer: ReturnType<typeof setTimeout> | null = null;
  let reinjectIdleHandle: number | null = null;
  const REINJECT_DELAY_MS = 500;
  const IDLE_TIMEOUT_MS = 1000;
  const idleWin = window as unknown as IdleCallbackWindow;

  function cancelPending(): void {
    if (reinjectTimer) {
      clearTimeout(reinjectTimer);
      reinjectTimer = null;
    }
    if (reinjectIdleHandle !== null && idleWin.cancelIdleCallback) {
      idleWin.cancelIdleCallback(reinjectIdleHandle);
      reinjectIdleHandle = null;
    }
  }

  function scheduleReinject(): void {
    cancelPending();
    // PERF-13: debounce burst, then yield to idle frame so busy SPA pages
    // (e.g. infinite-scroll feeds) do not pay the check cost mid-render.
    reinjectTimer = setTimeout(function () {
      reinjectTimer = null;
      const run = function (): void {
        reinjectIdleHandle = null;
        log('SPA navigation detected - checking UI state', 'check');
        tryReinjectUI(createUI);
      };
      if (idleWin.requestIdleCallback) {
        reinjectIdleHandle = idleWin.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      } else {
        run();
      }
    }, REINJECT_DELAY_MS);
  }

  // MC-04 fix: Use childList-only (no subtree) on a narrow parent.
  const observer = new MutationObserver(function (_mutations: MutationRecord[]) {
    const isBothPresent = !!document.getElementById(IDS.SCRIPT_MARKER) && !!document.getElementById(IDS.CONTAINER);
    if (isBothPresent) return;
    scheduleReinject();
  });

  const observeTarget = document.querySelector('main') || document.querySelector('#root') || document.body;
  observer.observe(observeTarget, { childList: true });
  log('MutationObserver installed on ' + (observeTarget === document.body ? 'document.body' : observeTarget.tagName + (observeTarget.id ? '#' + observeTarget.id : '')) + ' (childList only) for UI persistence', 'success');

  document.addEventListener('visibilitychange', function () {
    const isVisible = document.visibilityState === 'visible';
    if (isVisible) {
      const isMissing = !document.getElementById(IDS.SCRIPT_MARKER) || !document.getElementById(IDS.CONTAINER);
      if (isMissing) {
        log('visibilitychange: UI missing — re-injecting', 'check');
        tryReinjectUI(createUI);
      }
    }
  });
}
