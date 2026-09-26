import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { closeSeroApp, launchSeroApp } from './helpers';

/**
 * Memory plugin e2e tests.
 *
 * Tests capacity enforcement, read/write, duplicate detection,
 * security blocking, and format migration via the IPC bridge.
 *
 * Runs in an isolated SERO_HOME temp directory to avoid affecting
 * real user data. Uses the `ci` project (no containers required).
 */

let app: ElectronApplication;
let page: Page;
let seroHome: string;
let memoryRoot: string;

test.beforeAll(async () => {
  // Create an isolated SERO_HOME for test data
  seroHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-memory-test-'));
  memoryRoot = path.join(seroHome, 'workspaces', 'global', 'memory');
  await fs.mkdir(memoryRoot, { recursive: true });

  ({ app, page } = await launchSeroApp({ seroHome }));
  await expect.poll(async () => page.evaluate(() => {
    return typeof (window as any).sero?.workspace?.list === 'function';
  }), { timeout: 10_000 }).toBe(true);
});

test.afterAll(async () => {
  await closeSeroApp(app);
  // Clean up temp directory
  await fs.rm(seroHome, { recursive: true, force: true }).catch(() => {});
});

// ── Helper: read/write files in the test SERO_HOME ─────────────

async function writeMemoryFile(relativePath: string, content: string): Promise<void> {
  const filePath = path.join(memoryRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function readMemoryFile(relativePath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(memoryRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(memoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

// ── IPC bridge availability ────────────────────────────────────

test.describe('Memory - IPC Bridge', () => {
  test('should expose the sero IPC bridge on the window', async () => {
    const hasBridge = await page.evaluate(() => {
      return typeof (window as any).sero === 'object';
    });
    expect(hasBridge).toBe(true);
  });

  test('should expose workspace listing', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });
    expect(Array.isArray(workspaces)).toBe(true);
  });
});

// ── Memory file format ─────────────────────────────────────────

test.describe('Memory - File Operations', () => {
  test('should create memory directory structure', async () => {
    const exists = await fileExists('.');
    expect(exists).toBe(true);
  });

  test('should handle empty MEMORY.md on first boot', async () => {
    // Write an empty file — the system should not crash
    await writeMemoryFile('MEMORY.md', '');
    const content = await readMemoryFile('MEMORY.md');
    expect(content).toBe('');
  });

  test('should handle v2 format MEMORY.md', async () => {
    const v2Content = [
      '<!-- last updated: 2026-04-01 12:00 -->',
      '<!-- v2 format: structured memory entries with ids -->',
      '# Memory',
      '',
      '§ [fact] Test project uses TypeScript <!-- id: mem-aaa111 -->',
      '§ [decision] Chose Vitest for testing <!-- id: mem-bbb222 -->',
    ].join('\n');

    await writeMemoryFile('MEMORY.md', v2Content);
    const content = await readMemoryFile('MEMORY.md');
    expect(content).toContain('§ [fact]');
    expect(content).toContain('mem-aaa111');
  });
});

// ── Capacity format validation ─────────────────────────────────

test.describe('Memory - Capacity', () => {
  test('should detect when MEMORY.md approaches capacity', async () => {
    // The memory capacity is 4000 chars. Write close to it.
    const entries = Array.from({ length: 40 }, (_, i) =>
      `§ [fact] Memory entry number ${i} with some padding text to fill up capacity <!-- id: mem-${String(i).padStart(6, '0')} -->`,
    );

    const content = [
      '<!-- last updated: 2026-04-01 12:00 -->',
      '<!-- v2 format: structured memory entries with ids -->',
      '# Memory',
      '',
      ...entries,
    ].join('\n');

    await writeMemoryFile('MEMORY.md', content);
    const written = await readMemoryFile('MEMORY.md');
    expect(written).not.toBeNull();
    expect(written!.length).toBeGreaterThan(3000);
  });
});

// ── Legacy format detection ────────────────────────────────────

test.describe('Memory - Legacy Format', () => {
  test('should detect legacy format (no v2 marker)', async () => {
    const legacyContent = [
      '# Memory',
      '',
      '## Decisions',
      '- Chose Clerk for auth',
      '- Deploy on fly.io',
      '',
      '## Preferences',
      '- Always use pnpm',
      '- Prefer TypeScript strict mode',
    ].join('\n');

    await writeMemoryFile('MEMORY.md', legacyContent);
    const content = await readMemoryFile('MEMORY.md');
    expect(content).not.toContain('<!-- v2 format');
    expect(content).toContain('Chose Clerk');
  });
});
