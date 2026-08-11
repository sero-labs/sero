import { execFile } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { ContainerConfig, ContainerState } from '@electron/features/container/core/types';
import { containerId, DEFAULT_CPUS, DEFAULT_IMAGE, DEFAULT_MEMORY_MB } from '@electron/features/container/core/types';
import {
  SERO_MANAGED_LABEL,
  SERO_INSTALLATION_ROOT,
  SERO_INSTALLATION_ROOT_LABEL,
  labelsBelongToCurrentInstallation,
  SERO_RUNTIME_LABEL,
  SERO_WORKSPACE_ID_LABEL,
  SERO_WORKSPACE_PATH_LABEL,
} from '@electron/features/container/core/ownership';
import { prepareWorkspaceLogPortal } from '@electron/features/container/core/log-access';
import { mountArgs, buildDockerMounts } from './docker-mounts';
import { checkDocker, type DockerRunner } from './docker-cli';
import { buildPreviewInternalPorts } from '../preview-port-pool';

const execFileAsync = promisify(execFile);
const GIT_IDENTITY_TTL_MS = 5 * 60 * 1000;
let cachedGitIdentity: { name: string; email: string } | null = null;
let cachedGitIdentityFetchedAt = 0;

export interface DockerLifecycleOptions {
  config: ContainerConfig;
  imageRef: string;
  imageId?: string;
  run?: DockerRunner;
  previewPortPoolSize?: number;
}

interface DockerInspectData {
  Id?: string;
  Image?: string;
  Config?: { Image?: string; Labels?: Record<string, string> };
  State?: { Running?: boolean; Status?: string };
  Mounts?: Array<{ Type?: string; Source?: string; Destination?: string; RW?: boolean }>;
  HostConfig?: { NanoCpus?: number; Memory?: number };
}

export function dockerContainerName(workspaceId: string): string {
  return containerId(workspaceId);
}

export async function ensureDockerContainer(options: DockerLifecycleOptions): Promise<ContainerState> {
  const run = options.run ?? checkDocker;
  const cid = dockerContainerName(options.config.workspaceId);
  mkdirSync(options.config.hostPath, { recursive: true });
  prepareWorkspaceLogPortal(options.config.hostPath);
  const existing = await inspectDockerContainer(cid, run).catch(() => null);
  if (existing) {
    if (isExpectedContainer(existing, options.config, options.imageRef, options.imageId)) {
      if (existing.State?.Running) {
        await configureGitIdentity(options.config.workspaceId, run);
        return toContainerState(cid, existing, options.imageRef);
      }
      const start = await run(['start', cid], { timeoutMs: 30_000 });
      if (start.exitCode === 0) {
        const restarted = await inspectDockerContainer(cid, run).catch(() => null);
        if (restarted?.State?.Running) {
          await configureGitIdentity(options.config.workspaceId, run);
          return toContainerState(cid, restarted, options.imageRef);
        }
      }
    }
    if (!isSeroOwnedDockerContainer(existing, options.config.workspaceId)) {
      throw new Error(`Docker container name collision: ${cid} is not owned by Sero.`);
    }
    await removeDockerContainer(cid, run);
  }

  const created = await run(createDockerRunArgs(options.config, options.imageRef, options.previewPortPoolSize), { timeoutMs: 60_000 });
  if (created.exitCode !== 0) {
    throw new Error(`Failed to create Docker container ${cid}: ${created.stderr || created.stdout}`.trim());
  }
  await configureGitIdentity(options.config.workspaceId, run);
  await run(['exec', cid, 'sh', '-lc', 'cd /workspace && [ -d .git ] || git init >/dev/null 2>&1'], { timeoutMs: 30_000 });
  return toContainerState(cid, await inspectDockerContainer(cid, run), options.imageRef);
}

export function createDockerRunArgs(config: ContainerConfig, imageRef: string = DEFAULT_IMAGE, previewPortPoolSize = 0): string[] {
  const cid = dockerContainerName(config.workspaceId);
  const args = [
    'run', '-d', '--name', cid, '--init',
    '--label', `${SERO_MANAGED_LABEL}=true`,
    '--label', `${SERO_RUNTIME_LABEL}=docker`,
    '--label', `${SERO_WORKSPACE_ID_LABEL}=${config.workspaceId}`,
    '--label', `${SERO_WORKSPACE_PATH_LABEL}=${config.hostPath}`,
    '--label', `${SERO_INSTALLATION_ROOT_LABEL}=${SERO_INSTALLATION_ROOT}`,
    '--label', `ai.sero.image=${imageRef}`,
    '--workdir', '/workspace',
    '--cpus', String(config.cpus ?? DEFAULT_CPUS),
    '--memory', `${config.memoryMB ?? DEFAULT_MEMORY_MB}M`,
    ...runtimeEnvArgs(),
    ...userArgs(),
    ...dockerPreviewPublishArgs(previewPortPoolSize),
    ...mountArgs(buildDockerMounts(config)),
    imageRef,
    'sleep', 'infinity',
  ];
  return args;
}

export function runtimeEnvArgs(extraEnv: Record<string, string> = {}): string[] {
  return Object.entries({
    TERM: 'xterm-256color',
    HOST: '0.0.0.0',
    VITE_HOST: '0.0.0.0',
    HOSTNAME: '0.0.0.0',
    SERO_RUNTIME_BACKEND: 'docker',
    PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
    HOME: '/tmp/sero-home',
    ...extraEnv,
  }).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
}

export function userArgs(): string[] {
  if (process.platform === 'win32') return [];
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') return [];
  return ['--user', `${process.getuid()}:${process.getgid()}`];
}

export async function inspectDockerContainer(cid: string, run: DockerRunner = checkDocker): Promise<DockerInspectData> {
  const result = await run(['inspect', cid], { timeoutMs: 10_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || `Docker container ${cid} not found`);
  const parsed = JSON.parse(result.stdout) as unknown;
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || typeof first !== 'object') throw new Error(`Unexpected docker inspect output for ${cid}`);
  return first as DockerInspectData;
}

export async function removeDockerContainer(cid: string, run: DockerRunner = checkDocker): Promise<void> {
  try {
    const result = await run(['rm', '-f', cid], { timeoutMs: 30_000 });
    if (result.exitCode !== 0 && !isDockerNotFound(result.stderr || result.stdout)) {
      throw new Error(result.stderr || result.stdout || `Failed to remove Docker container ${cid}`);
    }
  } catch (error) {
    if (!isDockerNotFound(error instanceof Error ? error.message : String(error))) throw error;
  }
}
export function isSeroOwnedDockerContainer(
  inspect: DockerInspectData,
  workspaceId: string,
): boolean {
  const labels = inspect.Config?.Labels ?? {};
  if (labels[SERO_MANAGED_LABEL] !== 'true'
    || labels[SERO_RUNTIME_LABEL] !== 'docker'
    || labels[SERO_WORKSPACE_ID_LABEL] !== workspaceId) return false;
  const installationRoot = labels[SERO_INSTALLATION_ROOT_LABEL];
  return !installationRoot || path.resolve(installationRoot) === SERO_INSTALLATION_ROOT;
}

function isDockerNotFound(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('no such container') || normalized.includes('not found');
}

export function toContainerState(cid: string, inspect: DockerInspectData, imageRef: string): ContainerState {
  return {
    id: cid,
    image: inspect.Config?.Image ?? imageRef,
    state: inspect.State?.Running ? 'running' : 'stopped',
    cpus: DEFAULT_CPUS,
    memoryBytes: inspect.HostConfig?.Memory ?? DEFAULT_MEMORY_MB * 1024 * 1024,
  };
}

function dockerPreviewPublishArgs(poolSize: number): string[] {
  if (poolSize <= 0) return [];
  return buildPreviewInternalPorts(poolSize).flatMap((internalPort) => ['-p', `127.0.0.1::${internalPort}`]);
}

function isExpectedContainer(inspect: DockerInspectData, config: ContainerConfig, imageRef: string, imageId?: string): boolean {
  const labels = inspect.Config?.Labels ?? {};
  if (!isSeroOwnedDockerContainer(inspect, config.workspaceId)) return false;
  if (!labelsBelongToCurrentInstallation(labels)) return false;
  if (labels['ai.sero.image'] !== imageRef) return false;
  if (imageId && inspect.Image !== imageId) return false;
  return mountSignaturesMatch(expectedMountSignature(config), actualMountSignature(inspect));
}

function expectedMountSignature(config: ContainerConfig): Set<string> {
  return new Set(buildDockerMounts(config).map((mount) => mountSignature(
    mount.source,
    mount.target,
    mount.readonly === true ? 'ro' : 'rw',
  )));
}

function actualMountSignature(inspect: DockerInspectData): Set<string> {
  return new Set((inspect.Mounts ?? [])
    .filter((mount) => !mount.Type || mount.Type === 'bind')
    .map((mount) => mountSignature(
      mount.Source ?? '',
      mount.Destination ?? '',
      mount.RW === false ? 'ro' : 'rw',
    )));
}

function mountSignaturesMatch(expected: Set<string>, actual: Set<string>): boolean {
  if (expected.size !== actual.size) return false;
  for (const signature of expected) {
    if (!actual.has(signature)) return false;
  }
  return true;
}

function mountSignature(source: string, target: string, mode: 'ro' | 'rw'): string {
  return `${source}->${target}:${mode}`;
}

async function configureGitIdentity(workspaceId: string, run: DockerRunner): Promise<void> {
  const identity = await readHostGitIdentity();
  const cid = dockerContainerName(workspaceId);
  await run(['exec', cid, 'sh', '-lc', 'git config --global --get-all safe.directory | grep -Fx /workspace >/dev/null || git config --global --add safe.directory /workspace'], { timeoutMs: 10_000 });
  await run(['exec', cid, 'git', 'config', '--global', 'push.autoSetupRemote', 'true'], { timeoutMs: 10_000 });
  if (identity.name) await run(['exec', cid, 'git', 'config', '--global', 'user.name', identity.name], { timeoutMs: 10_000 });
  if (identity.email) await run(['exec', cid, 'git', 'config', '--global', 'user.email', identity.email], { timeoutMs: 10_000 });
}

async function readHostGitIdentity(): Promise<{ name: string; email: string }> {
  if (cachedGitIdentity && Date.now() - cachedGitIdentityFetchedAt < GIT_IDENTITY_TTL_MS) return cachedGitIdentity;
  cachedGitIdentity = { name: await readGitConfig('user.name'), email: await readGitConfig('user.email') };
  cachedGitIdentityFetchedAt = Date.now();
  return cachedGitIdentity;
}

async function readGitConfig(key: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', key], { timeout: 5_000 });
    return stdout.trim();
  } catch {
    return '';
  }
}
