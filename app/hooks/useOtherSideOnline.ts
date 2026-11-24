'use client';

import { useEffect, useState } from 'react';
import { collab } from '../lib/collab';

/** Whether someone of the other role (the candidate for an interviewer, the interviewer for a candidate) is in the room */
export function useOtherSideOnline(): boolean {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const read = () => {
      const other = collab.role === 'interviewer' ? 'candidate' : 'interviewer';
      setOnline(!!collab.role && (collab.roster[other] ?? 0) > 0);
    };
    read();
    const offRoster = collab.on('roster', read);
    const offHello = collab.on('hello', read);
    return () => { offRoster(); offHello(); };
  }, []);
  return online;
}
