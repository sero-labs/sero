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

  it('primes the cache and avoids request-time exists/stat sync checks', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-static-files-test-'));
    const webDistDir = path.join(tmpDir, 'web-dist');
    await mkdir(path.join(webDistDir, 'assets'), { recursive: true });
    await writeFile(path.join(webDistDir, 'index.html'), '<html>gateway</html>');
    await writeFile(path.join(webDistDir, 'assets', 'app.js'), 'console.log("ok")');

    const existsSpy = vi.spyOn(fs, 'existsSync');
    const statSpy = vi.spyOn(fs, 'statSync');

    primeStaticFileCache(tmpDir);
    const existsAfterPrime = existsSpy.mock.calls.length;
    const statAfterPrime = statSpy.mock.calls.length;

    const { response } = createMockResponse();
    expect(tryServeStaticFile('/assets/missing.js', response, tmpDir)).toBe(false);

    expect(existsSpy.mock.calls.length).toBe(existsAfterPrime);
    expect(statSpy.mock.calls.length).toBe(statAfterPrime);
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

    expect(writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    await expect(body).resolves.toContain('gateway app');
  });
});
