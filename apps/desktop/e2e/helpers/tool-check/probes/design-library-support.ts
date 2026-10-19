/**
 * Shared helpers for the Design Library probes.
 *
 * A Design Library tool queues most changes as a request that the plugin's
 * background runtime applies a moment later. So a probe step checks its effect
 * by waiting for it: through the same tool route the plugin's own UI uses
 * (`appAgent.invokeTool`), or through the files the plugin keeps in the
 * profile (`<profile>/apps/design-library`).
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { pageOf, waitUntil } from '../files';
import type { StepContext, ToolCallResult } from '../types';

export interface ToolOutput {
  text: string;
  details: Record<string, unknown> | null;
  images: Array<{ mimeType: string; data: string }>;
}

/** `appAgent.invokeTool`'s answer (AppToolResult in packages/common). */
interface RawToolResult {
  text: string;
  details: Record<string, unknown> | null;
  content: Array<{ type: string; data?: string; mimeType?: string }>;
}

/** Calls a Design Library tool the way the plugin's UI does, from the test process. */
export async function invoke(ctx: StepContext, tool: string, params: Record<string, unknown>): Promise<ToolOutput> {
  const result: RawToolResult = await pageOf(ctx).evaluate(
    ({ id, name, args }) => window.sero.appAgent.invokeTool('design-library', id, name, args),
    { id: ctx.workspaceId, name: tool, args: params },
  );
  return {
    text: result.text,
    details: result.details,
    images: result.content.flatMap((block) => (block.type === 'image' && block.data && block.mimeType ? [{ mimeType: block.mimeType, data: block.data }] : [])),
  };
}

/** A tool result's `details` as the shape the caller expects. */
export function detailsOf<T>(output: ToolOutput): T {
  if (!output.details) throw new Error(`the tool returned no details: ${output.text}`);
  return output.details as unknown as T;
}

/**
 * Waits until `read` returns something other than null, undefined or false. It
 * reads again whenever a file in the plugin's profile folder changes. A read
 * that throws counts as not ready yet, and the last such error is reported.
 */
export async function poll<T>(ctx: StepContext, what: string, read: () => Promise<T | null | undefined | false>, timeoutMs = 45_000): Promise<T> {
  let lastError = '';
  try {
    return await waitUntil(await libraryHome(ctx), what, async () => {
      try {
        const value = await read();
        return value !== null && value !== undefined && value !== false ? value : undefined;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        return undefined;
      }
    }, timeoutMs);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${lastError ? ` (${lastError})` : ''}; jobs: ${await jobSummary(ctx)}`);
  }
}

/** Each job's kind and status, so a wait that timed out shows what the plugin was doing. */
async function jobSummary(ctx: StepContext): Promise<string> {
  const dir = path.join(await libraryHome(ctx), 'jobs');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json') : [];
  return names.map((name) => {
    const job = readJsonFile(path.join(dir, name)) as { kind?: string; status?: string; error?: string } | null;
    return `${job?.kind}:${job?.status}${job?.error ? `(${job.error.slice(0, 80)})` : ''}`;
  }).join(', ') || 'none';
}

/** Waits until a tool's text answer satisfies `test`, and says what it last read if it never does. */
export async function pollText(
  ctx: StepContext,
  what: string,
  tool: string,
  params: Record<string, unknown>,
  test: (text: string) => boolean,
  timeoutMs = 45_000,
): Promise<string> {
  let seen = '';
  try {
    return await poll(ctx, what, async () => {
      seen = (await invoke(ctx, tool, params)).text;
      return test(seen) ? seen : null;
    }, timeoutMs);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; last answer: ${seen.slice(0, 400)}`);
  }
}

/** Fails unless the call's text matches. */
export function expectMatch(result: ToolCallResult, pattern: RegExp): RegExpExecArray {
  const match = pattern.exec(result.text);
  if (!match) throw new Error(`result does not match ${pattern}: ${result.text}`);
  return match;
}

/** Reads a typed value a step saved earlier. */
export function saved<T>(ctx: StepContext, key: string): T {
  const value = ctx.state[key];
  if (value === undefined) throw new Error(`no value saved for ${key}`);
  return value as T;
}

export function rand(): string {
  return randomBytes(3).toString('hex');
}

// ── The plugin's folder in the profile ──────────────────────────────────

/** `<profile>/apps/design-library`, where a global app keeps its state (create-host.ts `globalDir`). */
export async function libraryHome(ctx: StepContext): Promise<string> {
  const cached = ctx.state.libraryHome;
  if (typeof cached === 'string') return cached;
  const profile = await pageOf(ctx).evaluate(() => window.sero.profiles.getActive());
  if (!profile) throw new Error('no active profile');
  const home = path.join(profile.path, 'apps', 'design-library');
  ctx.state.libraryHome = home;
  return home;
}

export function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** The plugin's `state.json`: collections, settings, the view and the request log. */
export async function readStateFile(ctx: StepContext): Promise<{ view?: Record<string, unknown> } & Record<string, unknown>> {
  const parsed = readJsonFile(path.join(await libraryHome(ctx), 'state.json'));
  return (parsed ?? {}) as { view?: Record<string, unknown> } & Record<string, unknown>;
}

// ── A real PNG, different every time ────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * An 8x8 PNG of random pixels. The library refuses a second copy of the same
 * bytes (it opens the first one instead), so every import needs its own.
 */
export function makePng(): Buffer {
  const size = 8;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let row = 0; row < size; row += 1) randomBytes(size * 3).copy(rows, row * (size * 3 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Uploads and imported references ─────────────────────────────────────

export interface UploadOptions {
  fileName: string;
  png: Buffer;
  purpose?: 'import' | 'gallery-preview';
}

/** begin, one chunk, complete: the route the plugin's UI imports a file by. Returns the upload id. */
export async function uploadImage(ctx: StepContext, options: UploadOptions): Promise<string> {
  const begun = await invoke(ctx, 'design_library_assets', {
    action: 'begin',
    fileName: options.fileName,
    mediaType: 'image/png',
    originalChunks: 1,
    previewChunks: 0,
    width: 8,
    height: 8,
    ...(options.purpose ? { purpose: options.purpose } : {}),
  });
  const uploadId = detailsOf<{ uploadId: string }>(begun).uploadId;
  const chunk = await invoke(ctx, 'design_library_assets', { action: 'chunk', uploadId, role: 'original', index: 0, data: options.png.toString('base64') });
  if (!chunk.text.startsWith('Stored original chunk 0')) throw new Error(`chunk failed: ${chunk.text}`);
  const done = await invoke(ctx, 'design_library_assets', { action: 'complete', uploadId });
  if (!/^(Upload complete; import queued\.|Gallery preview upload complete\.)$/.test(done.text)) throw new Error(`complete failed: ${done.text}`);
  return uploadId;
}

export interface ImportedItem {
  id: string;
  fileName: string;
  png: Buffer;
}

/** The id of the live item whose file name contains `fileName`, once the import has landed. */
export async function findItemId(ctx: StepContext, fileName: string): Promise<string | null> {
  const found = await invoke(ctx, 'design_library_items', { action: 'search', query: fileName, limit: 50 });
  const items = (found.details as { items?: Array<{ id: string }> } | null)?.items ?? [];
  return items[0]?.id ?? null;
}

export async function itemText(ctx: StepContext, itemId: string): Promise<string> {
  return (await invoke(ctx, 'design_library_items', { action: 'get', itemId })).text;
}

/** Imports a new reference image and waits for the item to appear. Its analysis starts by itself. */
export async function importReference(ctx: StepContext, label: string): Promise<ImportedItem> {
  const fileName = `${label}-${rand()}.png`;
  const png = makePng();
  await uploadImage(ctx, { fileName, png });
  const id = await poll(ctx, `the import of ${fileName}`, () => findItemId(ctx, fileName));
  return { id, fileName, png };
}

export async function waitForAnalysis(ctx: StepContext, itemId: string, status: 'ready' | 'running' | 'failed' | 'cancelled'): Promise<string> {
  return pollText(ctx, `analysis ${status} for ${itemId}`, 'design_library_items', { action: 'get', itemId }, (text) => text.includes(`Analysis: ${status}`));
}

// ── Designs ─────────────────────────────────────────────────────────────

export interface DesignView {
  id: string;
  title: string;
  deletedAt?: number;
  variants: Array<{
    id: string;
    status: string;
    visibleRevisionId?: string;
    pendingRevision?: { instruction: string };
    revisions: Array<{
      id: string;
      builtFile?: string;
      tweaks?: { overrides: Record<string, unknown>; checkpoints: Array<{ id: string; overrides: Record<string, unknown> }> };
    }>;
  }>;
  assets: Array<{ id: string; sourceItemId?: string; copiedItemId?: string; deletedAt?: number }>;
}

export async function readDesign(ctx: StepContext, designId: string): Promise<DesignView | null> {
  const got = await invoke(ctx, 'design_library_designs', { action: 'get', designId });
  return (got.details as { design?: DesignView } | null)?.design ?? null;
}

/** The first variant of a design, once `ready` returns true for it. */
export async function waitForVariant(
  ctx: StepContext,
  designId: string,
  variantId: string,
  what: string,
  ready: (variant: DesignView['variants'][number]) => boolean,
): Promise<DesignView['variants'][number]> {
  return poll(ctx, `variant ${variantId} ${what}`, async () => {
    const variant = (await readDesign(ctx, designId))?.variants.find((entry) => entry.id === variantId);
    return variant && ready(variant) ? variant : null;
  });
}
