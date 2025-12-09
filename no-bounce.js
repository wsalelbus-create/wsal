/*
 * no-bounce.js
 * Prevent iOS/Safari rubber-band overscroll at the viewport level
 * while allowing scroll inside specified containers and preserving map gestures.
 */
(function () {
  const ALLOW_SELECTORS = [
    '.arrivals-panel',
    '.station-list',
    '#routes-list',
    '.modal-content',
    '#station-modal'
  ];

  function closestAllowed(el) {
    if (!el) return null;
    return el.closest(ALLOW_SELECTORS.join(', '));
  }

  function canScroll(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    const scrollable = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight;
    return scrollable;
  }

  function clampAtEdges(el) {
    if (!el) return;
    el.addEventListener('touchstart', function () {
      // Nudge the scroll position so we never hit the true top/bottom,
      // which would otherwise trigger viewport bounce on older iOS.
      if (el.scrollTop <= 0) {
        el.scrollTop = 1;
      } else if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
        el.scrollTop = el.scrollTop - 1;
      }
    }, { passive: true });
  }

  function init() {
    // Clamp known internal scroll containers
    document.querySelectorAll('.arrivals-panel, .station-list, .modal-content').forEach(clampAtEdges);

    // Block viewport-level overscroll except within allowed, scrollable containers
    document.addEventListener('touchmove', function (e) {
      const target = e.target;
      const allowed = closestAllowed(target);
      if (allowed) {
        if (!canScroll(allowed)) {
          // Container isn't scrollable (or content shorter than height) => prevent bounce
          e.preventDefault();
          return;
        }
        // Scrollable container: allow; clampAtEdges will avoid hitting viewport
        return;
      }

      // Not in any allowed area → prevent viewport bounce
      e.preventDefault();
    }, { passive: false });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
