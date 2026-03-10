/**
 * Container lifecycle operations: system management, create, start, stop, delete.
 * Handles resilience (XPC recovery, ghost containers, stale name cleanup).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

import {
  CONTAINER_BIN,
  DEFAULT_IMAGE,
  DEFAULT_CPUS,
  DEFAULT_MEMORY_MB,
  WORKSPACE_MOUNT,
  isGhostError,
  containerId,
  containerStoragePath,
  errorMessage,
  type ContainerConfig,
  type ContainerState,
  type ExecResult,
} from './types';

const execFileAsync = promisify(execFile);

/* ── Host git identity ────────────────────────────────────── */

/** Read the host's global git user.name / user.email. Cached for the process lifetime. */
let _hostGitIdentity: { name: string; email: string } | null = null;

async function readHostGitIdentity(): Promise<{ name: string; email: string }> {
  if (_hostGitIdentity) return _hostGitIdentity;

  let name = '';
  let email = '';
  try {
    const n = await execFileAsync('git', ['config', '--global', 'user.name'], { timeout: 5_000 });
    name = n.stdout.trim();
  } catch { /* not configured */ }
  try {
    const e = await execFileAsync('git', ['config', '--global', 'user.email'], { timeout: 5_000 });
    email = e.stdout.trim();
  } catch { /* not configured */ }

  _hostGitIdentity = { name, email };
  return _hostGitIdentity;
}

/* ── System management ────────────────────────────────────── */

/** Ensure the container API server is running. Safe to call multiple times. */
export async function ensureSystemRunning(): Promise<void> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], {
      timeout: 10_000,
    });
    if (stdout.includes('running')) return;
  } catch {
    /* server is likely not running */
  }

  console.log('[container] API server not running, starting...');
  try {
    await execFileAsync(CONTAINER_BIN, ['system', 'start'], { timeout: 30_000 });
    await waitForSystem(15_000);
    console.log('[container] API server started successfully');
  } catch (err: unknown) {
    console.error('[container] Failed to start API server:', errorMessage(err));
    throw new Error(`Container system failed to start: ${errorMessage(err)}`);
  }
}

/** Poll until the container API server responds, or timeout. */
export async function waitForSystem(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], {
        timeout: 5_000,
      });
      if (stdout.includes('running')) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('Container API server did not become ready in time');
}

/**
 * Restart the container API server. Nuclear option — only for clearing ghost containers.
 * WARNING: Destroys ALL running containers.
 */
export async function restartSystem(): Promise<void> {
  console.warn('[container] Restarting API server (nuclear — clears ghosts, kills all containers)');
  try {
    await execFileAsync(CONTAINER_BIN, ['system', 'stop'], { timeout: 15_000 });
  } catch {
    /* may already be stopped */
  }
  await new Promise((r) => setTimeout(r, 2_000));
  await execFileAsync(CONTAINER_BIN, ['system', 'start'], { timeout: 30_000 });
  await waitForSystem(15_000);
  console.log('[container] API server restarted successfully');
}

/* ── Ghost container recovery ─────────────────────────────── */

/** Clear a ghost container by restarting the API server (last resort). */
export async function clearGhostContainer(cid: string): Promise<void> {
  console.warn(`[container] Ghost container detected: ${cid}`);
  const storageDir = containerStoragePath(cid);
  if (fs.existsSync(storageDir)) {
    console.log(`[container] Removing corrupted storage for ${cid}`);
    try {
      fs.rmSync(storageDir, { recursive: true, force: true });
    } catch (rmErr: unknown) {
      console.warn('[container] Could not remove storage dir:', errorMessage(rmErr));
    }
  }
  await restartSystem();
}

/* ── Container lifecycle ──────────────────────────────────── */

/** Check whether a delete/force error is just "container not found" (harmless). */
function isNotFoundError(err: unknown): boolean {
  const msg = errorMessage(err);
  return msg.includes('not found') || msg.includes('no such container') || msg.includes('does not exist');
}

/**
 * Force-remove a container, escalating to ghost recovery only when necessary.
 *
 * - If `delete --force` succeeds → done.
 * - If it fails with "not found" → the name is already free, done.
 * - If it fails with a ghost error → clear storage + restart system.
 * - Any other failure → also escalate (the name is stuck).
 */
async function forceRemoveContainer(cid: string): Promise<void> {
  try {
    await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
  } catch (delErr: unknown) {
    if (isNotFoundError(delErr)) return; // Already gone — nothing to do
    console.warn(`[container] delete --force failed for ${cid}, escalating to ghost recovery`);
    await clearGhostContainer(cid);
  }
}

/**
 * Check if a container already exists and try to get it running.
 * Returns the container state if successful, null if we need to create fresh.
 */
export async function resolveExistingContainer(
  workspaceId: string,
  cid: string,
  inspectFn: (wsId: string) => Promise<ContainerState>,
  containerMap: Map<string, string>,
): Promise<ContainerState | null> {
  let existing: ContainerState;
  try {
    existing = await inspectFn(workspaceId);
  } catch {
    // Container doesn't exist — try cleaning any stale name reservation.
    // This is a light-touch attempt; if delete fails with "not found"
    // that's fine — the name is already free for creation.
    try {
      await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
    } catch {
      // Ignore — if the container truly doesn't exist, nothing to delete.
    }
    return null;
  }

  // Running — reuse
  if (existing.state === 'running') {
    console.log(`[container] ${cid} already running, reusing`);
    containerMap.set(workspaceId, cid);
    return existing;
  }

  // Stopped — try to start
  console.log(`[container] ${cid} exists but stopped, starting...`);
  try {
    await execFileAsync(CONTAINER_BIN, ['start', cid], { timeout: 30_000 });
    containerMap.set(workspaceId, cid);
    return await inspectFn(workspaceId);
  } catch (startErr: unknown) {
    console.warn(`[container] Failed to start ${cid}:`, errorMessage(startErr));
  }

  // Start failed — force-remove (escalates to ghost recovery if needed)
  console.log(`[container] Removing corrupted container ${cid}, will recreate`);
  await forceRemoveContainer(cid);

  return null;
}

/**
 * Create a fresh container for a workspace.
 */
export async function createFreshContainer(
  config: ContainerConfig,
  cid: string,
  containerMap: Map<string, string>,
  execFn: (wsId: string, cmd: string, cwd?: string) => Promise<ExecResult>,
  inspectFn: (wsId: string) => Promise<ContainerState>,
  proxyUrl?: string,
): Promise<ContainerState> {
  // Ensure host workspace directory exists
  fs.mkdirSync(config.hostPath, { recursive: true });

  const args: string[] = [
    'run',
    '--name',
    cid,
    '-d',
    '--cpus',
    String(config.cpus ?? DEFAULT_CPUS),
    '--memory',
    `${config.memoryMB ?? DEFAULT_MEMORY_MB}M`,
    '--network',
    'default',
    '--ssh',
    '--volume',
    `${config.hostPath}:${WORKSPACE_MOUNT}`,
  ];

  // Bind-mount additional host directories (skills, prompts, etc.)
  // at the same absolute path so agent references resolve correctly.
  for (const hostDir of config.readOnlyMounts ?? []) {
    if (fs.existsSync(hostDir)) {
      args.push('--volume', `${hostDir}:${hostDir}`);
    }
  }

  // Bind-mount writable directories (e.g. global workspace) at the same
  // absolute path so cross-workspace file operations work transparently.
  for (const hostDir of config.writableMounts ?? []) {
    if (fs.existsSync(hostDir)) {
      args.push('--volume', `${hostDir}:${hostDir}`);
    }
  }

  args.push(config.image ?? DEFAULT_IMAGE, 'sleep', 'infinity');

  // Profile sets TERM, HOST bindings, and proxy for all shells.
  const profileLines = [
    'export TERM=xterm-256color',
    'export HOST=0.0.0.0',
    'export VITE_HOST=0.0.0.0',
    'export HOSTNAME=0.0.0.0',
  ];
  if (proxyUrl) {
    profileLines.push(
      `export HTTP_PROXY=${proxyUrl}`,
      `export HTTPS_PROXY=${proxyUrl}`,
      `export http_proxy=${proxyUrl}`,
      `export https_proxy=${proxyUrl}`,
      'export NO_PROXY=localhost,127.0.0.1,192.168.64.0/24',
    );
  }
  const profileScript = profileLines.join('\n');
  const writeProfile = `mkdir -p /etc/profile.d && echo '${profileScript}' > /etc/profile.d/sero-env.sh`;
  const writeBashrc = `echo '${profileScript}' >> /root/.bashrc`;

  try {
    await execFileAsync(CONTAINER_BIN, args, { timeout: 60_000 });
  } catch (err: unknown) {
    const errStr = String((err as Record<string, unknown>).stderr || errorMessage(err));

    // If a stale container with the same name exists (e.g. from a previous
    // run that wasn't cleaned up), force-remove it (escalating to ghost
    // recovery if needed) and retry once.
    if (errStr.includes('already exists')) {
      console.warn(`[container] Stale container ${cid} detected, force-removing and retrying...`);
      await forceRemoveContainer(cid);
      try {
        await execFileAsync(CONTAINER_BIN, args, { timeout: 60_000 });
      } catch (retryErr: unknown) {
        const re = retryErr as Record<string, unknown>;
        throw new Error(`Failed to create container ${cid} after cleanup: ${re.stderr || errorMessage(retryErr)}`);
      }
    } else {
      throw new Error(`Failed to create container ${cid}: ${errStr}`);
    }
  }

  containerMap.set(config.workspaceId, cid);

  // Inject environment so dev servers bind 0.0.0.0 by default
  try {
    await execFn(config.workspaceId, writeProfile);
    await execFn(config.workspaceId, writeBashrc);
  } catch {
    /* non-fatal — prompt still tells agent to use --host */
  }

  // Ensure DNS resolution works inside the container.
  // Apple Container's vmnet NAT doesn't always configure resolv.conf,
  // so we set public DNS servers as a fallback.
  try {
    await execFn(
      config.workspaceId,
      'grep -q "nameserver" /etc/resolv.conf 2>/dev/null || ' +
        'printf "nameserver 8.8.8.8\\nnameserver 1.1.1.1\\n" > /etc/resolv.conf',
    );
  } catch {
    /* non-fatal — proxy handles DNS when available */
  }

  // Initialize workspace as a Git repo (idempotent)
  try {
    await execFn(
      config.workspaceId,
      'cd /workspace && [ -d .git ] || git init >/dev/null 2>&1',
    );
  } catch {
    /* non-fatal */
  }

  // Propagate the host's git identity into the container so that
  // `git commit` (used by vcs checkpoint) works without manual config.
  // Also set push.autoSetupRemote so first pushes don't require --set-upstream.
  try {
    const hostIdentity = await readHostGitIdentity();
    const gitCfgCmds: string[] = [];
    if (hostIdentity.name) {
      gitCfgCmds.push(`git config --global user.name '${hostIdentity.name.replace(/'/g, `'"'"'`)}'`);
    }
    if (hostIdentity.email) {
      gitCfgCmds.push(`git config --global user.email '${hostIdentity.email.replace(/'/g, `'"'"'`)}'`);
    }
    gitCfgCmds.push('git config --global push.autoSetupRemote true');
    await execFn(config.workspaceId, gitCfgCmds.join(' && '));
  } catch {
    /* non-fatal — commits will fail with "tell me who you are" but everything else works */
  }

  return inspectFn(config.workspaceId);
}

/** Minimal shape expected from `container inspect` output. */
interface InspectData {
  status?: string;
  configuration?: {
    image?: { reference?: string };
    resources?: { cpus?: number; memoryInBytes?: number };
  };
  networks?: Array<{ ipv4Address?: string }>;
}

/** Inspect a container and return its state. */
export async function inspectContainer(
  workspaceId: string,
  containerMap: Map<string, string>,
): Promise<ContainerState> {
  const cid = containerMap.get(workspaceId) ?? containerId(workspaceId);

  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', cid], {
      timeout: 10_000,
    });
    const raw: unknown = JSON.parse(stdout);

    // `container inspect` may return an object or a single-element array.
    const info: InspectData =
      (Array.isArray(raw) ? raw[0] : raw) as InspectData;

    if (typeof info !== 'object' || info === null) {
      throw new Error(`Unexpected inspect output for ${cid}`);
    }

    const config = info.configuration ?? {};
    const networks = info.networks ?? [];
    const ipAddress = networks[0]?.ipv4Address?.replace(/\/\d+$/, '');

    return {
      id: cid,
      image: config.image?.reference ?? 'unknown',
      state: info.status === 'running' ? 'running' : 'stopped',
      ipAddress,
      cpus: config.resources?.cpus ?? 0,
      memoryBytes: config.resources?.memoryInBytes ?? 0,
    };
  } catch (err: unknown) {
    throw new Error(`Container ${cid} not found: ${errorMessage(err)}`);
  }
}

/** Stop a running container. */
export async function stopContainer(
  workspaceId: string,
  containerMap: Map<string, string>,
): Promise<void> {
  const cid = containerMap.get(workspaceId) ?? containerId(workspaceId);
  try {
    await execFileAsync(CONTAINER_BIN, ['stop', cid], { timeout: 15_000 });
  } catch {
    /* May already be stopped */
  }
}

/** Remove a container (force delete handles both running and stopped). */
export async function removeContainer(
  workspaceId: string,
  containerMap: Map<string, string>,
): Promise<void> {
  const cid = containerMap.get(workspaceId) ?? containerId(workspaceId);
  try {
    await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
  } catch {
    /* May already be removed */
  }
  containerMap.delete(workspaceId);
}

/** List all Sero-managed containers. */
export async function listContainers(
  inspectFn: (wsId: string) => Promise<ContainerState>,
): Promise<ContainerState[]> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['list'], { timeout: 10_000 });
    const lines = stdout.trim().split('\n').slice(1); // Skip header
    const states: ContainerState[] = [];

    for (const line of lines) {
      const parts = line.split(/\s{2,}/);
      if (parts.length < 2) continue;
      const id = parts[0].trim();
      if (!id.startsWith('sero-')) continue;

      const workspaceId = id.replace(/^sero-/, '');
      try {
        states.push(await inspectFn(workspaceId));
      } catch {
        /* Skip containers we can't inspect */
      }
    }

    return states;
  } catch {
    return [];
  }
}
