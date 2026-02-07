/**
 * Container lifecycle operations: system management, create, start, stop, delete.
 * Handles resilience (XPC recovery, ghost containers, stale name cleanup).
 */
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

import {
  CONTAINER_BIN, DEFAULT_IMAGE, DEFAULT_CPUS, DEFAULT_MEMORY_MB, SERO_LABEL_KEY,
  isXpcError, isGhostError,
  containerId, hostWorkspacePath, containerStoragePath,
  type ContainerConfig, type ContainerState, type ExecResult,
} from './types';
import { loadEnvVars } from '../persistence';

const execFileAsync = promisify(execFile);

/* ── System management ────────────────────────────────────── */

/**
 * Ensure the container API server is running.
 * Safe to call multiple times — only starts if not already running.
 */
export async function ensureSystemRunning(): Promise<void> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], { timeout: 10_000 });
    if (stdout.includes('running')) return;
  } catch { /* server is likely not running */ }

  console.log('[sero] Container API server not running, starting...');
  try {
    await execFileAsync(CONTAINER_BIN, ['system', 'start'], { timeout: 30_000 });
    await waitForSystem(15_000);
    console.log('[sero] Container API server started successfully');
  } catch (err: any) {
    console.error('[sero] Failed to start container API server:', err?.message);
    throw new Error(`Container system failed to start: ${err?.message}`);
  }
}

/** Poll until the container API server responds, or timeout. */
export async function waitForSystem(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], { timeout: 5_000 });
      if (stdout.includes('running')) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error('Container API server did not become ready in time');
}

/**
 * Restart the container API server. Nuclear option — only for clearing ghost containers.
 * Stops ALL running containers.
 */
export async function restartSystem(): Promise<void> {
  console.warn('[sero] Restarting container API server (nuclear option — clears ghosts but kills all containers)');
  try {
    await execFileAsync(CONTAINER_BIN, ['system', 'stop'], { timeout: 15_000 });
  } catch { /* may already be stopped */ }
  await new Promise(r => setTimeout(r, 2_000));
  await execFileAsync(CONTAINER_BIN, ['system', 'start'], { timeout: 30_000 });
  await waitForSystem(15_000);
  console.log('[sero] Container API server restarted successfully');
}

/* ── Container lifecycle ──────────────────────────────────── */

/** Ensure the host workspace directory exists */
function ensureWorkspaceDir(projectId: string): string {
  const dir = hostWorkspacePath(projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clear a ghost container by restarting the API server.
 * This is the nuclear option but is the ONLY way to clear ghosts.
 */
export async function clearGhostContainer(cid: string): Promise<void> {
  console.warn(`[sero] Ghost container detected: ${cid}`);
  const storageDir = containerStoragePath(cid);
  if (fs.existsSync(storageDir)) {
    console.log(`[sero] Removing corrupted storage directory for ${cid}`);
    try {
      fs.rmSync(storageDir, { recursive: true, force: true });
    } catch (rmErr: any) {
      console.warn(`[sero] Could not remove storage dir:`, rmErr?.message);
    }
  }
  await restartSystem();
}

/**
 * Check if a container already exists and try to get it running.
 * Returns the container state if successful, null if we need to create fresh.
 */
export async function resolveExistingContainer(
  projectId: string,
  cid: string,
  inspectFn: (pid: string) => Promise<ContainerState>,
  containerMap: Map<string, string>,
): Promise<ContainerState | null> {
  let existing: ContainerState;
  try {
    existing = await inspectFn(projectId);
  } catch {
    // Container doesn't exist — clean any stale name reservation
    try {
      await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
    } catch (delErr: any) {
      if (isGhostError(delErr)) {
        await clearGhostContainer(cid);
      }
    }
    return null;
  }

  // Running — reuse
  if (existing.state === 'running') {
    console.log(`[sero] Container ${cid} already running, reusing`);
    containerMap.set(projectId, cid);
    return existing;
  }

  // Stopped — try to start
  console.log(`[sero] Container ${cid} exists but stopped, starting...`);
  try {
    await execFileAsync(CONTAINER_BIN, ['start', cid], { timeout: 30_000 });
    containerMap.set(projectId, cid);
    return await inspectFn(projectId);
  } catch (startErr: any) {
    console.warn(`[sero] Failed to start ${cid}:`, startErr?.message);
  }

  // Start failed — delete and let caller create fresh
  try {
    await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
    console.log(`[sero] Deleted corrupted container ${cid}, will recreate`);
  } catch (delErr: any) {
    if (isGhostError(delErr)) {
      await clearGhostContainer(cid);
    } else {
      console.warn(`[sero] Delete failed for ${cid}:`, delErr?.message);
    }
  }

  return null;
}

/**
 * Create a completely fresh container.
 */
export async function createFreshContainer(
  config: ContainerConfig,
  cid: string,
  containerMap: Map<string, string>,
  execFn: (pid: string, cmd: string, cwd?: string) => Promise<ExecResult>,
  inspectFn: (pid: string) => Promise<ContainerState>,
): Promise<ContainerState> {
  const hostWorkspace = ensureWorkspaceDir(config.id);

  const args: string[] = [
    'run',
    '--name', cid,
    '-d',
    '--cpus', String(config.cpus ?? DEFAULT_CPUS),
    '--memory', `${config.memoryMB ?? DEFAULT_MEMORY_MB}M`,
    '--network', 'default',
    '-l', `${SERO_LABEL_KEY}=${config.id}`,
    '--volume', `${hostWorkspace}:/workspace`,
  ];

  for (const port of config.ports ?? []) {
    args.push('-p', `${port.host}:${port.container}`);
  }

  if (config.volumes) {
    for (const vol of config.volumes) {
      let mount = `type=bind,source=${vol.hostPath},target=${vol.containerPath}`;
      if (vol.readonly) mount += ',readonly';
      args.push('--mount', mount);
    }
  }

  args.push(config.image ?? DEFAULT_IMAGE, 'sleep', 'infinity');

  try {
    await execFileAsync(CONTAINER_BIN, args, { timeout: 30_000 });
  } catch (err: any) {
    throw new Error(`Failed to create container ${cid}: ${err.stderr || err.message}`);
  }

  containerMap.set(config.id, cid);

  // Initialize workspace: git init if not already a repo
  try {
    await execFn(config.id, 'cd /workspace && [ -d .git ] || git init -q');
  } catch { /* non-fatal */ }

  return inspectFn(config.id);
}

/**
 * Inspect a container and return its state.
 */
export async function inspectContainer(projectId: string, containerMap: Map<string, string>): Promise<ContainerState> {
  const cid = containerMap.get(projectId) ?? containerId(projectId);

  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', cid]);
    const data = JSON.parse(stdout);
    const info = Array.isArray(data) ? data[0] : data;

    const config = info.configuration ?? {};
    const networks = info.networks ?? [];
    const ipAddress = networks[0]?.ipv4Address?.replace(/\/\d+$/, '');

    const publishedPorts = (config.publishedPorts ?? []).map((p: any) => ({
      host: p.hostPort,
      container: p.containerPort,
    }));

    return {
      id: cid,
      image: config.image?.reference ?? 'unknown',
      state: info.status === 'running' ? 'running' : 'stopped',
      ipAddress,
      cpus: config.resources?.cpus ?? 0,
      memoryBytes: config.resources?.memoryInBytes ?? 0,
      ports: publishedPorts,
    };
  } catch (err: any) {
    throw new Error(`Container ${cid} not found: ${err.message}`);
  }
}

/**
 * Stop a running container.
 */
export async function stopContainer(projectId: string, containerMap: Map<string, string>): Promise<void> {
  const cid = containerMap.get(projectId) ?? containerId(projectId);
  try {
    await execFileAsync(CONTAINER_BIN, ['stop', cid], { timeout: 15_000 });
  } catch { /* May already be stopped */ }
}

/**
 * Remove a container (force delete handles both running and stopped).
 */
export async function removeContainer(projectId: string, containerMap: Map<string, string>): Promise<void> {
  const cid = containerMap.get(projectId) ?? containerId(projectId);
  try {
    await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
  } catch { /* May already be removed */ }
  containerMap.delete(projectId);
}

/**
 * List all Sero-managed containers.
 */
export async function listContainers(
  inspectFn: (pid: string) => Promise<ContainerState>,
): Promise<ContainerState[]> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['list']);
    const lines = stdout.trim().split('\n').slice(1); // Skip header
    const states: ContainerState[] = [];

    for (const line of lines) {
      const parts = line.split(/\s{2,}/);
      if (parts.length < 2) continue;
      const id = parts[0].trim();
      if (!id.startsWith('sero-')) continue;

      const projectId = id.replace('sero-', '');
      try {
        states.push(await inspectFn(projectId));
      } catch { /* Skip containers we can't inspect */ }
    }

    return states;
  } catch {
    return [];
  }
}
