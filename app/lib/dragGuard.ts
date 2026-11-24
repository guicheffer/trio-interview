/**
 * The collapse button sits on the middle of a separator. A press that starts on it and is dragged away is a resize,
 * not a click, so the click that follows the release must not collapse the panel.
 */
export function createDragGuard(threshold = 4) {
  let start: { x: number; y: number } | null = null;
  return {
    down(e: { clientX: number; clientY: number }) {
      start = { x: e.clientX, y: e.clientY };
    },
    /** True when the pointer moved far enough since it went down to count as a drag */
    isDrag(e: { clientX: number; clientY: number }): boolean {
      const from = start;
      start = null;
      return !!from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > threshold;
    },
  };
}
