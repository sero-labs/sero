import { describe, expect, it } from 'vitest';

import type { SeroAppManifest } from '@/types/ipc';
import { assertPluginInstallAllowed } from '@electron/features/plugins/install-policy';

function createManifest(
  id: string,
  packagePath: string,
  isPlugin: boolean,
): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: null,
    component: null,
    devPort: undefined,
    packagePath,
    isPlugin,
    widgets: [],
  };
}

describe('plugin install policy', () => {
  it('allows reinstalling the plugin already installed at the target path', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('todo', '/tmp/.sero-ui/agent/packages/todo', true)],
      'todo',
      '/tmp/.sero-ui/agent/packages/todo',
    )).not.toThrow();
  });

  it('rejects conflicts with built-in apps', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('kanban', '/repo/plugins/sero-kanban-plugin', false)],
      'kanban',
      '/tmp/.sero-ui/agent/packages/kanban',
    )).toThrow(/already used by an existing app/);
  });

  it('rejects conflicts with a different installed plugin path', () => {
    expect(() => assertPluginInstallAllowed(
      [createManifest('todo', '/tmp/.sero-ui/agent/packages/todo-old', true)],
      'todo',
      '/tmp/.sero-ui/agent/packages/todo',
    )).toThrow(/already used by another installed plugin/);
  });
});
