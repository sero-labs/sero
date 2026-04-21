import { useAgentPrompt } from '@sero-ai/app-runtime';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Label } from '@sero-ai/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@sero-ai/ui/components/ui/native-select';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LifeBuoy, Play, RefreshCw, Wrench, X } from 'lucide-react';
import type { McpServerSnapshot } from '../../../shared/types';
import { useMcpToolRunner } from '../../hooks/useMcpToolRunner';

export function McpServerToolRunnerPanel({
  server,
  onOpenResource,
}: {
  server: McpServerSnapshot;
  onOpenResource: (resourceUri: string) => void;
}) {
  const promptAgent = useAgentPrompt();
  const toolRunner = useMcpToolRunner(server.serverName);
  const selectedTool = toolRunner.selectedTool;
  const helpPrompt = buildToolHelpPrompt(server, toolRunner.error, selectedTool?.name ?? null);

  return (
    <Card className="border-border/70 bg-muted/15 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              Tool runner
            </CardTitle>
            <CardDescription>
              Use the single bridged MCP proxy to inspect cached tools, review a selected schema, and execute a tool with structured JSON input.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void toolRunner.refresh()} disabled={toolRunner.loadingInventory || toolRunner.loadingDetails || toolRunner.running}>
            <RefreshCw className={cn('mr-2 h-4 w-4', (toolRunner.loadingInventory || toolRunner.loadingDetails) && 'animate-spin')} />
            Refresh tools
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {toolRunner.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Tool execution problem</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{toolRunner.error}</p>
              <Button type="button" size="sm" onClick={() => promptAgent(helpPrompt)}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Ask Sero to help
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {toolRunner.tools.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            No cached tools are available for this server yet. Connect or reconnect the server to refresh MCP tool metadata.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={`mcp-tool-select-${server.serverName}`}>MCP tool</Label>
              <NativeSelect
                id={`mcp-tool-select-${server.serverName}`}
                value={toolRunner.selectedToolName}
                onChange={(event) => void toolRunner.selectTool(event.target.value)}
                disabled={toolRunner.loadingInventory || toolRunner.loadingDetails || toolRunner.running}
                className="w-full"
              >
                {toolRunner.tools.map((tool) => (
                  <NativeSelectOption key={tool.name} value={tool.name}>
                    {tool.name}{tool.uiResourceUri ? ' · UI' : ''}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {selectedTool?.description && <p className="text-sm text-muted-foreground">{selectedTool.description}</p>}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`mcp-tool-input-${server.serverName}`}>Tool input JSON</Label>
                  <div className="flex gap-2">
                    {toolRunner.result?.uiResourceUri && (
                      <Button type="button" size="sm" variant="outline" onClick={() => onOpenResource(toolRunner.result!.uiResourceUri!)}>
                        Open advertised UI
                      </Button>
                    )}
                    <Button type="button" size="sm" onClick={() => void toolRunner.runTool()} disabled={toolRunner.running || toolRunner.loadingDetails}>
                      <Play className="mr-2 h-4 w-4" />
                      {toolRunner.running ? 'Running…' : 'Run tool'}
                    </Button>
                  </div>
                </div>
                <Textarea
                  id={`mcp-tool-input-${server.serverName}`}
                  value={toolRunner.inputText}
                  onChange={(event) => toolRunner.setInputText(event.target.value)}
                  spellCheck={false}
                  className="min-h-[220px] font-mono text-xs leading-6"
                  placeholder="{}"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Input schema</Label>
                  <pre className="max-h-[220px] overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
                    {formatUnknown(toolRunner.inputSchema ?? '(no schema reported)')}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Last result</Label>
                    {toolRunner.result && (
                      <Button type="button" variant="outline" size="sm" onClick={toolRunner.clearResult}>
                        <X className="mr-2 h-4 w-4" />
                        Clear result
                      </Button>
                    )}
                  </div>
                  <pre className="max-h-[260px] overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
                    {toolRunner.result ? toolRunner.result.text : 'Run a tool to inspect its latest bridged result here.'}
                  </pre>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildToolHelpPrompt(server: McpServerSnapshot, error: string | null, toolName: string | null): string {
  return [
    `Help me troubleshoot MCP tool execution for server "${server.serverName}" in Sero.`,
    `Connection status: ${server.connectionStatus}`,
    `Auth status: ${server.authStatus}`,
    toolName ? `Selected tool: ${toolName}` : 'No tool is currently selected.',
    '',
    error ?? 'Explain the most likely next checks and recovery steps.',
  ].join('\n');
}

export default McpServerToolRunnerPanel;
