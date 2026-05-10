import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { GitResult } from '../support/types';

const SSH_AVAILABILITY_TTL_MS = 60_000;

interface SshAvailabilityCacheEntry {
  available: boolean;
  expiresAtMs: number;
}

const sshAvailabilityCache = new Map<string, SshAvailabilityCacheEntry>();

function cacheKey(workspaceId: string, runtime: RuntimeBackend): string {
  return `${workspaceId}:${runtime.backend}:${runtime.hostWorkspacePath}`;
}

async function isRuntimeSshAvailable(workspaceId: string, runtime: RuntimeBackend): Promise<boolean> {
  const key = cacheKey(workspaceId, runtime);
  const nowMs = Date.now();
  const cached = sshAvailabilityCache.get(key);
  if (cached && cached.expiresAtMs > nowMs) return cached.available;

  try {
    const available = await runtime.isSshAvailable();
    sshAvailabilityCache.set(key, { available, expiresAtMs: nowMs + SSH_AVAILABILITY_TTL_MS });
    return available;
  } catch (error) {
    console.warn('[git-runner] SSH probe failed; falling back to HTTPS-auth transport:', error);
    sshAvailabilityCache.set(key, { available: false, expiresAtMs: nowMs + SSH_AVAILABILITY_TTL_MS });
    return false;
  }
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') output[key] = value;
  }
  return output;
}

export function resetGitRunnerSshAvailabilityCacheForTests(): void {
  sshAvailabilityCache.clear();
}

export class GitRunner {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly runtimeManager: RuntimeManager,
    private readonly githubAuth?: GitHubAuthManager,
  ) {}

  async runCommand(
    workspaceId: string,
    program: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    return this.runCommandWithEnv(workspaceId, program, args, {}, timeoutMs);
  }

  async runCommandWithEnv(
    workspaceId: string,
    program: string,
    args: string[],
    extraEnv: NodeJS.ProcessEnv,
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    const workspacePath = this.workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Workspace not found: ${workspaceId}`,
      };
    }

    const runtime = await this.runtimeManager.getRuntime(workspaceId);
    const env = await this.buildGitEnv(workspaceId, runtime, program, extraEnv);

    return runtime.execFile({
      program,
      args,
      cwd: runtime.runtimeWorkspacePath,
      timeoutMs,
      env,
      injectGitAuth: false,
    });
  }

  private async buildGitEnv(
    workspaceId: string,
    runtime: RuntimeBackend,
    program: string,
    extraEnv: NodeJS.ProcessEnv,
  ): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    if (this.githubAuth && (program === 'git' || program === 'gh')) {
      const authVars = this.githubAuth.getAuthEnvVars();
      const sshWorks = await isRuntimeSshAvailable(workspaceId, runtime);
      if (sshWorks) {
        // Keep GH_TOKEN for gh CLI and retain the GitHub HTTPS auth header so
        // existing HTTPS remotes still authenticate, but drop the SSH→HTTPS
        // rewrite so SSH remotes continue using native SSH transport.
        if (authVars.GH_TOKEN) env.GH_TOKEN = authVars.GH_TOKEN;
        if (authVars.GIT_TERMINAL_PROMPT) env.GIT_TERMINAL_PROMPT = authVars.GIT_TERMINAL_PROMPT;
        if (authVars.GIT_CONFIG_VALUE_2) {
          env.GIT_CONFIG_COUNT = '1';
          env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
          env.GIT_CONFIG_VALUE_0 = authVars.GIT_CONFIG_VALUE_2;
        }
      } else {
        Object.assign(env, authVars);
      }
    }
    Object.assign(env, stringEnv(extraEnv));
    return env;
  }

  async run(workspaceId: string, args: string[], timeoutMs = 30_000): Promise<GitResult> {
    return this.runCommand(workspaceId, 'git', args, timeoutMs);
  }

  async runWithEnv(
    workspaceId: string,
    args: string[],
    extraEnv: NodeJS.ProcessEnv,
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    return this.runCommandWithEnv(workspaceId, 'git', args, extraEnv, timeoutMs);
  }

  async ensureRepoInitialized(workspaceId: string): Promise<void> {
    const root = await this.run(workspaceId, ['rev-parse', '--git-dir']);
    if (root.exitCode === 0) return;

    const init = await this.run(workspaceId, ['init', '-b', 'main']);
    if (init.exitCode === 0) return;

    const supportsInitialBranch = !/(unknown switch|unknown option|usage: git init)/i.test(
      init.stderr || init.stdout,
    );
    if (supportsInitialBranch) {
      throw new Error(init.stderr || 'Failed to initialize Git repository');
    }

    const fallback = await this.run(workspaceId, ['init']);
    if (fallback.exitCode !== 0) {
      throw new Error(fallback.stderr || fallback.stdout || 'Failed to initialize Git repository');
    }

    await this.run(workspaceId, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
}
