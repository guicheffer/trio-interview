import type { KeyboardEvent, MouseEvent } from 'react';

/** Enter or Space on the element itself does what a click does, so a clickable div works from the keyboard */
export function activateOnKey(handler: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}

/** Props for a modal backdrop: a click on the backdrop itself (not the dialog on top of it) or Escape closes it */
export function backdropProps(onClose: () => void) {
  return {
    role: 'presentation' as const,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') onClose();
    },
  };
}
