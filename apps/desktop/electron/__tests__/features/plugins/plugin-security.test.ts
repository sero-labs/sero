import { describe, expect, it } from 'vitest';

import {
  assertValidPluginId,
  ensurePathInsideDir,
  resolvePluginInstallDir,
} from '@electron/features/plugins/security';

describe('plugin security helpers', () => {
  it('accepts safe kebab-case plugin ids', () => {
    expect(assertValidPluginId('todo')).toBe('todo');
    expect(assertValidPluginId('plugin-2')).toBe('plugin-2');
  });

  it('rejects traversal and malformed plugin ids', () => {
    for (const pluginId of ['../../evil', '../x', 'evil/name', 'UPPER', 'has space']) {
      expect(() => assertValidPluginId(pluginId)).toThrow(/Invalid plugin id/);
    }
  });

  it('keeps resolved plugin install paths inside the plugins directory', () => {
    expect(resolvePluginInstallDir('/tmp/sero/packages', 'todo')).toBe('/tmp/sero/packages/todo');
  });

  it('rejects resolved paths outside the plugins directory', () => {
    expect(() => ensurePathInsideDir('/tmp/sero/packages', '/tmp/evil')).toThrow(
      /escapes the plugins directory/,
    );
  });

  it('rejects the plugins directory itself as a target', () => {
    expect(() => ensurePathInsideDir('/tmp/sero/packages', '/tmp/sero/packages')).toThrow(
      /plugins directory itself/,
    );
  });
});
