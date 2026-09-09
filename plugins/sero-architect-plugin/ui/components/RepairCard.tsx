import { useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';

import { PROJECTS_TOOL, toOutcome } from '../lib/actions';

interface Candidate { id: string; title: string; status: string }

export function RepairCard({ projectId }: { projectId: string }) {
  const { run } = useAppTools();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const repair = async (workflowId?: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await run(PROJECTS_TOOL, { action: 'repair', projectId, ...(workflowId ? { workflowId } : {}) });
      setMessage(toOutcome(result).text);
      const raw = result.details?.candidates;
      setCandidates(Array.isArray(raw) ? raw.filter((item): item is Candidate =>
        typeof item === 'object' && item !== null && typeof item.id === 'string'
        && typeof item.title === 'string' && typeof item.status === 'string') : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ar-card" aria-label="Fix disconnected workflow">
      <h3 className="ar-q">Reconnect the existing work</h3>
      <p className="ar-why">Check this workspace for an existing workflow. Nothing will restart automatically.</p>
      <Button disabled={busy} onClick={() => void repair()}>{busy ? 'Checking…' : 'Try to fix'}</Button>
      {message && <p role="status" className="ar-why mt-3">{message}</p>}
      {candidates.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 mt-3">
          <div><b>{item.title}</b><p className="ar-why">{item.status} · {item.id}</p></div>
          <Button variant="outline" disabled={busy} onClick={() => void repair(item.id)}>Reconnect</Button>
        </div>
      ))}
    </section>
  );
}
