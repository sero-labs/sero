/**
 * Tests for verification command detection.
 *
 * Tests the detection logic using mock filesystem — does NOT execute commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectCompileCommands,
  detectDependencyInstallCommand,
  detectDevServerCommand,
  detectVerificationCommands,
  detectPackageManager,
  runDevServerSmokeCheck,
  runVerificationCommands,
  summarizeVerificationFailure,
} from '@electron/features/workspace/runtime/verification';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-verify-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', async () => {
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('detects pnpm from pnpm-workspace.yaml', async () => {
    await fs.writeFile(path.join(tmpDir, 'pnpm-workspace.yaml'), '');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('yarn');
  });

  it('defaults to npm when no lock file found', () => {
    expect(detectPackageManager(tmpDir)).toBe('npm');
  });
});

describe('detectVerificationCommands', () => {
  it('detects TypeScript project with typecheck script', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands).toContain('npm run typecheck');
  });

  it('skips typecheck when tsconfig exists but no typecheck script', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands.some((c) => c.includes('typecheck'))).toBe(false);
  });

  it('uses correct package manager for typecheck', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands).toContain('pnpm run typecheck');
  });

  it('detects test script in package.json', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands.some((c) => c.includes('test'))).toBe(true);
  });

  it('ignores default npm test stub', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands.some((c) => c.includes('test'))).toBe(false);
  });

  it('detects Cargo project', async () => {
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '');
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands).toContain('cargo check');
    expect(commands).toContain('cargo test');
  });

  it('detects Python project', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), '');
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands).toContain('pytest');
  });

  it('excludes test commands when testing is disabled', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', test: 'vitest' } }),
    );
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '');

    const commands = await detectVerificationCommands(tmpDir, { testingEnabled: false });
    // Typecheck should still be included (correctness, not testing)
    expect(commands.some((c) => c.includes('typecheck'))).toBe(true);
    // Test commands should be excluded
    expect(commands.some((c) => c.includes('test') && !c.includes('typecheck'))).toBe(false);
    expect(commands.some((c) => c.includes('cargo'))).toBe(false);
    expect(commands.some((c) => c.includes('pytest'))).toBe(false);
  });

  it('returns empty for vanilla directory', async () => {
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands).toHaveLength(0);
  });

  it('detects multiple project types simultaneously', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', test: 'vitest' } }),
    );
    const commands = await detectVerificationCommands(tmpDir);
    expect(commands.length).toBeGreaterThanOrEqual(2);
  });
});

describe('detectCompileCommands', () => {
  it('prefers typecheck when available', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', build: 'vite build' } }),
    );

    const commands = await detectCompileCommands(tmpDir);

    expect(commands).toEqual(['npm run typecheck']);
  });

  it('falls back to build when typecheck is unavailable', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { build: 'vite build' } }),
    );

    const commands = await detectCompileCommands(tmpDir);

    expect(commands).toEqual(['npm run build']);
  });
});

describe('detectDependencyInstallCommand', () => {
  it('uses frozen-lockfile for pnpm workspaces', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');

    await expect(detectDependencyInstallCommand(tmpDir)).resolves.toBe('pnpm install --frozen-lockfile');
  });

  it('prefers npm ci when a lockfile exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'package-lock.json'), '');

    await expect(detectDependencyInstallCommand(tmpDir)).resolves.toBe('npm ci');
  });

  it('returns null outside package-managed node projects', async () => {
    await expect(detectDependencyInstallCommand(tmpDir)).resolves.toBeNull();
  });
});

describe('detectDevServerCommand', () => {
  it('detects a dev script in package.json', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite' } }),
    );

    await expect(detectDevServerCommand(tmpDir)).resolves.toBe('npm run dev');
  });

  it('returns null when no dev script exists', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { build: 'vite build' } }),
    );

    await expect(detectDevServerCommand(tmpDir)).resolves.toBeNull();
  });
});

describe('runVerificationCommands', () => {
  it('uses the injected command runner', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    const result = await runVerificationCommands(tmpDir, ['npm test'], 45_000, { runCommand });

    expect(result.success).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('npm test', tmpDir, 45_000);
  });

  it('runs commands sequentially and stops after the first failure', async () => {
    const runOrder: string[] = [];
    const runCommand = vi.fn(async (command: string) => {
      runOrder.push(command);
      return command === 'npm install'
        ? { stdout: '', stderr: 'install failed', exitCode: 1 }
        : { stdout: 'should not run', stderr: '', exitCode: 0 };
    });

    const result = await runVerificationCommands(
      tmpDir,
      ['npm install', 'npm run build', 'npm test'],
      45_000,
      { runCommand },
    );

    expect(result.success).toBe(false);
    expect(runOrder).toEqual(['npm install']);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      command: 'npm install',
      success: false,
      stderr: 'install failed',
    });
    expect(runCommand).not.toHaveBeenCalledWith('npm run build', tmpDir, 45_000);
    expect(runCommand).not.toHaveBeenCalledWith('npm test', tmpDir, 45_000);
  });
});

describe('runDevServerSmokeCheck', () => {
  it('treats a timeout as success because the server stayed alive', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'ready',
      stderr: 'Command timed out after 20s.',
      exitCode: 124,
    });

    const result = await runDevServerSmokeCheck(tmpDir, 'npm run dev', { runCommand });

    expect(result.success).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('npm run dev', tmpDir, 20_000);
  });

  it('fails when the dev server exits immediately with an error', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'EADDRINUSE',
      exitCode: 1,
    });

    const result = await runDevServerSmokeCheck(tmpDir, 'npm run dev', { runCommand });

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('EADDRINUSE');
  });
});

describe('summarizeVerificationFailure', () => {
  it('collapses native dependency mismatch errors into a short summary', () => {
    const summary = summarizeVerificationFailure({
      command: 'npm test',
      success: false,
      stdout: '',
      stderr: 'Error: Cannot find native binding. npm has a bug related to optional dependencies',
      durationMs: 100,
    });

    expect(summary).toContain('native dependency mismatch');
    expect(summary).toContain('npm test');
  });
});
