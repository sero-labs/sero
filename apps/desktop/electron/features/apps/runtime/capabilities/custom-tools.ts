import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

function isToolDefinition(value: unknown): value is ToolDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string'
    && typeof candidate.description === 'string'
    && typeof candidate.execute === 'function'
    && typeof candidate.parameters === 'object'
    && candidate.parameters !== null;
}

export function validateRuntimeCustomTools(customTools: unknown[] | undefined): ToolDefinition[] | undefined {
  if (!customTools) {
    return undefined;
  }

  const validated: ToolDefinition[] = [];

  for (const [index, tool] of customTools.entries()) {
    if (!isToolDefinition(tool)) {
      throw new Error(
        `Invalid app runtime customTools[${index}]: expected a Pi ToolDefinition with name, description, parameters, and execute().`,
      );
    }
    validated.push(tool);
  }

  return validated;
}
