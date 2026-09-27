/**
 * Save-recall eval: does the chat agent save a memory at the right moments?
 *
 * Plays a fixed conversation, one user turn at a time, in a real Pi session
 * with the real memory plugin. As in the app, the model reaches memory only
 * through `sero memory ...` on the `sero-cli` tool. After the last turn it
 * reads the saved entry files and returns them; the test assertion scores the
 * saved and missed moments and the noise saves.
 *
 * Makes model calls. Set `model` in the provider config (see promptfoo-memory-save.yaml).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';
import { Type } from '@sinclair/typebox';
import type { AgentSession, ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { globalLocation, listAllEntries, workspaceLocation } from '../plugins/sero-memory-plugin/extension/entry-store';
import { getIdentityPath, getUserPath, resolveMemoryRoot } from '../plugins/sero-memory-plugin/extension/memory-manager';

const MEMORY_EXTENSION_PATH = fileURLToPath(new URL('../plugins/sero-memory-plugin/extension/index.ts', import.meta.url));
const USER_AGENT_DIR = process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;
const TURN_TIMEOUT_MS = 180_000;

interface MemorySaveConfig {
  /** `provider/model`, for example `deepseek/deepseek-v4-flash`. Required. */
  model?: string;
}

export interface SavedEntry {
  id: string;
  scope: string;
  delivery: string;
  type: string;
  terms: string[];
  body: string;
}

interface SchemaProp {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enumValues?: string[];
}

function schemaProps(tool: ToolDefinition): SchemaProp[] {
  const schema = tool.parameters as unknown as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => ({
    name,
    type: typeof prop.type === 'string' ? prop.type : 'string',
    description: typeof prop.description === 'string' ? prop.description : '',
    required: required.has(name),
    enumValues: Array.isArray(prop.enum) ? prop.enum.map(String) : undefined,
  }));
}

/** The desktop CLI's `parseFlags` (apps/desktop/electron/cli/lib/utils.ts), which cannot load outside the app. */
function parseFlags(args: string[]): { positionals: string[]; flags: Map<string, string | true> } {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const keyValue = token.slice(2);
    if (!keyValue) continue;
    const eqIdx = keyValue.indexOf('=');
    if (eqIdx !== -1) {
      flags.set(keyValue.slice(0, eqIdx), keyValue.slice(eqIdx + 1));
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(keyValue, next);
      i++;
    } else {
      flags.set(keyValue, true);
    }
  }
  return { positionals, flags };
}

/** Same mapping as the app's CLI bridge: flags by name, then positionals to the unset props, required first. */
function tokensToParams(tokens: string[], props: SchemaProp[]): Record<string, unknown> {
  const { positionals, flags } = parseFlags(tokens);
  const params: Record<string, unknown> = {};
  const coerce = (value: string | true, prop: SchemaProp): unknown => {
    if (value === true) return true;
    if (prop.type === 'boolean') return value === 'true' || value === '1';
    if (prop.type === 'number' || prop.type === 'integer') return Number.isFinite(Number(value)) ? Number(value) : value;
    return value;
  };
  for (const [key, value] of flags) {
    const prop = props.find((entry) => entry.name === key);
    if (prop) params[prop.name] = coerce(value, prop);
  }
  const unset = props.filter((prop) => !(prop.name in params));
  const ordered = [...unset.filter((prop) => prop.required), ...unset.filter((prop) => !prop.required)];
  positionals.forEach((value, i) => {
    const prop = ordered[i];
    if (prop) params[prop.name] = coerce(value, prop);
  });
  return params;
}

/** Same layout as the app's `sero <tool> --help`. */
function toolHelp(tool: ToolDefinition, props: SchemaProp[]): string {
  const required = props.filter((prop) => prop.required);
  const optional = props.filter((prop) => !prop.required);
  const usage = required.map((prop) => `<${prop.name}>`).concat(optional.map((prop) => `[--${prop.name} <value>]`));
  const lines = [`${tool.name} — ${tool.description}`, '', 'Usage:', `  sero ${tool.name} ${usage.join(' ')}`];
  if (required.length) {
    lines.push('', 'Required:');
    for (const prop of required) {
      lines.push(`  ${prop.name}${prop.enumValues ? ` {${prop.enumValues.join(', ')}}` : ''} — ${prop.description || prop.name}`);
    }
  }
  if (optional.length) {
    lines.push('', 'Options:');
    for (const prop of optional) {
      lines.push(`  --${prop.name}${prop.type !== 'string' ? ` (${prop.type})` : ''} — ${prop.description || prop.name}`);
    }
  }
  return lines.join('\n');
}

function tokenize(line: string): string[] {
  const matches = line.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return matches.map((token) => {
    const quoted = (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"));
    return quoted ? token.slice(1, -1).replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n') : token;
  });
}

async function runMemoryCommand(session: AgentSession, line: string): Promise<{ text: string; ok: boolean }> {
  const tokens = tokenize(line);
  if (tokens[0] === 'sero') tokens.shift();
  const [root, ...rest] = tokens;
  const helpFor = root === 'help' ? rest[0] : undefined;
  const name = helpFor ?? root;
  const runner = session.extensionRunner;
  const tool = name === 'memory' || name === 'scratchpad' ? runner.getToolDefinition(name) : undefined;
  if (!tool) {
    return root === 'help' && !helpFor
      ? { ok: true, text: 'Available commands:\n  memory — long-term memory\n  scratchpad — open items for this workspace' }
      : { ok: false, text: `ERROR: Unknown command: ${tokens.join(' ')}` };
  }
  const props = schemaProps(tool);
  if (helpFor || rest.includes('--help') || rest[0] === 'help') return { ok: true, text: toolHelp(tool, props) };
  try {
    const result = await tool.execute('eval-cli', tokensToParams(rest, props) as never, undefined, undefined, runner.createContext());
    const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
    return { ok: !text.startsWith('Error'), text };
  } catch (err) {
    return { ok: false, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The `sero-cli` model tool, with only the memory commands. */
function createMemoryCli(getSession: () => AgentSession | null, commands: string[]): ToolDefinition {
  return {
    name: 'sero-cli',
    label: 'Sero CLI',
    description: 'Execute Sero platform commands. Supports multi-line input to chain commands (one per line).',
    parameters: Type.Object({
      command: Type.String({ description: 'CLI command text to execute' }),
      timeout: Type.Optional(Type.Number({ description: 'Optional timeout in seconds' })),
    }),
    execute: async (_toolCallId: string, params: { command: string }) => {
      const session = getSession();
      const lines = params.command.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const sections: string[] = [];
      for (const line of lines) {
        commands.push(line);
        const result = session ? await runMemoryCommand(session, line) : { ok: false, text: 'ERROR: session not ready' };
        sections.push(lines.length === 1 ? result.text : `$ ${line}\n${result.text}`);
        if (!result.ok) break;
      }
      return { content: [{ type: 'text' as const, text: sections.join('\n\n') || 'ERROR: No command provided' }], details: {} };
    },
  };
}

/** The app's `## Sero CLI` block, cut to the memory commands. */
function cliPromptExtension(pi: ExtensionAPI): void {
  pi.on('before_agent_start', async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n## Sero CLI\n\nUse \`sero-cli\` for Sero platform actions instead of asking the user to do them manually.\n\n`
      + '- `memory` — long-term memory\n- `scratchpad` — open items for this workspace\n\n'
      + 'Run `sero help <command>` for details. Chain multiple commands (one per line).\n',
  }));
}

async function readSavedEntries(workspace: string): Promise<SavedEntry[]> {
  const groups = await Promise.all([globalLocation(), workspaceLocation(workspace)].map(listAllEntries));
  return groups.flat().map((entry) => ({
    id: entry.id,
    scope: entry.scope,
    delivery: entry.delivery,
    type: entry.type,
    terms: entry.terms,
    body: entry.body,
  }));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export default class MemorySaveProvider implements ApiProvider {
  config: MemorySaveConfig;

  constructor(opts: { config?: MemorySaveConfig } = {}) {
    this.config = opts.config ?? {};
  }

  id(): string {
    return `sero:memory-save:${this.config.model ?? 'unset'}`;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const conversation = context?.vars?.conversation;
    const turns = typeof conversation === 'string'
      ? conversation.split(/^---$/m).map((turn) => turn.trim()).filter(Boolean)
      : [];
    if (turns.length === 0) return { error: 'vars.conversation must hold user turns separated by a `---` line' };
    if (!this.config.model) return { error: 'Set config.model; this eval makes model calls' };

    const sdk = await import('@earendil-works/pi-coding-agent');
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-save-eval-'));
    const previous = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
    const seroHome = path.join(root, 'profile');
    const agentDir = path.join(seroHome, 'agent');
    const workspace = path.join(root, 'project');
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    let session: AgentSession | null = null;
    const commands: string[] = [];

    try {
      const memoryRoot = resolveMemoryRoot();
      await mkdir(memoryRoot, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await mkdir(agentDir, { recursive: true });
      // A finished onboarding, so the session starts with memory, not setup.
      await writeFile(getIdentityPath(memoryRoot), '# Identity\n\n- **Name:** Sero\n- **Style:** Concise and direct\n');
      await writeFile(getUserPath(memoryRoot), '# User\n\n- **Role:** Software developer\n');

      const modelRuntime = await sdk.ModelRuntime.create({
        authPath: path.join(USER_AGENT_DIR, 'auth.json'),
        modelsPath: path.join(USER_AGENT_DIR, 'models.json'),
        refreshOnCreate: false,
      });
      const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (deepseekKey) await modelRuntime.setRuntimeApiKey('deepseek', deepseekKey);
      const model = modelRuntime.getModels().find((m) => `${m.provider}/${m.id}` === this.config.model);
      if (!model) return { error: `Model ${this.config.model} is not available. Check its login or API key.` };

      const settingsManager = sdk.SettingsManager.create(workspace, agentDir);
      const loader = new sdk.DefaultResourceLoader({
        cwd: workspace,
        agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        additionalExtensionPaths: [MEMORY_EXTENSION_PATH],
        extensionFactories: [cliPromptExtension],
      });
      await loader.reload();

      const created = await sdk.createAgentSession({
        cwd: workspace,
        agentDir,
        modelRuntime,
        model,
        tools: ['sero-cli'],
        customTools: [createMemoryCli(() => session, commands)],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(workspace),
        settingsManager,
      });
      session = created.session;
      await session.bindExtensions({});

      for (const turn of turns) await withTimeout(session.prompt(turn), TURN_TIMEOUT_MS, 'turn');

      const saved = await readSavedEntries(workspace);
      return {
        output: JSON.stringify({ saved, commands }, null, 2),
        metadata: { saved, commands, model: this.config.model },
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), metadata: { commands } };
    } finally {
      if (session) {
        // A timed-out turn is still running; stop it before the profile it uses goes away.
        await session.abort().catch(() => undefined);
        if (!session.isIdle) await session.waitForIdle().catch(() => undefined);
        await session.extensionRunner?.emit({ type: 'session_shutdown', reason: 'quit' }).catch(() => undefined);
        session.dispose();
      }
      restoreEnv('SERO_HOME', previous.SERO_HOME);
      restoreEnv('PI_CODING_AGENT_DIR', previous.PI_CODING_AGENT_DIR);
      await rm(root, { recursive: true, force: true });
    }
  }
}
