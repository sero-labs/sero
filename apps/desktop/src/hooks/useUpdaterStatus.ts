import { useEffect, useState } from 'react';
import type { UpdaterStatusEvent } from '@/types/ipc';

/** Subscribe to auto-update status pushed from the main process. */
export function useUpdaterStatus(): UpdaterStatusEvent {
  const [status, setStatus] = useState<UpdaterStatusEvent>({ state: 'idle' });

  useEffect(() => {
    let active = true;
    void window.sero.updater.getStatus().then((s) => {
      if (active) setStatus(s);
    });
    const unsubscribe = window.sero.updater.onEvent((s) => setStatus(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}
