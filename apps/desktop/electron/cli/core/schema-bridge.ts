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

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { CliCommand, CliCommandContext, CliContentBlock, CliResult } from './types';
import { buildCommandContext, buildToolContext } from './bridge-context';
import { getBridgedExtensionCommand, getBridgedExtensionTool } from '../bridges/extension-session-bridge';
import { parseFlags } from '../lib/utils';

const TOOL_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  // Content extraction can invoke Gemini video pipelines and other slow fallbacks.
  fetch_content: 300_000,
  // Search providers already use internal 60s+ timeouts.
  web_search: 120_000,
  code_search: 90_000,
  // Memory consolidation runs multiple LLM calls to extract entries from daily logs.
  memory: 180_000,
};

const SCHEMA_PROP_TYPES = new Set<SchemaPropType>([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
]);

export function getBridgedToolTimeoutMs(toolName: string): number | undefined {
  return TOOL_TIMEOUT_OVERRIDES_MS[toolName];
}

// ── Schema introspection ────────────────────────────────────

type SchemaPropType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

interface SchemaProp {
  name: string;
  type: SchemaPropType;
  description: string;
  required: boolean;
  enumValues?: string[];
  /** For array types: the raw JSON Schema of the items element. */
  itemsSchema?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getAnyOfVariants(schema: Record<string, unknown>): Record<string, unknown>[] {
  const anyOf = schema.anyOf;
  return Array.isArray(anyOf) ? anyOf.filter(isRecord) : [];
}

function getSchemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties;
  return isRecord(properties) ? properties : {};
}

function getRequiredKeys(schema: Record<string, unknown>): Set<string> {
  const required = schema.required;
  return new Set(
    Array.isArray(required)
      ? required.filter((value): value is string => typeof value === 'string')
      : [],
  );
}

function getSchemaType(schema: Record<string, unknown>): SchemaPropType {
  const type = schema.type;
  return typeof type === 'string' && SCHEMA_PROP_TYPES.has(type as SchemaPropType)
    ? type as SchemaPropType
    : 'string';
}

function resolveAnyOf(schema: Record<string, unknown>): Record<string, unknown> {
  return getAnyOfVariants(schema).find((variant) => 'type' in variant) ?? schema;
}

function extractEnumValues(resolved: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(resolved.enum)) {
    const enumValues = resolved.enum
      .filter((value): value is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof value))
      .map(String);
    return enumValues.length ? enumValues : undefined;
  }

  const anyOfValues = getAnyOfVariants(resolved)
    .filter((value) => 'const' in value)
    .map((value) => String(value.const));
  return anyOfValues.length ? anyOfValues : undefined;
}

function extractSchemaProps(schema: Record<string, unknown>): SchemaProp[] {
  const properties = getSchemaProperties(schema);
  const required = getRequiredKeys(schema);
  const props: SchemaProp[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    if (!isRecord(prop)) continue;
    const resolved = resolveAnyOf(prop);
    const type = getSchemaType(resolved);
    const itemsSchema = type === 'array' && isRecord(resolved.items)
      ? resolved.items
      : undefined;

    props.push({
      name,
      type,
      description: typeof prop.description === 'string'
        ? prop.description
        : typeof resolved.description === 'string'
          ? resolved.description
          : '',
      required: required.has(name),
      enumValues: extractEnumValues(resolved),
      itemsSchema,
    });
  }

  return props;
}

function getCliParamType(type: SchemaPropType): 'string' | 'number' | 'boolean' {
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
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
    const prop = props.find((entry) => entry.name === key);
    if (prop) {
      result[prop.name] = coerceValue(val, prop);
    }
  }

  // 2. Map positionals to unmapped properties (required first, then optional)
  const unmapped = props.filter((entry) => !(entry.name in result));
  const ordered = [
    ...unmapped.filter((entry) => entry.required),
    ...unmapped.filter((entry) => !entry.required),
  ];

  for (let i = 0; i < positionals.length && i < ordered.length; i++) {
    const prop = ordered[i];
    if (!prop) continue;
    result[prop.name] = coerceValue(positionals[i]!, prop);
  }

  return result;
}

// ── Help generation ─────────────────────────────────────────

/**
 * Describe the fields of a JSON Schema object for help text.
 * Returns lines like: `  label (required, string) — Display text`
 */
function describeObjectFields(schema: Record<string, unknown>, indent: string): string[] {
  const properties = getSchemaProperties(schema);
  const requiredSet = getRequiredKeys(schema);
  const lines: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    if (!isRecord(fieldDef)) continue;
    const resolved = resolveAnyOf(fieldDef);
    const type = getSchemaType(resolved);
    const desc = typeof fieldDef.description === 'string'
      ? fieldDef.description
      : typeof resolved.description === 'string'
        ? resolved.description
        : '';
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
  const properties = getSchemaProperties(schema);
  const requiredSet = getRequiredKeys(schema);
  const example: Record<string, unknown> = {};

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    if (!isRecord(fieldDef)) continue;
    const resolved = resolveAnyOf(fieldDef);
    const type = getSchemaType(resolved);
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
  const required = props.filter((prop) => prop.required);
  const optional = props.filter((prop) => !prop.required);

  // Usage line
  const usageParts = required
    .map((prop) => `<${prop.name}>`)
    .concat(optional.map((prop) => `[--${prop.name} <value>]`));
  const usageLine = `sero ${name} ${usageParts.join(' ')}`.trimEnd();

  const lines = [`${name} — ${description}`, '', 'Usage:', `  ${usageLine}`];

  if (required.length) {
    lines.push('', 'Required:');
    for (const prop of required) {
      const isComplex = prop.type === 'array' || prop.type === 'object';
      const enumHint = prop.enumValues ? ` {${prop.enumValues.join(', ')}}` : '';
      const typeHint = isComplex ? ' (JSON)' : '';
      lines.push(`  ${prop.name}${enumHint}${typeHint} — ${prop.description || prop.name}`);
    }
  }

  if (optional.length) {
    lines.push('', 'Options:');
    for (const prop of optional) {
      const isComplex = prop.type === 'array' || prop.type === 'object';
      const typeHint = isComplex ? ' (JSON)' : prop.type !== 'string' ? ` (${prop.type})` : '';
      lines.push(`  --${prop.name}${typeHint} — ${prop.description || prop.name}`);
    }
  }

  // Document nested JSON shapes for array/object params
  const complexProps = props.filter(
    (prop) => prop.type === 'array' && prop.itemsSchema && getSchemaType(prop.itemsSchema) === 'object',
  );
  for (const prop of complexProps) {
    const itemSchema = prop.itemsSchema!;
    lines.push('', `JSON shape for ${prop.name} (array of objects):`);
    lines.push(...describeObjectFields(itemSchema, '  '));

    // Recurse one level into nested array-of-object fields
    const nestedProps = getSchemaProperties(itemSchema);
    for (const [nestedName, nestedDef] of Object.entries(nestedProps)) {
      if (!isRecord(nestedDef)) continue;
      const resolved = resolveAnyOf(nestedDef);
      if (getSchemaType(resolved) === 'array' && isRecord(resolved.items) && getSchemaType(resolved.items) === 'object') {
        lines.push('', `  JSON shape for ${nestedName} (nested array of objects):`);
        lines.push(...describeObjectFields(resolved.items, '    '));
      }
    }

    // Generate a compact example
    const example = buildJsonExample(itemSchema);
    lines.push('', `Example ${prop.name}: '[${JSON.stringify(example)}]'`);
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
    .filter((entry): entry is { type: 'text'; text: string } => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
}

// ── Bridge a ToolDefinition into a CliCommand ───────────────

export interface CustomToolCliBridge {
  summary?: string;
  help?: string;
  group?: string;
  overrideBuiltin?: boolean;
  execute: (
    args: string[],
    context: CliCommandContext,
    onUpdate?: (update: { content: CliContentBlock[]; details?: unknown }) => void,
  ) => Promise<CliResult>;
}

type CliToolDefinition = ToolDefinition & {
  cli?: CustomToolCliBridge;
};

export function getCustomToolCliBridge(toolDef: ToolDefinition): CustomToolCliBridge | undefined {
  const cli = (toolDef as CliToolDefinition).cli;
  return cli && typeof cli.execute === 'function' ? cli : undefined;
}

function normalizeCliResult(result: CliResult): CliResult {
  return {
    output: typeof result.output === 'string' ? result.output : String(result.output ?? ''),
    content: Array.isArray(result.content) ? result.content : undefined,
    details: result.details,
    exitCode: result.exitCode ?? 0,
  };
}

function getLiveToolCliBridge(
  toolName: string,
  context: CliCommandContext,
): CustomToolCliBridge | undefined {
  const activeToolDef = getBridgedExtensionTool(toolName, context)?.definition;
  return activeToolDef ? getCustomToolCliBridge(activeToolDef) : undefined;
}

export interface BridgeToolOptions {
  /** Mark this command as interactive (disables per-command timeout). */
  interactive?: boolean;
}

export function bridgeTool(toolName: string, toolDef: ToolDefinition, options?: BridgeToolOptions): CliCommand {
  const props = extractSchemaProps(toolDef.parameters as Record<string, unknown>);
  const summary = (toolDef.description ?? '').split(/\.\s/)[0]?.slice(0, 80) ?? toolName;
  const help = generateHelp(toolName, toolDef.description ?? toolName, props);
  const cliBridge = getCustomToolCliBridge(toolDef);

  return {
    name: toolName,
    summary: cliBridge?.summary ?? summary,
    help: cliBridge?.help ?? help,
    source: 'app',
    group: cliBridge?.group ?? 'Apps',
    interactive: options?.interactive,
    timeoutMs: getBridgedToolTimeoutMs(toolName),
    params: props.map((prop) => ({
      name: prop.name,
      description: prop.description,
      required: prop.required,
      type: getCliParamType(prop.type),
    })),
    execute: async (args: string[], ctx: CliCommandContext, onUpdate): Promise<CliResult> => {
      try {
        const activeCliBridge = getLiveToolCliBridge(toolName, ctx) ?? cliBridge;
        if (activeCliBridge) {
          return normalizeCliResult(await activeCliBridge.execute(args, ctx, onUpdate));
        }

        const params = schemaToParams(props, args);
        const activeToolDef = getBridgedExtensionTool(toolName, ctx)?.definition ?? toolDef;
        const result = await activeToolDef.execute(
          'cli-bridge',
          params,
          ctx.invocation.signal,
          onUpdate,
          buildToolContext(ctx),
        );
        const content = extractContent(result);
        const text = extractText(content);
        const details = (result as { details?: unknown }).details ?? null;
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
        await registered.handler(args.join(' '), buildCommandContext(registered.name, ctx));
        return { output: `/${name} executed`, exitCode: 0 };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Command failed';
        return { output: `ERROR: ${msg}`, exitCode: 1 };
      }
    },
  };
}
