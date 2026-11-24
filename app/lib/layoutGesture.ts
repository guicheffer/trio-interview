import { stopFollowing } from './follow';

// A layout change counts as the person's own only while they drag a separator, press a key on it or use a collapse button.
// Only those are saved and shared; the sizes a panel settles on at load or after a window resize are not.
let holding = false;
let until = 0;

export function isLayoutGesture(): boolean {
  return holding || Date.now() < until;
}

/** A separator was grabbed: ends Follow and counts the layout changes until the pointer is released */
export function beginLayoutGesture() {
  stopFollowing();
  holding = true;
  const end = () => { holding = false; until = Date.now() + 1500; };
  window.addEventListener('pointerup', end, { once: true });
  window.addEventListener('pointercancel', end, { once: true });
}

/** A one off layout action (collapse button, keyboard on a separator, panel shortcut) */
export function pulseLayoutGesture() {
  stopFollowing();
  until = Date.now() + 1500;
}
