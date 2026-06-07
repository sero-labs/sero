import fs from 'fs';
import path from 'path';

import { SERO_AGENT_DIR, SERO_FIXED_ROOT, SERO_HOME } from '@electron/platform/env';
import { WORKSPACE_MOUNT, type ContainerBindMount } from './types';

export const WORKSPACE_LOGS_DIR = `${WORKSPACE_MOUNT}/.sero/logs`;
export const LOG_PORTAL_SENTINEL_PATH = `${WORKSPACE_LOGS_DIR}/dev/.sero-log-portal-v1`;
const LOG_PORTAL_SENTINEL_FILE = '.sero-log-portal-v1';

const LOG_README = `# Sero logs

Sero creates this directory so container agents can inspect host-side Sero logs without hunting through host paths.

Quick checks:

\`\`\`bash
find /workspace/.sero/logs -maxdepth 3 -type f | sort
tail -n 200 /workspace/.sero/logs/dev/sero-electron.log
tail -n 200 /workspace/.sero/logs/dev/sero-vite.log
tail -n 200 /workspace/.sero/logs/dev/sero-remote-<app-id>.log
\`\`\`

Mounted read-only subdirectories may include:

- \`dev/\` — source-dev logs such as \`sero-electron.log\`, \`sero-vite.log\`, and \`sero-remote-<app-id>.log\`.
- \`profile/\` — active-profile logs when they exist.
- \`debug/\` — profile debug logs, including \`model-messages.jsonl\` and \`memory/YYYY-MM-DD.log\`.
- \`apps/\` — app-scoped state folders; inspect \`*.log\` files only unless you need app state.
- \`sessions/\` — agent session JSONL files.

Do not open huge session JSONL files wholesale. Use \`tail\`, tight \`rg\` patterns, or a small script that extracts text fields.
`;

export function buildSeroLogMounts(): ContainerBindMount[] {
  return dedupeMounts([
    readOnlyMount(path.join(SERO_FIXED_ROOT, 'logs'), 'dev'),
    readOnlyMount(path.join(SERO_HOME, 'logs'), 'profile'),
    readOnlyMount(path.join(SERO_HOME, 'debug'), 'debug'),
    readOnlyMount(path.join(SERO_HOME, 'apps'), 'apps'),
    readOnlyMount(path.join(SERO_AGENT_DIR, 'sessions'), 'sessions'),
  ]);
}

export function prepareWorkspaceLogPortal(hostWorkspacePath: string): void {
  prepareSeroLogSources();
  const logsDir = path.join(hostWorkspacePath, '.sero', 'logs');
  const readmePath = path.join(logsDir, 'README.md');
  fs.mkdirSync(logsDir, { recursive: true });
  if (fs.existsSync(readmePath) && fs.readFileSync(readmePath, 'utf8') === LOG_README) {
    return;
  }
  fs.writeFileSync(readmePath, LOG_README, 'utf8');
}

function prepareSeroLogSources(): void {
  for (const dir of [path.join(SERO_FIXED_ROOT, 'logs'), path.join(SERO_HOME, 'logs')]) {
    fs.mkdirSync(dir, { recursive: true });
    const sentinelPath = path.join(dir, LOG_PORTAL_SENTINEL_FILE);
    if (fs.existsSync(sentinelPath)) continue;
    fs.writeFileSync(sentinelPath, 'Sero log portal mount marker.\n', 'utf8');
  }
}

function readOnlyMount(source: string, label: string): ContainerBindMount {
  return {
    source,
    target: path.posix.join(WORKSPACE_LOGS_DIR, label),
    readonly: true,
  };
}

function dedupeMounts(mounts: ContainerBindMount[]): ContainerBindMount[] {
  const seenSources = new Set<string>();
  const seenTargets = new Set<string>();
  const result: ContainerBindMount[] = [];
  for (const mount of mounts) {
    const source = path.resolve(mount.source);
    const target = path.posix.normalize(mount.target);

    // Apple Container turns each bind mount into a VirtioFS device and rejects
    // a VM config when the same host source is attached twice, even if the two
    // guest targets differ. This happens for the default profile where
    // SERO_FIXED_ROOT/logs and SERO_HOME/logs are the same directory.
    if (seenSources.has(source) || seenTargets.has(target)) continue;
    seenSources.add(source);
    seenTargets.add(target);
    result.push(mount);
  }
  return result;
}
