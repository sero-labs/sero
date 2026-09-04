import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import type http from 'http';

import { primeStaticFileCache, tryServeStaticFile } from '@electron/features/gateway/server/static-files';

interface MockResponse {
  response: http.ServerResponse;
  writeHead: ReturnType<typeof vi.fn>;
  body: Promise<string>;
}

function createMockResponse(): MockResponse {
  const stream = new PassThrough();
  const writeHead = vi.fn();
  const chunks: Buffer[] = [];

  stream.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const response = stream as unknown as http.ServerResponse;
  Object.assign(response, {
    writeHead,
    end: stream.end.bind(stream),
  });

  const body = new Promise<string>((resolve, reject) => {
    stream.on('finish', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });

  return { response, writeHead, body };
}

describe('gateway static file serving', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
    vi.restoreAllMocks();
  });

  it('picks up rebuilt asset files after startup without re-priming', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-static-files-test-'));
    const webDistDir = path.join(tmpDir, 'web-dist');
    await mkdir(path.join(webDistDir, 'assets'), { recursive: true });
    await writeFile(path.join(webDistDir, 'index.html'), '<html>gateway</html>');

    primeStaticFileCache(tmpDir);

    await writeFile(path.join(webDistDir, 'assets', 'rebuilt.js'), 'console.log("rebuilt")');
    const { response, writeHead, body } = createMockResponse();
    expect(tryServeStaticFile('/assets/rebuilt.js', response, tmpDir)).toBe(true);

    // Hashed asset names make the file immutable for its whole lifetime.
    expect(writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    await expect(body).resolves.toContain('rebuilt');
  });

  it('serves index.html as SPA fallback for non-asset routes', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-static-files-test-'));
    const webDistDir = path.join(tmpDir, 'web-dist');
    await mkdir(path.join(webDistDir, 'assets'), { recursive: true });
    await writeFile(path.join(webDistDir, 'index.html'), '<html><body>gateway app</body></html>');
    await writeFile(path.join(webDistDir, 'assets', 'app.js'), 'console.log("ok")');

    primeStaticFileCache(tmpDir);

    const { response, writeHead, body } = createMockResponse();
    expect(tryServeStaticFile('/routes/settings', response, tmpDir)).toBe(true);

    // The shell must be revalidated, or a client keeps an old asset list.
    expect(writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    await expect(body).resolves.toContain('gateway app');
  });
});
