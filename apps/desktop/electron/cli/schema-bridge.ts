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

import type { ToolDefinition, RegisteredCommand } from '@mariozechner/pi-coding-agent';
import type { CliCommand, CliCommandContext, CliResult } from './types';
import { parseFlags } from './commands/utils';
import { createSeroUIContext } from '../extensions/ui-context';

// ── Schema introspection ────────────────────────────────────

interface SchemaProp {
  name: string;
  type: string; // 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description: string;
  required: boolean;
  enumValues?: string[];
}

function extractSchemaProps(schema: Record<string, unknown>): SchemaProp[] {
  const properties = (schema as any)?.properties ?? {};
  const required = new Set<string>((schema as any)?.required ?? []);
  const props: SchemaProp[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>;

    // Handle anyOf (TypeBox Optional wraps in { anyOf: [type, ...] })
    let resolved = p;
    if (Array.isArray(p.anyOf)) {
      resolved = (p.anyOf as Record<string, unknown>[]).find(
        (v) => typeof v === 'object' && v !== null && v.type !== undefined,
      ) ?? p;
    }

    const enumValues = Array.isArray(resolved.enum)
      ? (resolved.enum as string[])
      : Array.isArray((resolved as any).anyOf)
        ? (resolved as any).anyOf
            .filter((v: any) => v?.const !== undefined)
            .map((v: any) => String(v.const))
        : undefined;

    props.push({
      name,
      type: (resolved.type as string) ?? 'string',
      description: (p.description as string) ?? (resolved.description as string) ?? '',
      required: required.has(name),
      enumValues: enumValues?.length ? enumValues : undefined,
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

  return lines.join('\n');
}

// ── Tool result extraction ──────────────────────────────────

function extractText(result: unknown): string {
  const content = (result as any)?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c?.type === 'text')
    .map((c: any) => c.text)
    .join('\n');
}

// ── Bridge a ToolDefinition into a CliCommand ───────────────

export function bridgeTool(toolName: string, toolDef: ToolDefinition): CliCommand {
  const props = extractSchemaProps(toolDef.parameters as Record<string, unknown>);
  const summary = (toolDef.description ?? '').split(/\.\s/)[0]?.slice(0, 80) ?? toolName;
  const help = generateHelp(toolName, toolDef.description ?? toolName, props);

  return {
    name: toolName,
    summary,
    help,
    source: 'app',
    group: 'Apps',
    params: props.map((p) => ({
      name: p.name,
      description: p.description,
      required: p.required,
      type: p.type as 'string' | 'number' | 'boolean',
    })),
    execute: async (args: string[], ctx: CliCommandContext): Promise<CliResult> => {
      try {
        const params = schemaToParams(props, args);
        const result = await toolDef.execute(
          'cli-bridge',
          params,
          ctx.invocation.signal,
          undefined,
          { cwd: ctx.cwd } as any,
        );
        const text = extractText(result);
        const isError = text.startsWith('Error:') || text.startsWith('ERROR:');
        return { output: text, exitCode: isError ? 1 : 0 };
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
 * The command handler receives `{ cwd }` as context — it can use
 * `ctx.cwd` but not session-level APIs like `ctx.sessionManager`.
 * Side effects (pi.sendMessage, pi.setActiveTools, etc.) work through
 * the extension's closure-captured `pi` reference.
 */
/**
 * Build a minimal ExtensionCommandContext for bridged commands.
 *
 * Reuses the canonical `createSeroUIContext()` so there's a single
 * source of truth for the UIContext shim across Sero.
 */
function buildCommandContext(ctx: CliCommandContext): Record<string, unknown> {
  return { cwd: ctx.cwd, hasUI: true, ui: createSeroUIContext() };
}

export function bridgeCommand(name: string, cmd: RegisteredCommand): CliCommand {
  return {
    name,
    summary: cmd.description ?? name,
    source: 'app',
    group: 'App Commands',
    execute: async (args: string[], ctx: CliCommandContext): Promise<CliResult> => {
      try {
        await cmd.handler(args.join(' '), buildCommandContext(ctx) as any);
        return { output: `/${name} executed`, exitCode: 0 };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Command failed';
        return { output: `ERROR: ${msg}`, exitCode: 1 };
      }
    },
  };
}
