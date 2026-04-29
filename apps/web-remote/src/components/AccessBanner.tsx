import { Button } from '@sero-ai/ui/components/ui/button';
import { AlertCircle, Shield, X } from 'lucide-react';

import {
  describeGatewayScope,
  humanizeGatewayRequestError,
} from '@/lib/gateway-errors';
import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';

export function AccessBanner() {
  const requestError = useConnectionStore((s) => s.requestError);
  const clearRequestError = useConnectionStore((s) => s.clearRequestError);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const scope = describeGatewayScope(workspaces, activeWorkspaceId);
  const error = requestError
    ? humanizeGatewayRequestError(requestError, workspaces, activeWorkspaceId)
    : null;

  if (!scope && !error) {
    return null;
  }

  return (
    <div className="border-b border-border bg-card/95 px-3 py-2">
      <div className="flex flex-col gap-2">
        {scope && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-background/70 px-3 py-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{scope.title}</p>
              <p className="text-xs text-muted-foreground">{scope.detail}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{error.title}</p>
              <p className="text-xs text-muted-foreground">{error.detail}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={clearRequestError}
              title="Dismiss message"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
