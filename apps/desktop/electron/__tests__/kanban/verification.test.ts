/**
 * Tests for verification command detection.
 *
 * Tests the detection logic using mock filesystem — does NOT execute commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectVerificationCommands, detectPackageManager } from '../../kanban/verification';
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
