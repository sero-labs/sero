/**
 * Agent discovery — loads .md agent definitions from ~/.sero-ui/agent/agents/.
 *
 * Runs fresh on every invocation (no caching). Agents added mid-session
 * are immediately available.
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import type { AgentConfig } from '../core/types';
import { parseModelField } from '@electron/shared/settings/resolve-tier-model';

/**
 * Parse JSON frontmatter from a markdown file.
 *
 * Expects:
 * ```
 * ```json
 * { "name": "...", ... }
 * ```
 * ... body ...
 * ```
 *
 * Or the simpler delimiter style:
 * ```
 * ---
 * { "name": "...", ... }
 * ---
 * ... body ...
 * ```
 *
 * Returns null if no valid JSON frontmatter is found.
 */
function parseJsonFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  const trimmed = content.trimStart();

  // Style 1: ```json ... ``` fenced block
  if (trimmed.startsWith('```json')) {
    const endIdx = trimmed.indexOf('```', 7);
    if (endIdx === -1) return null;
    const jsonStr = trimmed.slice(7, endIdx).trim();
    try {
      const fm = JSON.parse(jsonStr);
      if (typeof fm !== 'object' || fm === null) return null;
      const body = trimmed.slice(endIdx + 3).trim();
      return { frontmatter: fm, body };
    } catch {
      return null;
    }
  }

  // Style 2: --- ... --- YAML-style delimiters with JSON content
  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) return null;
    const jsonStr = trimmed.slice(3, endIdx).trim();
    try {
      const fm = JSON.parse(jsonStr);
      if (typeof fm !== 'object' || fm === null) return null;
      const body = trimmed.slice(endIdx + 3).trim();
      return { frontmatter: fm, body };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validate that required frontmatter fields are present.
 * Returns an array of warning messages (empty if valid).
 */
function validateFrontmatter(
  fm: Record<string, unknown>,
  filePath: string,
): string[] {
  const warnings: string[] = [];
  if (!fm.name || typeof fm.name !== 'string') {
    warnings.push(`[subagent/discovery] ${filePath}: missing or invalid 'name' in frontmatter`);
  }
  if (!fm.description || typeof fm.description !== 'string') {
    warnings.push(`[subagent/discovery] ${filePath}: missing or invalid 'description' in frontmatter`);
  }
  return warnings;
}

/**
 * Parse model field from frontmatter into the AgentConfig union type.
 * Returns plain string for legacy format, structured object for new format.
 */
function parseAgentModelField(
  raw: unknown,
): string | { prefer: string; fallbacks: string[] } | undefined {
  if (typeof raw === 'string' && raw.trim()) return raw;
  const parsed = parseModelField(raw);
  return parsed ?? undefined;
}

/**
 * Convert frontmatter to AgentConfig.
 */
function toAgentConfig(
  fm: Record<string, unknown>,
  body: string,
  absPath: string,
): AgentConfig {
  return {
    name: fm.name as string,
    description: fm.description as string,
    model: parseAgentModelField(fm.model),
    thinking: typeof fm.thinking === 'string' ? fm.thinking : undefined,
    timeoutMs: typeof fm.timeoutMs === 'number' ? fm.timeoutMs : undefined,
    tools: Array.isArray(fm.tools) ? fm.tools.filter((t): t is string => typeof t === 'string') : undefined,
    extensions: Array.isArray(fm.extensions) ? fm.extensions.filter((e): e is string => typeof e === 'string') : undefined,
    systemPrompt: body,
    source: 'global',
    filePath: absPath,
  };
}

export interface DiscoveryOptions {
  /** Callback to check if a model exists. */
  isValidModel?: (modelId: string) => boolean;
}

/**
 * Discover all agent definitions from .md files in the given directory.
 *
 * @param agentsDir - Absolute path to the agents directory
 * @param options - Optional callbacks for validation
 * @returns Array of valid AgentConfig objects
 */
export async function discoverAgents(
  agentsDir: string,
  options?: DiscoveryOptions,
): Promise<AgentConfig[]> {
  let files: string[];
  try {
    files = await readdir(agentsDir);
  } catch {
    // Directory doesn't exist — not an error, just no agents
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const agents: AgentConfig[] = [];

  for (const file of mdFiles) {
    const absPath = path.join(agentsDir, file);
    try {
      const content = await readFile(absPath, 'utf-8');
      const parsed = parseJsonFrontmatter(content);

      if (!parsed) {
        console.warn(`[subagent/discovery] ${absPath}: no valid JSON frontmatter found, skipping`);
        continue;
      }

      const warnings = validateFrontmatter(parsed.frontmatter, absPath);
      if (warnings.length > 0) {
        for (const w of warnings) console.warn(w);
        // Skip if required fields are missing
        if (!parsed.frontmatter.name || !parsed.frontmatter.description) {
          continue;
        }
      }

      // Warn about unknown models (non-blocking) — skip tier aliases
      const model = parsed.frontmatter.model;
      if (typeof model === 'string' && options?.isValidModel && !options.isValidModel(model)) {
        console.warn(
          `[subagent/discovery] ${absPath}: model '${model}' not found in registry`,
        );
      }
      // Structured model fields are validated at resolution time, not discovery

      agents.push(toAgentConfig(parsed.frontmatter, parsed.body, absPath));
    } catch (err) {
      console.warn(`[subagent/discovery] ${absPath}: failed to read/parse, skipping`, err);
    }
  }

  return agents;
}
