'use client';

import { useEffect, useState } from 'react';
import { hydrateFromServer, startPushing } from '../lib/uiStateSync';
import { startKvSync } from '../lib/kvSync';

/** Returns the baseKey only after the server side state has been merged into localStorage. */
export function useUiStateSync(candidateName: string | undefined, exerciseId: string): string | undefined {
  const rawKey = candidateName ? `${candidateName}_${exerciseId}` : undefined;
  const [hydratedKey, setHydratedKey] = useState<string | undefined>();

  useEffect(() => {
    if (!candidateName || !rawKey) return;
    let stopPush: (() => void) | undefined;
    let stopLive: (() => void) | undefined;
    let cancelled = false;
    hydrateFromServer(candidateName, exerciseId, rawKey).then(() => {
      if (cancelled) return;
      setHydratedKey(rawKey);
      stopPush = startPushing(candidateName, exerciseId, rawKey);
      stopLive = startKvSync(rawKey, candidateName);
    });
    return () => { cancelled = true; stopPush?.(); stopLive?.(); };
  }, [candidateName, exerciseId, rawKey]);

  return hydratedKey === rawKey ? rawKey : undefined;
}
