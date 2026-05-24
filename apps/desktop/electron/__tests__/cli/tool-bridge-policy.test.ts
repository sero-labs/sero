/**
 * Tool bridge policy tests.
 *
 * Verifies that the CORE_TOOLS_TO_BRIDGE and NEVER_BRIDGE_TO_CLI
 * sets are configured correctly per the context-bloat-reduction plan.
 *
 * These tests import the bridge function and check which tools get
 * intercepted vs which remain standalone.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Type, type TSchema } from 'typebox';
import type { LoadExtensionsResult, ToolDefinition, RegisteredCommand } from '@mariozechner/pi-coding-agent';
import { bridgeExtensionTools, getCliRegistry, resetCliRegistryForTests } from '@electron/cli';

// ── Helpers ─────────────────────────────────────────────────

function makeTool(name: string, params?: TSchema): ToolDefinition {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: params ?? Type.Object({ action: Type.String() }),
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: undefined }),
  };
}

function makeExtResult(tools: ToolDefinition[]): LoadExtensionsResult {
  const toolMap = new Map<string, { definition: ToolDefinition }>();
  for (const t of tools) {
    toolMap.set(t.name, { definition: t });
  }

  return {
    extensions: [{
      name: 'test-ext',
      resolvedPath: '/test/extension',
      tools: toolMap,
      commands: new Map<string, RegisteredCommand>(),
    }],
  } as unknown as LoadExtensionsResult;
}

// ── Tests ───────────────────────────────────────────────────

describe('Tool bridge policy', () => {
  beforeEach(() => {
    resetCliRegistryForTests();
  });

  it('does not bridge kanban without plugin manifest policy', () => {
    const ext = makeExtResult([makeTool('kanban')]);
    const result = bridgeExtensionTools(ext);

    expect(result.extensions[0]!.tools.has('kanban')).toBe(true);
    expect(getCliRegistry().get('kanban')).toBeFalsy();
  });

  it('bridges create_agent tool (moved to CORE_TOOLS_TO_BRIDGE)', () => {
    const ext = makeExtResult([makeTool('create_agent')]);
    const result = bridgeExtensionTools(ext);
    expect(result.extensions[0]!.tools.has('create_agent')).toBe(false);

    const reg = getCliRegistry();
    expect(reg.get('create_agent')).toBeTruthy();
  });

  it('bridges question as interactive (timeout-exempt)', () => {
    const ext = makeExtResult([makeTool('question')]);
    bridgeExtensionTools(ext);
    expect(ext.extensions[0]!.tools.has('question')).toBe(false);
    const cmd = getCliRegistry().get('question');
    expect(cmd).toBeTruthy();
    expect(cmd!.interactive).toBe(true);
  });

  it('bridges questionnaire as interactive (timeout-exempt)', () => {
    const ext = makeExtResult([makeTool('questionnaire')]);
    bridgeExtensionTools(ext);
    expect(ext.extensions[0]!.tools.has('questionnaire')).toBe(false);
    const cmd = getCliRegistry().get('questionnaire');
    expect(cmd).toBeTruthy();
    expect(cmd!.interactive).toBe(true);
  });

  it('bridges interview as interactive (timeout-exempt)', () => {
    const ext = makeExtResult([makeTool('interview')]);
    bridgeExtensionTools(ext);
    expect(ext.extensions[0]!.tools.has('interview')).toBe(false);
    const cmd = getCliRegistry().get('interview');
    expect(cmd).toBeTruthy();
    expect(cmd!.interactive).toBe(true);
  });

  it('does NOT bridge research', () => {
    const ext = makeExtResult([makeTool('research')]);
    const result = bridgeExtensionTools(ext);
    expect(result.extensions[0]!.tools.has('research')).toBe(true);
  });

  it('bridges memory tools (existing behaviour)', () => {
    const ext = makeExtResult([
      makeTool('memory'),
      makeTool('memory_search'),
    ]);
    const result = bridgeExtensionTools(ext);
    expect(result.extensions[0]!.tools.has('memory')).toBe(false);
    expect(result.extensions[0]!.tools.has('memory_search')).toBe(false);
  });
});
