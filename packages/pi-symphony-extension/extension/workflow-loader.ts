/**
 * WORKFLOW.md parser — extracts YAML front matter and prompt template.
 *
 * Expected format:
 * ---
 * tracker:
 *   kind: linear
 *   ...
 * ---
 * You are working on {{ issue.title }}...
 */

import { promises as fs } from 'node:fs';
import yaml from 'js-yaml';
import type { WorkflowDefinition } from '../shared/types';

// ── Error types ────────────────────────────────────────────────

export type WorkflowErrorKind =
  | 'missing_workflow_file'
  | 'workflow_parse_error'
  | 'workflow_front_matter_not_a_map';

export class WorkflowError extends Error {
  kind: WorkflowErrorKind;

  constructor(kind: WorkflowErrorKind, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.kind = kind;
  }
}

// ── Front matter extraction ────────────────────────────────────

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function splitFrontMatter(content: string): { yaml: string; body: string } {
  const match = FRONT_MATTER_RE.exec(content);
  if (!match) {
    return { yaml: '', body: content.trim() };
  }
  return {
    yaml: match[1],
    body: (match[2] ?? '').trim(),
  };
}

// ── Public API ─────────────────────────────────────────────────

export async function loadWorkflow(filePath: string): Promise<WorkflowDefinition> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    throw new WorkflowError(
      'missing_workflow_file',
      `Cannot read workflow file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { yaml: yamlStr, body } = splitFrontMatter(content);

  let config: Record<string, unknown> = {};
  if (yamlStr) {
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlStr);
    } catch (err) {
      throw new WorkflowError(
        'workflow_parse_error',
        `YAML parse error in front matter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (parsed === null || parsed === undefined) {
      config = {};
    } else if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new WorkflowError(
        'workflow_front_matter_not_a_map',
        `Front matter must be a YAML map, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
      );
    } else {
      config = parsed as Record<string, unknown>;
    }
  }

  return {
    config,
    promptTemplate: body,
  };
}
