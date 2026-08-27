import { cn } from '@sero-ai/ui/lib/utils';
import type { AgentNodeConnectionState } from '@/types/agent-node';

const CONNECTION_STYLES: Record<AgentNodeConnectionState, string> = {
  connected: 'bg-status-success',
  reconnecting: 'animate-pulse bg-status-warning',
  unreachable: 'bg-status-error',
  restarted: 'bg-status-warning',
  revoked: 'bg-status-error',
  'version-skew': 'bg-status-error',
};

export function NodeConnectionIndicator({ state }: { state: AgentNodeConnectionState }) {
  const label = state === 'version-skew' ? 'Version mismatch' : `${state[0]?.toUpperCase()}${state.slice(1)}`;
  return (
    <span
      aria-label={label}
      title={label}
      className={cn('size-2 shrink-0 rounded-full', CONNECTION_STYLES[state])}
    />
  );
}
