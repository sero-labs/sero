import type { SeroAppManifest, WorkspaceInfo } from '@/types/ipc';

export const createdWorkspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  runtime: { backend: 'host' },
  container: false,
  references: [],
  mounts: [],
  roots: [],
};

export const secondWorkspace: WorkspaceInfo = {
  ...createdWorkspace,
  id: 'workspace-2',
  name: 'Workspace 2',
  path: '/tmp/workspace-2',
};

export const graphifyManifest: SeroAppManifest = {
  id: 'graphify',
  name: 'Graphify',
  description: null,
  version: '1.0.0',
  packageName: '@sero-ai/sero-graphify-plugin',
  icon: 'network',
  stateFile: '.sero/apps/graphify/state.json',
  scope: 'global',
  globalStatePath: '/tmp/graphify-state.json',
  uiEntry: null,
  runtimeEntry: null,
  component: null,
  devPort: undefined,
  remoteEntryOverride: null,
  packagePath: '/tmp/graphify',
  isPlugin: true,
  widgets: [],
  workspaceCreation: {
    label: 'Enable Graphify indexing',
    defaultEnabled: true,
    tool: 'graphify_index',
  },
};
