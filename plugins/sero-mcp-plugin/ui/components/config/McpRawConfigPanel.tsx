import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { AlertCircle, FileJson, Save, X } from 'lucide-react';
import type { McpRawConfigState } from '../../hooks/useMcpRawConfig';

export function McpRawConfigPanel({ state }: { state: McpRawConfigState }) {
  if (!state.isOpen) return null;

  return (
    <Card className="animate-mcp-fade-in border-border/75 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" />
              Raw MCP config
            </CardTitle>
            <CardDescription>
              Advanced editor for MCP config JSON. Unknown keys are preserved, and saving refreshes the shared MCP snapshot.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={state.close}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
            <Button type="button" size="sm" onClick={() => void state.save()} disabled={state.loading || state.saving}>
              <Save className="mr-2 h-4 w-4" />
              {state.saving ? 'Saving…' : 'Save config'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Config error</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <Textarea
          value={state.rawConfig}
          onChange={(event) => state.setRawConfig(event.target.value)}
          spellCheck={false}
          className="min-h-[24rem] font-mono text-xs"
          placeholder={state.loading ? 'Loading MCP config…' : '{\n  "settings": {},\n  "mcpServers": {}\n}'}
        />
      </CardContent>
    </Card>
  );
}

export default McpRawConfigPanel;
