import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  analyzeFiles,
  discoverTrackedTestFiles,
  formatOutput,
  selectTestFiles,
} from '../../../../../scripts/test-advisory.mjs';

const execFileAsync = promisify(execFile);
let fixtureRoot: string;

afterEach(async () => {
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
});

describe('test advisory metrics', () => {
  it('discovers tracked test/spec files, counts signals, formats output, and does not mutate files', async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-advisory-'));
    await fs.mkdir(path.join(fixtureRoot, 'src'), { recursive: true });
    const testPath = path.join(fixtureRoot, 'src/example.test.ts');
    const source = [
      "import { expect, test, vi } from 'vitest';",
      "test('example', () => {",
      "  vi.mock('./dependency');",
      "  expect(process.env.NODE_ENV).toContain('test');",
      '});',
      '',
    ].join('\n');
    await fs.writeFile(testPath, source);
    await fs.writeFile(path.join(fixtureRoot, 'src/example.ts'), 'export const value = 1;\n');
    await execFileAsync('git', ['init', '-q', fixtureRoot]);
    await execFileAsync('git', ['-C', fixtureRoot, 'add', '.']);

    const before = await fs.readFile(testPath, 'utf8');
    const files = await discoverTrackedTestFiles(fixtureRoot);
    const metrics = analyzeFiles(files);

    expect(selectTestFiles(['z.spec.ts', 'README.md', 'a.test.ts'])).toEqual(['a.test.ts', 'z.spec.ts']);
    expect(files.map((file) => file.path)).toEqual(['src/example.test.ts']);
    expect(metrics).toMatchObject({
      testFileCount: 1,
      testLoc: 5,
      testDeclarations: 1,
      mockSignals: 1,
      textAssertionSignals: 1,
      environmentSignals: 1,
      runtimeMs: null,
    });
    expect(formatOutput(metrics, 'text')).toContain('Runtime: not-measured');
    expect(formatOutput(metrics, 'json')).toContain('"testFileCount": 1');
    expect(formatOutput(metrics, 'github')).toContain('| Mock signals (advisory) | 1 |');
    expect(await fs.readFile(testPath, 'utf8')).toBe(before);
  });
});
