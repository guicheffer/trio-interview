'use client';

import { useEffect, useState } from 'react';
import { collab } from '../lib/collab';

/** Whether the live link with the other screen (presence socket) is up */
export function useCollabOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(collab.isOpen());
    return collab.on('status', msg => setOpen(!!msg.open));
  }, []);
  return open;
}
