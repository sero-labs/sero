import { Button } from '@sero-ai/ui';
import { useProjectPreview } from '../lib/use-project-preview';
import { PreviewFrame } from './PreviewFrame';

export function ProjectPreview({ projectId }: { projectId: string }) {
  const preview = useProjectPreview(projectId);
  return <section className="ar-card" aria-label="Project preview">
    <Button disabled={preview.busy} onClick={() => void preview.open()}>{preview.busy ? 'Starting preview…' : 'Open preview'}</Button>
    {preview.error && <p role="alert" className="ar-error">{preview.error}</p>}
    {preview.url && <PreviewFrame url={preview.url} />}
  </section>;
}
