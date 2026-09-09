import { useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';
import { PROJECTS_TOOL, toOutcome } from '../lib/actions';

export function ProjectPreview({ projectId }: { projectId: string }) {
  const { run } = useAppTools();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await run(PROJECTS_TOOL, { action: 'preview', projectId });
      const outcome = toOutcome(result);
      if (!outcome.ok || typeof result.details?.url !== 'string') setError(outcome.text);
      else setUrl(result.details.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return <section className="ar-card" aria-label="Project preview">
    <Button disabled={busy} onClick={() => void open()}>{busy ? 'Starting preview…' : 'Open preview'}</Button>
    {error && <p role="alert" className="ar-error">{error}</p>}
    {url && <iframe title="Project preview" src={url} className="mt-3 h-[600px] w-full rounded-lg border" />}
  </section>;
}
