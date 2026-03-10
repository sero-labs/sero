/**
 * Strict template engine — Liquid-compatible subset.
 *
 * Supports:
 * - Variable interpolation: {{ issue.title }}, {{ attempt }}
 * - Dot-path access for nested fields
 * - For loops: {% for label in issue.labels %} ... {% endfor %}
 * - Strict mode: fails on unknown variables
 */

// ── Types ───────────────────────────────────────────────────────

export type TemplateContext = Record<string, unknown>;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

// ── Dot-path resolver ───────────────────────────────────────────

function resolvePath(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function resolveVariable(context: TemplateContext, path: string, strict: boolean): string {
  const value = resolvePath(context, path.trim());

  if (value === undefined || value === null) {
    if (strict) {
      throw new TemplateError(`Unknown variable: "${path.trim()}"`);
    }
    return '';
  }

  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// ── For-loop processing ─────────────────────────────────────────

const FOR_OPEN = /\{%[-\s]*for\s+(\w+)\s+in\s+([\w.]+)\s*[-]?%\}/g;
const FOR_CLOSE = /\{%[-\s]*endfor\s*[-]?%\}/g;

function processForLoops(template: string, context: TemplateContext, strict: boolean): string {
  let result = template;
  let safety = 0;

  // Process from innermost outward (simple approach: single-pass, no nesting)
  while (safety++ < 50) {
    const openMatch = FOR_OPEN.exec(result);
    FOR_OPEN.lastIndex = 0;

    if (!openMatch) break;

    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    const itemName = openMatch[1];
    const collectionPath = openMatch[2];

    // Find matching endfor after this open
    FOR_CLOSE.lastIndex = openEnd;
    const closeMatch = FOR_CLOSE.exec(result);
    FOR_CLOSE.lastIndex = 0;

    if (!closeMatch) {
      throw new TemplateError(`Unclosed {% for ${itemName} in ${collectionPath} %}`);
    }

    const closeStart = closeMatch.index;
    const closeEnd = closeStart + closeMatch[0].length;

    const body = result.slice(openEnd, closeStart);
    const collection = resolvePath(context, collectionPath);

    if (!Array.isArray(collection)) {
      if (strict) {
        throw new TemplateError(
          `"${collectionPath}" is not an array (got ${typeof collection})`,
        );
      }
      result = result.slice(0, openStart) + result.slice(closeEnd);
      continue;
    }

    const rendered = collection
      .map((item) => {
        const loopCtx: TemplateContext = { ...context, [itemName]: item };
        return renderVariables(body, loopCtx, strict);
      })
      .join('');

    result = result.slice(0, openStart) + rendered + result.slice(closeEnd);
  }

  return result;
}

// ── Variable interpolation ──────────────────────────────────────

const VAR_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

function renderVariables(template: string, context: TemplateContext, strict: boolean): string {
  return template.replace(VAR_PATTERN, (_match, path: string) => {
    return resolveVariable(context, path, strict);
  });
}

// ── Public API ──────────────────────────────────────────────────

export interface RenderOptions {
  strict?: boolean;
}

export function renderTemplate(
  template: string,
  context: TemplateContext,
  options: RenderOptions = {},
): string {
  const strict = options.strict ?? true;

  // 1. Process for loops first (they may contain variables)
  let result = processForLoops(template, context, strict);

  // 2. Then interpolate remaining variables
  result = renderVariables(result, context, strict);

  return result;
}
