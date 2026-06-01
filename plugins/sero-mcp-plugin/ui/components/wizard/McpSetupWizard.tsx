import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@sero-ai/ui/components/ui/native-select';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, ArrowRight, Globe, HardDriveDownload, Save, Sparkles, Terminal } from 'lucide-react';
import type { McpServerEditorInput, McpSettingsSnapshot, McpTransport } from '../../../shared/types';
import { createEmptyServerEditorInput, validateServerEditorInput } from '../../../shared/types';
import { useMcpServerMutations } from '../../hooks/useMcpServerMutations';

interface McpSetupWizardProps {
  configPath: string | null;
  settings: McpSettingsSnapshot;
  onCreated?: (serverName: string) => void;
}

interface McpWizardPreset {
  id: string;
  transport: McpTransport;
  label: string;
  summary: string;
  badge?: string;
  draft: McpServerEditorInput;
}

const WIZARD_PRESETS: McpWizardPreset[] = [
  {
    id: 'stdio-blank',
    transport: 'stdio',
    label: 'Blank stdio server',
    summary: 'Start from scratch with a local command and arguments.',
    draft: createPresetDraft({ transport: 'stdio' }),
  },
  {
    id: 'stdio-filesystem',
    transport: 'stdio',
    label: 'Filesystem example',
    summary: 'A practical local server for browsing files in a project folder.',
    badge: 'example',
    draft: createPresetDraft({
      transport: 'stdio',
      serverName: 'filesystem',
      command: 'npx',
      argsText: '-y\n@modelcontextprotocol/server-filesystem\n.',
      cwd: '.',
      lifecycle: 'keep-alive',
    }),
  },
  {
    id: 'stdio-github',
    transport: 'stdio',
    label: 'GitHub example',
    summary: 'A common remote API adapter that uses a bearer token env var.',
    badge: 'example',
    draft: createPresetDraft({
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
      argsText: '-y\n@modelcontextprotocol/server-github',
      authMode: 'bearer',
      bearerTokenEnv: 'GITHUB_TOKEN',
      lifecycle: 'eager',
    }),
  },
  {
    id: 'http-blank',
    transport: 'http',
    label: 'Blank HTTP/SSE server',
    summary: 'Start from scratch with a hosted MCP endpoint.',
    draft: createPresetDraft({ transport: 'http', authMode: 'none' }),
  },
  {
    id: 'http-oauth',
    transport: 'http',
    label: 'Hosted OAuth example',
    summary: 'A good default when the server authenticates in-browser.',
    badge: 'recommended',
    draft: createPresetDraft({
      transport: 'http',
      serverName: 'remote-oauth',
      url: 'https://example.com/mcp',
      authMode: 'oauth',
      lifecycle: 'eager',
    }),
  },
  {
    id: 'http-bearer',
    transport: 'http',
    label: 'Hosted bearer-token example',
    summary: 'A good fit for internal or vendor MCP endpoints that use env-based auth.',
    badge: 'example',
    draft: createPresetDraft({
      transport: 'http',
      serverName: 'internal-api',
      url: 'https://example.com/mcp',
      authMode: 'bearer',
      bearerTokenEnv: 'API_TOKEN',
      lifecycle: 'eager',
    }),
  },
];

export function McpSetupWizard({ configPath, settings, onCreated }: McpSetupWizardProps) {
  const mutations = useMcpServerMutations();
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [selectedPresetId, setSelectedPresetId] = useState('stdio-blank');
  const [draft, setDraft] = useState<McpServerEditorInput>(() => getPresetDraft('stdio-blank'));
  const validationError = useMemo(() => validateServerEditorInput(draft), [draft]);
  const transportPresets = useMemo(
    () => WIZARD_PRESETS.filter((preset) => preset.transport === transport),
    [transport],
  );

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setDraft(getPresetDraft(presetId));
  };

  const handleTransportChange = (nextTransport: McpTransport) => {
    setTransport(nextTransport);
    const nextPresetId = nextTransport === 'stdio' ? 'stdio-blank' : 'http-blank';
    setSelectedPresetId(nextPresetId);
    setDraft(getPresetDraft(nextPresetId));
  };

  return (
    <Card className="animate-mcp-fade-in border-border/75 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              First-run setup wizard
            </CardTitle>
            <CardDescription>
              Pick a transport, start from a blank config or a friendly example, then save your first MCP server without dropping into raw JSON.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StepBadge label="1. Choose transport" />
            <StepBadge label="2. Pick a starting point" />
            <StepBadge label="3. Save your first server" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(mutations.error || validationError) && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Wizard blocked</AlertTitle>
            <AlertDescription>{validationError ?? mutations.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
          <section className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Choose your server type</div>
                <p className="text-sm text-muted-foreground">
                  Use <strong>stdio</strong> for a local command you launch from this machine, or <strong>HTTP/SSE</strong> for a hosted MCP endpoint.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <TransportButton
                  active={transport === 'stdio'}
                  icon={Terminal}
                  title="stdio"
                  body="Launch a local command like npx, uvx, or a checked-in project script."
                  onClick={() => handleTransportChange('stdio')}
                />
                <TransportButton
                  active={transport === 'http'}
                  icon={Globe}
                  title="HTTP / SSE"
                  body="Connect to a hosted MCP service over http or https, with OAuth or bearer auth if needed."
                  onClick={() => handleTransportChange('http')}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Choose a starting point</div>
                <p className="text-sm text-muted-foreground">
                  Blank presets keep things simple. Example presets are safe starting templates you can edit before saving.
                </p>
              </div>
              <div className="space-y-2">
                {transportPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      selectedPresetId === preset.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                    )}
                    onClick={() => applyPreset(preset.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{preset.label}</span>
                      {preset.badge && <Badge variant="secondary">{preset.badge}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{preset.summary}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">What happens next?</div>
              <ul className="mt-2 space-y-2 leading-6">
                <li>• Your config lives at <span className="font-mono text-foreground">{configPath ?? 'pending bootstrap'}</span>.</li>
                <li>• New servers start with an idle timeout of <strong>{settings.idleTimeout} minutes</strong>.</li>
                <li>• You can fine-tune lifecycle, auth, raw config, and diagnostics after this first save.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HardDriveDownload className="size-4 text-primary" />
              Guided server draft
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Server name">
                <Input value={draft.serverName} onChange={(event) => setDraft({ ...draft, serverName: event.target.value })} placeholder={transport === 'stdio' ? 'filesystem' : 'remote-oauth'} />
              </Field>
              <Field label="Lifecycle">
                <NativeSelect value={draft.lifecycle} onChange={(event) => setDraft({ ...draft, lifecycle: event.target.value as McpServerEditorInput['lifecycle'] })} className="w-full">
                  <NativeSelectOption value="lazy">lazy</NativeSelectOption>
                  <NativeSelectOption value="eager">eager</NativeSelectOption>
                  <NativeSelectOption value="keep-alive">keep-alive</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field label="Auth mode">
                <NativeSelect value={draft.authMode} onChange={(event) => setDraft({ ...draft, authMode: event.target.value as McpServerEditorInput['authMode'] })} className="w-full">
                  <NativeSelectOption value="none">none</NativeSelectOption>
                  <NativeSelectOption value="oauth">oauth</NativeSelectOption>
                  <NativeSelectOption value="bearer">bearer</NativeSelectOption>
                </NativeSelect>
              </Field>
              {draft.authMode === 'bearer' && (
                <Field label="Bearer token env var">
                  <Input value={draft.bearerTokenEnv} onChange={(event) => setDraft({ ...draft, bearerTokenEnv: event.target.value })} placeholder="GITHUB_TOKEN" />
                </Field>
              )}
            </div>

            {transport === 'stdio' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Command">
                  <Input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} placeholder="npx" />
                </Field>
                <Field label="Working directory (optional)">
                  <Input value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                </Field>
                <Field label="Args (one per line)" className="md:col-span-2">
                  <Textarea
                    value={draft.argsText}
                    onChange={(event) => setDraft({ ...draft, argsText: event.target.value })}
                    className="min-h-32 font-mono text-xs leading-6"
                    placeholder="-y\n@modelcontextprotocol/server-filesystem\n."
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Server URL" className="md:col-span-2">
                  <Input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com/mcp" />
                </Field>
                <Field label="Working directory (optional)">
                  <Input value={draft.cwd} onChange={(event) => setDraft({ ...draft, cwd: event.target.value })} placeholder="/path/to/project" />
                </Field>
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground md:col-span-2">
                  Hosted servers often work best with <strong>OAuth</strong> or <strong>bearer</strong> auth and an <strong>eager</strong> lifecycle so metadata is available soon after startup.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-4">
              <p className="max-w-2xl text-sm text-muted-foreground">
                Save this starter server now, then use the full server panel below for advanced edits, reconnects, raw config inspection, diagnostics, and Ask-Sero recovery.
              </p>
              <Button
                type="button"
                onClick={async () => {
                  const ok = await mutations.upsertServer(draft);
                  if (ok) {
                    onCreated?.(draft.serverName.trim());
                  }
                }}
                disabled={mutations.pendingAction === 'save' || !!validationError}
              >
                <Save className="mr-2 size-4" />
                Save first server
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function TransportButton({
  active,
  icon: Icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: typeof Terminal;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-lg border p-4 text-left transition-colors',
        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Icon className="size-4 text-primary" />
        {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </button>
  );
}

function StepBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
      {label}
    </Badge>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('space-y-2 text-sm text-muted-foreground', className)}>
      <Label className="text-foreground">{label}</Label>
      {children}
    </label>
  );
}

function getPresetDraft(presetId: string): McpServerEditorInput {
  return { ...findPreset(presetId).draft };
}

function findPreset(presetId: string): McpWizardPreset {
  return WIZARD_PRESETS.find((preset) => preset.id === presetId) ?? WIZARD_PRESETS[0]!;
}

function createPresetDraft(input: Partial<McpServerEditorInput> & { transport: McpTransport }): McpServerEditorInput {
  const base = createEmptyServerEditorInput();
  return {
    ...base,
    authMode: input.transport === 'http' ? 'oauth' : 'none',
    lifecycle: input.transport === 'http' ? 'eager' : 'lazy',
    ...input,
  };
}

export default McpSetupWizard;
