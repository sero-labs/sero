/**
 * Schema Bridge — generic tool-to-CLI adapter.
 *
 * Converts Pi SDK ToolDefinitions into CLI commands automatically using
 * the tool's TypeBox parameter schema for arg parsing, type coercion,
 * and help generation. No per-tool custom parsing needed.
 *
 * Also bridges extension slash commands into CLI commands so the agent
 * can invoke them via `sero <command-name>`.
 *
 * Used by `extensionsOverride` in agent.ts to intercept extension tools
 * and re-register them as CLI commands (removing them from agent context).
 */

import type { ToolDefinition, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { CliCommand, CliCommandContext, CliContentBlock, CliResult, CliSessionRuntime } from './types';
import { parseFlags } from '../lib/utils';
import { getBridgedExtensionCommand, getBridgedExtensionTool } from '../bridges/extension-session-bridge';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';

const TOOL_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  // Content extraction can invoke Gemini video pipelines and other slow fallbacks.
  fetch_content: 300_000,
  // Search providers already use internal 60s+ timeouts.
  web_search: 120_000,
  code_search: 90_000,
  // Memory consolidation runs multiple LLM calls to extract entries from daily logs.
  memory: 180_000,
};

export function getBridgedToolTimeoutMs(toolName: string): number | undefined {
  return TOOL_TIMEOUT_OVERRIDES_MS[toolName];
}

// ── Schema introspection ────────────────────────────────────

interface SchemaProp {
  name: string;
  type: string; // 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description: string;
  required: boolean;
  enumValues?: string[];
  /** For array types: the raw JSON Schema of the items element. */
  itemsSchema?: Record<string, unknown>;
}

function resolveAnyOf(p: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(p.anyOf)) return p;
  return (p.anyOf as Record<string, unknown>[]).find(
    (v) => typeof v === 'object' && v !== null && v.type !== undefined,
  ) ?? p;
}

function extractEnumValues(resolved: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(resolved.enum)) return resolved.enum as string[];
  if (Array.isArray((resolved as any).anyOf)) {
    const vals = (resolved as any).anyOf
      .filter((v: any) => v?.const !== undefined)
      .map((v: any) => String(v.const));
    return vals.length ? vals : undefined;
  }
  return undefined;
}

function extractSchemaProps(schema: Record<string, unknown>): SchemaProp[] {
  const properties = (schema as any)?.properties ?? {};
  const required = new Set<string>((schema as any)?.required ?? []);
  const props: SchemaProp[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>;
    const resolved = resolveAnyOf(p);
    const type = (resolved.type as string) ?? 'string';

    // Capture items schema for arrays with object items
    let itemsSchema: Record<string, unknown> | undefined;
    if (type === 'array' && resolved.items && typeof resolved.items === 'object') {
      itemsSchema = resolved.items as Record<string, unknown>;
    }

    props.push({
      name,
      type,
      description: (p.description as string) ?? (resolved.description as string) ?? '',
      required: required.has(name),
      enumValues: extractEnumValues(resolved),
      itemsSchema,
    });
  }

  return props;
}

// ── Arg parsing (schema-driven) ─────────────────────────────

function coerceValue(value: string | true, prop: SchemaProp): unknown {
  if (value === true) return true;
  if (prop.type === 'number' || prop.type === 'integer') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (prop.type === 'boolean') {
    return value === 'true' || value === '1';
  }
  // Array/object params: try JSON.parse so complex tools can pass structured data
  if (prop.type === 'array' || prop.type === 'object') {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
  }
  return value;
}

function schemaToParams(
  props: SchemaProp[],
  args: string[],
): Record<string, unknown> {
  const { positionals, flags } = parseFlags(args);
  const result: Record<string, unknown> = {};

  // 1. Map --flags to properties by name
  for (const [key, val] of flags) {
    const prop = props.find((p) => p.name === key);
    if (prop) {
      result[prop.name] = coerceValue(val, prop);
    }
  }

  // 2. Map positionals to unmapped properties (required first, then optional)
  const unmapped = props.filter((p) => !(p.name in result));
  const ordered = [
    ...unmapped.filter((p) => p.required),
    ...unmapped.filter((p) => !p.required),
  ];

  for (let i = 0; i < positionals.length && i < ordered.length; i++) {
    result[ordered[i]!.name] = coerceValue(positionals[i]!, ordered[i]!);
  }

  return result;
}

// ── Help generation ─────────────────────────────────────────

/**
 * Describe the fields of a JSON Schema object for help text.
 * Returns lines like: `  label (required, string) — Display text`
 */
function describeObjectFields(schema: Record<string, unknown>, indent: string): string[] {
  const properties = (schema as any)?.properties ?? {};
  const requiredSet = new Set<string>((schema as any)?.required ?? []);
  const lines: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    const f = fieldDef as Record<string, unknown>;
    const resolved = resolveAnyOf(f);
    const type = (resolved.type as string) ?? 'string';
    const desc = (f.description as string) ?? (resolved.description as string) ?? '';
    const req = requiredSet.has(fieldName) ? 'required' : 'optional';
    const enumVals = extractEnumValues(resolved);
    const enumHint = enumVals ? ` {${enumVals.join(', ')}}` : '';
    lines.push(`${indent}${fieldName} (${req}, ${type}${enumHint}) — ${desc}`);
  }

  return lines;
}

/**
 * Build a minimal JSON example from a schema object.
 * Shows required fields with placeholder values, omits optional fields.
 */
function buildJsonExample(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema as any)?.properties ?? {};
  const requiredSet = new Set<string>((schema as any)?.required ?? []);
  const example: Record<string, unknown> = {};

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    const f = fieldDef as Record<string, unknown>;
    const resolved = resolveAnyOf(f);
    const type = (resolved.type as string) ?? 'string';
    // Only include required fields + first optional for context
    if (!requiredSet.has(fieldName) && Object.keys(example).length >= requiredSet.size) continue;

    if (type === 'string') example[fieldName] = `<${fieldName}>`;
    else if (type === 'number' || type === 'integer') example[fieldName] = 0;
    else if (type === 'boolean') example[fieldName] = false;
    else if (type === 'array') example[fieldName] = [];
    else example[fieldName] = {};
  }

  return example;
}

function generateHelp(
  name: string,
  description: string,
  props: SchemaProp[],
): string {
  const required = props.filter((p) => p.required);
  const optional = props.filter((p) => !p.required);

  // Usage line
  const usageParts = required
    .map((p) => `<${p.name}>`)
    .concat(optional.map((p) => `[--${p.name} <value>]`));
  const usageLine = `sero ${name} ${usageParts.join(' ')}`.trimEnd();

  const lines = [`${name} — ${description}`, '', 'Usage:', `  ${usageLine}`];

  if (required.length) {
    lines.push('', 'Required:');
    for (const p of required) {
      const isComplex = p.type === 'array' || p.type === 'object';
      const enumHint = p.enumValues ? ` {${p.enumValues.join(', ')}}` : '';
      const typeHint = isComplex ? ' (JSON)' : '';
      lines.push(`  ${p.name}${enumHint}${typeHint} — ${p.description || p.name}`);
    }
  }

  if (optional.length) {
    lines.push('', 'Options:');
    for (const p of optional) {
      const isComplex = p.type === 'array' || p.type === 'object';
      const typeHint = isComplex ? ' (JSON)' : p.type !== 'string' ? ` (${p.type})` : '';
      lines.push(`  --${p.name}${typeHint} — ${p.description || p.name}`);
    }
  }

  // Document nested JSON shapes for array/object params
  const complexProps = props.filter(
    (p) => p.type === 'array' && p.itemsSchema && (p.itemsSchema as any).type === 'object',
  );
  for (const p of complexProps) {
    const itemSchema = p.itemsSchema!;
    lines.push('', `JSON shape for ${p.name} (array of objects):`);
    lines.push(...describeObjectFields(itemSchema, '  '));

    // Recurse one level into nested array-of-object fields
    const nestedProps = (itemSchema as any)?.properties ?? {};
    for (const [nestedName, nestedDef] of Object.entries(nestedProps)) {
      const nd = nestedDef as Record<string, unknown>;
      const resolved = resolveAnyOf(nd);
      if (resolved.type === 'array' && resolved.items && (resolved.items as any).type === 'object') {
        lines.push('', `  JSON shape for ${nestedName} (nested array of objects):`);
        lines.push(...describeObjectFields(resolved.items as Record<string, unknown>, '    '));
      }
    }

    // Generate a compact example
    const example = buildJsonExample(itemSchema);
    lines.push('', `Example ${p.name}: '[${JSON.stringify(example)}]'`);
  }

  return lines.join('\n');
}

// ── Tool result extraction ──────────────────────────────────

function extractContent(result: unknown): CliContentBlock[] {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return [];

  return content.flatMap((block): CliContentBlock[] => {
    if (!block || typeof block !== 'object') return [];
    if ((block as { type?: string }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      return [{ type: 'text', text: (block as { text: string }).text }];
    }
    if ((block as { type?: string }).type === 'image' && typeof (block as { data?: unknown }).data === 'string') {
      return [{
        type: 'image',
        data: (block as { data: string }).data,
        mimeType: typeof (block as { mimeType?: unknown }).mimeType === 'string'
          ? (block as { mimeType: string }).mimeType
          : 'image/png',
      }];
    }
    return [];
  });
}

function extractText(content: CliContentBlock[]): string {
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

// ── Bridge a ToolDefinition into a CliCommand ───────────────

export interface BridgeToolOptions {
  /** Mark this command as interactive (disables per-command timeout). */
  interactive?: boolean;
}

export function bridgeTool(toolName: string, toolDef: ToolDefinition, options?: BridgeToolOptions): CliCommand {
  const props = extractSchemaProps(toolDef.parameters as Record<string, unknown>);
  const summary = (toolDef.description ?? '').split(/\.\s/)[0]?.slice(0, 80) ?? toolName;
  const help = generateHelp(toolName, toolDef.description ?? toolName, props);

  return {
    name: toolName,
    summary,
    help,
    source: 'app',
    group: 'Apps',
    interactive: options?.interactive,
    timeoutMs: getBridgedToolTimeoutMs(toolName),
    params: props.map((p) => ({
      name: p.name,
      description: p.description,
      required: p.required,
      type: p.type as 'string' | 'number' | 'boolean',
    })),
    execute: async (args: string[], ctx: CliCommandContext, onUpdate): Promise<CliResult> => {
      try {
        const params = schemaToParams(props, args);
        // Forward agent context (model, modelRegistry, etc.) when available
        // so bridged tools like `memory consolidate` can call LLMs.
        // We also inject a narrow execution-scoped `sessionRuntime` so bridged
        // tools can perform current-session side effects without capturing `pi`.
        // When agentContext exists, recombining with cwd produces a full ExtensionContext.
        // When it doesn't (standalone CLI), we provide a bare {cwd} — extension tools
        // must handle missing fields gracefully (e.g. ctx.model === undefined).
        const activeToolDef = getBridgedExtensionTool(toolName, ctx)?.definition ?? toolDef;
        const toolContext = (ctx.agentContext
          ? { ...ctx.agentContext, cwd: ctx.cwd, sessionRuntime: ctx.sessionRuntime }
          : { cwd: ctx.cwd, sessionRuntime: ctx.sessionRuntime }) as ExtensionContext & {
            sessionRuntime?: CliSessionRuntime;
          };
        const result = await activeToolDef.execute(
          'cli-bridge',
          params,
          ctx.invocation.signal,
          onUpdate as Parameters<typeof activeToolDef.execute>[3],
          toolContext,
        );
        const content = extractContent(result);
        const text = extractText(content);
        const details = (result as { details?: unknown })?.details ?? null;
        const isError = text.startsWith('Error:') || text.startsWith('ERROR:');
        return {
          output: text,
          content,
          details,
          exitCode: isError ? 1 : 0,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Command failed';
        return { output: `ERROR: ${msg}`, exitCode: 1 };
      }
    },
  };
}

// ── Bridge an extension slash command into a CliCommand ─────

/**
 * Wraps a Pi extension command (registered via `pi.registerCommand()`)
 * into a CLI command so the agent can invoke it via `sero <name> [args]`.
 *
 * The concrete command handler is resolved from the active session at
 * execute time, so bridged plugin commands never reuse another session's
 * closure-captured `pi` or extension-local state.
 */
/**
 * Build a minimal ExtensionCommandContext for bridged commands.
 *
 * Reuses the canonical `createSeroUIContext()` so there's a single
 * source of truth for the UIContext shim across Sero. When agent context
 * is available, we forward it and add `sessionRuntime` for current-session
 * side effects.
 */
function buildCommandContext(ctx: CliCommandContext): Record<string, unknown> {
  return {
    ...(ctx.agentContext ? { ...ctx.agentContext } : {}),
    cwd: ctx.cwd,
    hasUI: true,
    ui: createSeroUIContext(),
    sessionRuntime: ctx.sessionRuntime,
  };
}

export function bridgeCommand(name: string, description?: string): CliCommand {
  return {
    name,
    summary: description ?? name,
    source: 'app',
    group: 'App Commands',
    execute: async (args: string[], ctx: CliCommandContext): Promise<CliResult> => {
      try {
        const registered = getBridgedExtensionCommand(name, ctx);
        if (!registered) {
          return { output: 'ERROR: This command requires an active agent session.', exitCode: 1 };
        }
        await registered.handler(args.join(' '), buildCommandContext(ctx) as any);
        return { output: `/${name} executed`, exitCode: 0 };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Command failed';
        return { output: `ERROR: ${msg}`, exitCode: 1 };
      }
    },
  };
}
