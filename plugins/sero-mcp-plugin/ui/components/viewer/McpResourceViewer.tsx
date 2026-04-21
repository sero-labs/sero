import { Badge } from '@sero-ai/ui/components/ui/badge';
import { cn } from '@sero-ai/ui/lib/utils';
import type { McpResourcePreview } from '../../../shared/types';
import type { McpViewerKind } from '../../hooks/useMcpViewer';

export function McpResourceViewer({
  preview,
  loading,
  kind,
}: {
  preview: McpResourcePreview | null;
  loading: boolean;
  kind: Exclude<McpViewerKind, 'auth'>;
}) {
  if (loading && !preview) {
    return <ViewerPlaceholder body="Loading MCP content…" />;
  }

  if (!preview) {
    return (
      <ViewerPlaceholder
        body={
          kind === 'tool-ui'
            ? 'Launch a UI-capable tool or open an advertised MCP UI resource to render it here.'
            : 'Select a discovered resource to preview it here.'
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <ToneBadge label={kind === 'tool-ui' ? 'tool ui' : preview.previewKind} tone="muted" />
        {kind === 'tool-ui' && <ToneBadge label={preview.previewKind} tone="muted" />}
        <ToneBadge label={preview.mimeType ?? 'unknown mime'} tone="muted" />
        <span className="rounded-full border border-border bg-background px-2 py-0.5">{preview.resolvedUri}</span>
        {preview.truncated && <ToneBadge label="preview truncated" tone="warning" />}
      </div>

      {kind === 'tool-ui' && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
          This UI is currently rendered from the tool&apos;s advertised MCP resource. Full AppBridge-backed interactive hosting is a larger follow-on slice.
        </div>
      )}

      {preview.previewKind === 'html' ? (
        <iframe
          title={preview.resolvedUri}
          srcDoc={preview.html ?? ''}
          sandbox="allow-scripts allow-forms"
          className="h-[520px] w-full rounded-lg border border-border bg-white"
        />
      ) : preview.previewKind === 'image' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-background p-3">
          {preview.dataUrl ? (
            <img src={preview.dataUrl} alt={preview.resolvedUri} className="max-h-[520px] w-full object-contain" />
          ) : (
            <ViewerPlaceholder body="This image resource did not return a renderable payload." compact />
          )}
        </div>
      ) : preview.previewKind === 'binary' ? (
        <ViewerPlaceholder body="This resource returned binary content that cannot be previewed inline yet." compact />
      ) : (
        <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
          {preview.text || '(empty resource)'}
        </pre>
      )}
    </div>
  );
}

function ViewerPlaceholder({ body, compact = false }: { body: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground',
        compact ? 'min-h-[180px]' : 'min-h-[280px]',
      )}
    >
      <div className="max-w-md">{body}</div>
    </div>
  );
}

function ToneBadge({ label, tone }: { label: string; tone: 'warning' | 'muted' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'muted' && 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

export default McpResourceViewer;
