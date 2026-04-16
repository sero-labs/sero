import { useCallback, useEffect, useRef, useState } from 'react';
import { type SeroSessionInfo, getSero } from './host';
import { formatDate } from '../lib/format';

export interface SessionFileInfo extends SeroSessionInfo {
  sessionId: string;
  filename: string;
  dateLabel: string;
  name: string;
}

export function useSessionFiles() {
  const [sessions, setSessions] = useState<SessionFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSero().sessions.list();
      setSessions(sortSessionFiles(list.map(mapSessionFileInfo)));
    } catch (err) {
      console.error('[admin] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void reload();
    }
  }, [reload]);

  return { sessions, loading, reload };
}

function mapSessionFileInfo(session: SeroSessionInfo): SessionFileInfo {
  return {
    ...session,
    sessionId: session.id,
    filename: session.path.split('/').pop() || session.id,
    dateLabel: formatDate(session.created),
    name: session.name || session.firstMessage || '',
  };
}

function sortSessionFiles(sessions: SessionFileInfo[]): SessionFileInfo[] {
  return [...sessions].sort((left, right) => right.created.localeCompare(left.created));
}
