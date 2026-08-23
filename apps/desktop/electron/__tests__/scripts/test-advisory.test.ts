import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const advisoryScript = path.resolve(__dirname, '../../../../../scripts/test-advisory.mjs');
let fixtureRoot: string;

afterEach(async () => {
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
});

describe('test advisory metrics', () => {
  it('discovers tracked test/spec files, counts signals, formats output, and does not mutate files', async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-advisory-'));
    await fs.mkdir(path.join(fixtureRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(fixtureRoot, 'dist'), { recursive: true });
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
    await fs.writeFile(
      path.join(fixtureRoot, 'src/browser.spec.tsx'),
      "// @vitest-environment jsdom\ntest('browser', () => expect(document.body).toHaveTextContent('ready'));\n",
    );
    await fs.writeFile(path.join(fixtureRoot, 'dist/generated.test.ts'), "test('generated', () => {});\n");
    await fs.writeFile(path.join(fixtureRoot, 'src/example.ts'), 'export const value = 1;\n');
    await execFileAsync('git', ['init', '-q', fixtureRoot]);
    await execFileAsync('git', ['-C', fixtureRoot, 'add', '.']);

    const before = await fs.readFile(testPath, 'utf8');
    const run = (format: string) => execFileAsync(process.execPath, [
      advisoryScript,
      `--root=${fixtureRoot}`,
      `--format=${format}`,
    ]);
    const { stdout: json } = await run('json');
    const metrics = JSON.parse(json);

    expect(metrics).toMatchObject({
      testFileCount: 2,
      testLoc: 7,
      testDeclarations: 2,
      mockSignals: 1,
      textAssertionSignals: 2,
      environments: { jsdom: 1, node: 1 },
      runtimeMs: null,
    });
    await expect(run('text')).resolves.toMatchObject({ stdout: expect.stringContaining('Runtime: not-measured') });
    await expect(run('github')).resolves.toMatchObject({ stdout: expect.stringContaining('| Mock signals (advisory) | 1 |') });
    expect(await fs.readFile(testPath, 'utf8')).toBe(before);
  });
});
