import { useMemo } from 'react';
import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { AlertCircle, LifeBuoy, RefreshCw, Stethoscope, X } from 'lucide-react';
import type { McpDiagnosticsState } from '../../hooks/useMcpDiagnostics';

export function McpDiagnosticsPanel({ state }: { state: McpDiagnosticsState }) {
  const promptAgent = useAgentPrompt();
  const helpPrompt = useMemo(() => buildMcpHelpPrompt(state.diagnostics), [state.diagnostics]);

  if (!state.isOpen) return null;

  return (
    <Card className="animate-mcp-fade-in py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Diagnostics
            </CardTitle>
            <CardDescription>
              Friendly UI by default, technical detail on demand. Use this when a server is misconfigured or auth/viewer behavior looks wrong.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={state.close}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void state.refresh()} disabled={state.loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)} disabled={!state.diagnostics}>
              <LifeBuoy className="mr-2 h-4 w-4" />
              Ask Sero to help
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Diagnostics load error</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/20 p-4 text-xs leading-6 text-muted-foreground">
          {state.loading ? 'Loading diagnostics…' : state.diagnostics || 'No diagnostics available yet.'}
        </pre>
      </CardContent>
    </Card>
  );
}

function buildMcpHelpPrompt(diagnostics: string): string {
  return [
    'Help me troubleshoot the MCP plugin in Sero.',
    'Focus on the current MCP diagnostics below and suggest the most likely issue plus next steps.',
    '',
    diagnostics || 'No diagnostics were available.',
  ].join('\n');
}

export default McpDiagnosticsPanel;
