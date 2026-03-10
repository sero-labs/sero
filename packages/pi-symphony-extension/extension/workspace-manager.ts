/**
 * Workspace lifecycle — creates isolated directories per issue.
 *
 * Handles workspace creation, hook execution, cleanup, and safety
 * invariants (path must be under workspace root).
 */

import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import type { HooksConfig, WorkspaceConfig } from '../shared/types';
import { info, warn, error as logError } from './logger';

// ── Sanitize identifier for filesystem ─────────────────────────

function sanitizeKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, '_');
}

// ── Safety check: path must be under root ──────────────────────

function assertUnderRoot(targetPath: string, root: string): void {
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(root);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(
      `Safety violation: path "${resolved}" is not under workspace root "${resolvedRoot}"`,
    );
  }
}

// ── Hook execution ─────────────────────────────────────────────

function runHook(
  name: string,
  script: string,
  cwd: string,
  timeoutMs: number,
): void {
  info('workspace:hook-start', { name, cwd });
  try {
    execSync(script, {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: '/bin/bash',
    });
    info('workspace:hook-done', { name });
  } catch (err) {
    logError('workspace:hook-failed', {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Workspace manager ──────────────────────────────────────────

export class WorkspaceManager {
  private workspaceRoot: string;
  private hooks: HooksConfig;

  constructor(workspaceConfig: WorkspaceConfig, hooksConfig: HooksConfig) {
    this.workspaceRoot = workspaceConfig.root;
    this.hooks = hooksConfig;
  }

  /** Create a workspace directory for an issue. Returns the workspace path. */
  async createForIssue(identifier: string): Promise<string> {
    const key = sanitizeKey(identifier);
    const workspacePath = path.join(this.workspaceRoot, key);

    assertUnderRoot(workspacePath, this.workspaceRoot);

    await fs.mkdir(workspacePath, { recursive: true });
    info('workspace:created', { identifier, path: workspacePath });

    // Run after_clone hook if configured
    if (this.hooks.after_clone) {
      try {
        runHook('after_clone', this.hooks.after_clone, workspacePath, this.hooks.timeout_ms);
      } catch (err) {
        warn('workspace:after-clone-failed', {
          identifier,
          error: err instanceof Error ? err.message : String(err),
        });
        // Don't fail workspace creation on hook failure
      }
    }

    return workspacePath;
  }

  /** Check if a workspace exists for an issue. */
  async exists(identifier: string): Promise<boolean> {
    const key = sanitizeKey(identifier);
    const workspacePath = path.join(this.workspaceRoot, key);
    try {
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Get the workspace path for an issue. */
  getPath(identifier: string): string {
    const key = sanitizeKey(identifier);
    return path.join(this.workspaceRoot, key);
  }

  /** Clean up a workspace — run before_remove hook, then delete. */
  async cleanWorkspace(identifier: string): Promise<void> {
    const key = sanitizeKey(identifier);
    const workspacePath = path.join(this.workspaceRoot, key);

    assertUnderRoot(workspacePath, this.workspaceRoot);

    // Run before_remove hook if configured
    if (this.hooks.before_remove) {
      try {
        runHook('before_remove', this.hooks.before_remove, workspacePath, this.hooks.timeout_ms);
      } catch (err) {
        warn('workspace:before-remove-failed', {
          identifier,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      info('workspace:cleaned', { identifier, path: workspacePath });
    } catch (err) {
      logError('workspace:clean-failed', {
        identifier,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
