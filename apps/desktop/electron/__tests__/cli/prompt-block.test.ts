import { describe, expect, it } from 'vitest';

import { CliRegistry } from '@electron/cli/core';
import { buildCliPromptBlock } from '@electron/cli';

describe('CLI prompt block', () => {
  it('lists commands with summaries grouped by source', () => {
    const registry = new CliRegistry();
    const execute = async () => ({ output: 'ok', exitCode: 0 });

    registry.register({
      name: 'memory',
      summary: 'Manage long-term memory',
      group: 'Apps',
      source: 'app',
      execute,
    });
    registry.register({
      name: 'memory_search',
      summary: 'Search memory and transcripts',
      group: 'Apps',
      source: 'app',
      execute,
    });
    registry.register({
      name: 'workspace',
      summary: 'Manage workspaces',
      group: 'Builtin',
      source: 'builtin',
      execute,
    });

    const prompt = buildCliPromptBlock(registry);

    // Commands are grouped with summaries
    expect(prompt).toContain('Apps:');
    expect(prompt).toContain('memory — Manage long-term memory');
    expect(prompt).toContain('memory_search — Search memory and transcripts');
    expect(prompt).toContain('Builtin:');
    expect(prompt).toContain('workspace — Manage workspaces');
  });

  it('does NOT include memory routing rules (owned by memory-instructions.ts)', () => {
    const registry = new CliRegistry();
    const execute = async () => ({ output: 'ok', exitCode: 0 });

    registry.register({
      name: 'memory',
      summary: 'Manage long-term memory',
      group: 'Apps',
      source: 'app',
      execute,
    });

    const prompt = buildCliPromptBlock(registry);

    // Memory routing is the memory plugin's responsibility, not the CLI block's
    expect(prompt).not.toContain('High-priority routing');
    expect(prompt).not.toContain('Sero memory system files and history');
    expect(prompt).not.toContain('MEMORY.md');
    expect(prompt).not.toContain('IDENTITY.md');
  });

  it('instructs to check help before calling commands with JSON parameters', () => {
    const registry = new CliRegistry();
    const prompt = buildCliPromptBlock(registry);

    expect(prompt).toContain('sero help <command>');
    expect(prompt).toContain('JSON parameters');
    expect(prompt).toContain('exact schema');
    expect(prompt).not.toContain('`kanban`');
  });

  it('includes direct app interaction guidance', () => {
    const registry = new CliRegistry();
    const prompt = buildCliPromptBlock(registry);

    expect(prompt).toContain('sero app screenshot');
    expect(prompt).toContain('appstate');
    expect(prompt).toContain('app click');
  });

  it('excludes hidden commands and help from the listing', () => {
    const registry = new CliRegistry();
    const execute = async () => ({ output: 'ok', exitCode: 0 });

    registry.register({
      name: 'help',
      summary: 'Show help',
      group: 'Builtin',
      source: 'builtin',
      execute,
    });
    registry.register({
      name: 'secret',
      summary: 'Hidden command',
      group: 'Internal',
      source: 'builtin',
      hidden: true,
      execute,
    });
    registry.register({
      name: 'visible',
      summary: 'Visible command',
      group: 'Apps',
      source: 'app',
      execute,
    });

    const prompt = buildCliPromptBlock(registry);

    expect(prompt).toContain('visible — Visible command');
    expect(prompt).not.toContain('secret');
    expect(prompt).not.toContain('help — Show help');
  });

  it('scopes session-owned commands to the active session when building prompts', () => {
    const registry = new CliRegistry();
    const execute = async () => ({ output: 'ok', exitCode: 0 });

    registry.replaceAppCommandsForSession('session-1', [
      {
        name: 'alpha',
        summary: 'Session alpha',
        group: 'Apps',
        source: 'app',
        owner: {
          kind: 'session-extension',
          sessionId: 'session-1',
          extensionPath: '/tmp/plugin-a/extension/index.js',
        },
        execute,
      },
    ]);
    registry.replaceAppCommandsForSession('session-2', [
      {
        name: 'beta',
        summary: 'Session beta',
        group: 'Apps',
        source: 'app',
        owner: {
          kind: 'session-extension',
          sessionId: 'session-2',
          extensionPath: '/tmp/plugin-b/extension/index.js',
        },
        execute,
      },
    ]);

    const prompt = buildCliPromptBlock(registry, { sessionId: 'session-1' });

    expect(prompt).toContain('alpha — Session alpha');
    expect(prompt).not.toContain('beta — Session beta');
  });
});
