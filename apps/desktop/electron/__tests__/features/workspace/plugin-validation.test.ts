import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { assertIsSeroPluginFolder } from '../../../features/workspace/plugin-validation';

async function writePkg(dir: string, body: unknown): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(body), 'utf8');
}

describe('assertIsSeroPluginFolder', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-validation-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('accepts a folder with a valid Sero package.json', async () => {
    await writePkg(tmpRoot, {
      name: 'sero-fancy-plugin',
      sero: { app: { id: 'fancy', name: 'Fancy Plugin' } },
    });

    await expect(assertIsSeroPluginFolder(tmpRoot)).resolves.toBeUndefined();
  });

  it('rejects a folder without package.json', async () => {
    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /package\.json not found/,
    );
  });

  it('rejects a folder where package.json is unreadable JSON', async () => {
    await writeFile(path.join(tmpRoot, 'package.json'), '{not json', 'utf8');

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('rejects a package.json with no sero field', async () => {
    await writePkg(tmpRoot, { name: 'some-package' });

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('rejects a package.json with sero but no app', async () => {
    await writePkg(tmpRoot, { name: 'pkg', sero: {} });

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('rejects a package.json missing sero.app.id', async () => {
    await writePkg(tmpRoot, { sero: { app: { name: 'Just a name' } } });

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('rejects a package.json missing sero.app.name', async () => {
    await writePkg(tmpRoot, { sero: { app: { id: 'just-an-id' } } });

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('rejects empty-string id or name', async () => {
    await writePkg(tmpRoot, { sero: { app: { id: '', name: 'Foo' } } });
    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );

    await writePkg(tmpRoot, { sero: { app: { id: 'foo', name: '' } } });
    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('rejects non-string id / name (e.g. number, object)', async () => {
    await writePkg(tmpRoot, { sero: { app: { id: 42, name: 'Foo' } } });
    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );

    await writePkg(tmpRoot, { sero: { app: { id: 'foo', name: { en: 'Foo' } } } });
    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /sero\.app\.id and sero\.app\.name/,
    );
  });

  it('treats a directory pointed at by package.json as not-a-plugin', async () => {
    // package.json is itself a directory — readFile fails, error path
    // surfaces "package.json not found".
    await mkdir(path.join(tmpRoot, 'package.json'));

    await expect(assertIsSeroPluginFolder(tmpRoot)).rejects.toThrow(
      /package\.json not found/,
    );
  });
});
