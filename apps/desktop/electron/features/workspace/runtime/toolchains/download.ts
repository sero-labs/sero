import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { pipeline } from 'stream/promises';

export interface DownloadProgress {
  bytesReceived: number;
  bytesTotal?: number;
}

export interface DownloadArtifactOptions {
  url: string;
  sha256: string;
  destination: string;
  onProgress?: (progress: DownloadProgress) => void;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
}

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TOTAL_TIMEOUT_MS = 10 * 60_000;

export async function downloadArtifact(options: DownloadArtifactOptions): Promise<void> {
  await fs.promises.mkdir(path.dirname(options.destination), { recursive: true });
  const tempDestination = `${options.destination}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;

  try {
    const response = await requestWithRedirects(parseArtifactUrl(options.url));
    const hash = createHash('sha256');
    const output = fs.createWriteStream(tempDestination);
    const total = readContentLength(response.headers['content-length']);
    const timeouts = createDownloadTimeouts(response, {
      idleTimeoutMs: options.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS,
      totalTimeoutMs: options.totalTimeoutMs ?? DOWNLOAD_TOTAL_TIMEOUT_MS,
    });
    let received = 0;

    response.on('data', (chunk: Buffer) => {
      timeouts.bumpIdle();
      received += chunk.length;
      hash.update(chunk);
      options.onProgress?.({ bytesReceived: received, bytesTotal: total });
    });

    try {
      await pipeline(response, output);
    } finally {
      timeouts.clear();
    }
    const digest = hash.digest('hex');
    if (digest !== options.sha256.toLowerCase()) {
      throw new Error(`SHA-256 mismatch: expected ${options.sha256}, received ${digest}`);
    }
    await fs.promises.rename(tempDestination, options.destination);
  } finally {
    await fs.promises.rm(tempDestination, { force: true });
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(filePath), async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk);
      yield chunk;
    }
  });
  return hash.digest('hex');
}

async function requestWithRedirects(url: URL, redirectsRemaining = MAX_REDIRECTS): Promise<http.IncomingMessage> {
  const response = await request(url);
  const statusCode = response.statusCode ?? 0;

  if (isRedirect(statusCode)) {
    try {
      if (redirectsRemaining <= 0) {
        throw new Error(`Too many redirects while downloading artifact from ${url.toString()}`);
      }
      const nextUrl = resolveRedirect(url, response.headers.location);
      if (url.protocol === 'https:' && nextUrl.protocol === 'http:') {
        throw new Error(`Refusing HTTPS to HTTP redirect from ${url.toString()} to ${nextUrl.toString()}`);
      }

      return requestWithRedirects(nextUrl, redirectsRemaining - 1);
    } finally {
      response.resume();
    }
  }

  if (statusCode < 200 || statusCode >= 300) {
    response.resume();
    throw new Error(`Download failed with HTTP ${statusCode}`);
  }

  return response;
}

function request(url: URL): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = clientForUrl(url).get(url, resolve);
    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Download request timed out'));
    });
  });
}

function createDownloadTimeouts(
  response: http.IncomingMessage,
  options: { idleTimeoutMs: number; totalTimeoutMs: number },
): { bumpIdle: () => void; clear: () => void } {
  let idleTimer: NodeJS.Timeout | undefined;
  const fail = (message: string) => response.destroy(new Error(message));
  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail('Download stream idle timed out'), options.idleTimeoutMs);
  };
  const totalTimer = setTimeout(() => fail('Download stream total timed out'), options.totalTimeoutMs);
  bumpIdle();
  return {
    bumpIdle,
    clear: () => {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    },
  };
}

function resolveRedirect(currentUrl: URL, location: string | string[] | undefined): URL {
  const rawLocation = Array.isArray(location) ? location[0] : location;
  if (!rawLocation) {
    throw new Error(`Redirect from ${currentUrl.toString()} did not include a Location header`);
  }
  try {
    return parseArtifactUrl(new URL(rawLocation, currentUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid redirect URL from ${currentUrl.toString()}: ${message}`);
  }
}

function parseArtifactUrl(value: string | URL): URL {
  const url = typeof value === 'string' ? new URL(value) : value;
  if (url.protocol === 'https:' || url.protocol === 'http:') return url;
  throw new Error(`Unsupported artifact URL protocol: ${url.protocol}`);
}

function clientForUrl(url: URL): typeof http | typeof https {
  if (url.protocol === 'https:') return https;
  if (url.protocol === 'http:') return http;
  throw new Error(`Unsupported artifact URL protocol: ${url.protocol}`);
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function readContentLength(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
