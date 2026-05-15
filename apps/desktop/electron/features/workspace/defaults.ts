import path from 'path';

import type { WorkspaceConfig } from '@/types/ipc';
import { SERO_AGENT_DIR, SERO_HOME } from '@electron/platform/env';

export const AGENT_DIR = SERO_AGENT_DIR;
export const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');
export const REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'workspaces.json');
export const WORKSPACES_DIR = path.join(SERO_HOME, 'workspaces');

export const DEFAULT_GLOBAL_CONFIG: WorkspaceConfig = {
  id: 'global',
  name: 'Global',
  description: 'Cross-cutting personal data — knowledge, finance, contacts, templates',
  runtime: { backend: 'host' },
  contextHints: ['Personal knowledge base and reference data'],
  tags: ['default', 'personal', 'knowledge'],
};
