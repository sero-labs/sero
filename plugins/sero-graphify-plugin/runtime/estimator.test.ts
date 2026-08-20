import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanWorkspace } from './estimator';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'graphify-estimator-'));
  await writeFile(path.join(root, 'a.ts'), 'x'.repeat(1000), 'utf8');
  await writeFile(path.join(root, 'README.md'), 'y'.repeat(2000), 'utf8');
  await writeFile(path.join(root, '.gitignore'), 'secret-notes\n', 'utf8');
  await writeFile(path.join(root, 'secret-notes'), 'z'.repeat(5000), 'utf8');
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'q'.repeat(100_000), 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'deep.ts'), 'w'.repeat(500), 'utf8');
});

describe('scanWorkspace', () => {
  it('counts bytes as well as files', async () => {
    // Bytes are the number that matters: graphify chunks by tokens, so a few
    // dense files can cost more than a great many small ones.
    const scan = await scanWorkspace(root, { exclude: [], maxFiles: 1000 });
    expect(scan.files).toBe(4); // a.ts, README.md, .gitignore, src/deep.ts
    expect(scan.bytes).toBeGreaterThan(3000);
  });

  it('honours .gitignore and the common ignores, so the estimate matches the build', async () => {
    const scan = await scanWorkspace(root, { exclude: [], maxFiles: 1000 });
    expect(scan.bytes).toBeLessThan(10_000); // node_modules and secret-notes excluded
  });

  it('applies the settings exclude patterns', async () => {
    const scan = await scanWorkspace(root, { exclude: ['*.md'], maxFiles: 1000 });
    expect(scan.files).toBe(3);
  });

  it('is deterministic for the same tree', async () => {
    const first = await scanWorkspace(root, { exclude: [], maxFiles: 1000 });
    const second = await scanWorkspace(root, { exclude: [], maxFiles: 1000 });
    expect(second).toEqual(first);
  });

  it('reports truncation instead of walking a tree past the cap', async () => {
    const scan = await scanWorkspace(root, { exclude: [], maxFiles: 2 });
    expect(scan.truncated).toBe(true);
  });

  it('counts files outside a nested ignore pattern', async () => {
    // A nested pattern used to collapse to `**` and hide the whole tree, so a
    // real repository priced at zero and slipped past both caps.
    const nested = await mkdtemp(path.join(os.tmpdir(), 'graphify-nested-'));
    await writeFile(path.join(nested, '.gitignore'), 'some-dir/**\n', 'utf8');
    await mkdir(path.join(nested, 'some-dir'), { recursive: true });
    await writeFile(path.join(nested, 'some-dir', 'ignored.ts'), 'x'.repeat(9000), 'utf8');
    await mkdir(path.join(nested, 'src'), { recursive: true });
    await writeFile(path.join(nested, 'src', 'kept.ts'), 'y'.repeat(1200), 'utf8');
    await writeFile(path.join(nested, 'root.ts'), 'z'.repeat(800), 'utf8');

    const scan = await scanWorkspace(nested, { exclude: [], maxFiles: 1000 });
    expect(scan.files).toBe(3); // .gitignore, src/kept.ts, root.ts
    expect(scan.bytes).toBeGreaterThan(2000);
    expect(scan.bytes).toBeLessThan(9000); // some-dir/ignored.ts excluded
  });

  it('reports patterns it could not apply, having counted their files', async () => {
    const odd = await mkdtemp(path.join(os.tmpdir(), 'graphify-odd-'));
    await writeFile(path.join(odd, '.gitignore'), 'file[0-9].ts\n', 'utf8');
    await writeFile(path.join(odd, 'file1.ts'), 'x'.repeat(100), 'utf8');

    const scan = await scanWorkspace(odd, { exclude: [], maxFiles: 1000 });
    expect(scan.unsupportedPatterns).toContain('file[0-9].ts');
    expect(scan.files).toBe(2); // counted, not silently dropped
  });
});
