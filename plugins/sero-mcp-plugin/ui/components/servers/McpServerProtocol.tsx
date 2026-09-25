import { Alert, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { AlertCircle, PlugZap, TriangleAlert } from 'lucide-react';
import type { McpFailurePhase, McpServerSnapshot } from '../../../shared/types';

const PHASE_LABELS: Record<McpFailurePhase, string> = {
  discovery: 'Discovery',
  'legacy-fallback': 'Legacy handshake',
  auth: 'Sign-in',
  extension: 'Extension setup',
  app: 'App loading',
  task: 'Task tracking',
  skill: 'Skill loading',
};

const EXTENSION_LABELS: Record<string, string> = {
  'io.modelcontextprotocol/ui': 'MCP Apps',
  'io.modelcontextprotocol/tasks': 'Tasks',
  'io.modelcontextprotocol/skills': 'Skills',
};

const INFO_BADGE = 'border-sky-500/30 bg-sky-500/10 text-sky-300';
const WARNING_BADGE = 'border-amber-500/30 bg-amber-500/10 text-amber-300';
const ERROR_BADGE = 'border-red-500/30 bg-red-500/10 text-red-300';

/** Badges for the server row. Only a protocol revision or a problem gets a badge. */
export function McpServerProtocolBadges({ server }: { server: McpServerSnapshot }) {
  const { protocol, failurePhase } = server;
  return (
    <>
      {protocol?.version && (
        <Badge variant="outline" className={protocol.era === 'modern' ? INFO_BADGE : undefined}>
          {protocol.era === 'legacy' ? `${protocol.version} · legacy` : protocol.version}
        </Badge>
      )}
      {protocol?.deprecatedTransport && <Badge variant="outline" className={WARNING_BADGE}>SSE, deprecated</Badge>}
      {failurePhase && <Badge variant="outline" className={ERROR_BADGE}>{PHASE_LABELS[failurePhase]} failed</Badge>}
    </>
  );
}

export function McpServerProtocolCard({ server }: { server: McpServerSnapshot }) {
  const { protocol, failurePhase, cache } = server;
  const revision = protocol?.version
    ? `${protocol.version}${protocol.era === 'legacy' ? ', legacy handshake' : ''}`
    : 'Not connected';
  const transport = server.transport === 'stdio' ? 'stdio' : protocol?.deprecatedTransport ? 'SSE' : 'Streamable HTTP';

  return (
    <Card className="border-border/70 bg-card py-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZap className="size-4 text-primary" />
          Protocol
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failurePhase && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>{PHASE_LABELS[failurePhase]} failed</AlertTitle>
          </Alert>
        )}
        {protocol?.deprecatedTransport && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-300">
            <TriangleAlert className="size-4" />
            <AlertTitle>Ask the server owner for a Streamable HTTP URL. SSE is deprecated.</AlertTitle>
          </Alert>
        )}
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Protocol</dt>
          <dd>{revision}</dd>
          <dt className="text-muted-foreground">Extensions</dt>
          <dd className="flex flex-wrap gap-1.5">
            {protocol?.extensions.length
              ? protocol.extensions.map((id) => (
                  <Badge key={id} variant="outline" className={INFO_BADGE}>{EXTENSION_LABELS[id] ?? id}</Badge>
                ))
              : 'None'}
          </dd>
          <dt className="text-muted-foreground">Transport</dt>
          <dd>{transport}</dd>
          <dt className="text-muted-foreground">Metadata cache</dt>
          <dd>{describeCache(cache)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function describeCache(cache: McpServerSnapshot['cache']): string {
  if (!cache || cache.state === 'none' || !cache.cachedAt) return 'Empty';
  if (cache.state === 'stale') return 'Stale, refreshed on next use';
  return cache.expiresAt
    ? `Fresh until ${new Date(cache.expiresAt).toLocaleTimeString()}`
    : 'Kept until the server reports a change';
}
