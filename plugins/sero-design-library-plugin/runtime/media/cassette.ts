/**
 * Recording provider calls once and playing them back for nothing.
 *
 * Sprite Studio's end-to-end test drives the real thing: a picture in, a clip
 * generated, its frames pulled out in the renderer, a sheet on disk. That is
 * the only way to know it works — but a video call is real money, so paying it
 * on every run is not a test anyone will run.
 *
 * So the first run records and every run after it replays. The recording is
 * ordinary files in a directory: the clips themselves and a manifest saying
 * what was asked for. Nothing is faked — the bytes downstream sees are the
 * bytes fal returned.
 *
 * An entry is found by **what was asked for** — the model, the prompt and the
 * bytes of the source pictures — and only falls back to "the next unused one of
 * this capability" when nothing matches. Both halves are needed. Order alone is
 * wrong: a frame repair replayed against a different frame is rejected by the
 * checks, and the run buys a real one to replace it. Content alone is wrong
 * too: the motion prompt is written by a model and differs every run, so the
 * one call that actually costs three dollars would never match.
 *
 * Off unless `SERO_DESIGN_LIBRARY_MEDIA_CASSETTE` names a directory. Nothing
 * reads it in ordinary use.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MediaCapability, MediaProvenance } from '../../shared/media';
import type { MediaContext, MediaProvider, MediaRequest, MediaResult } from './contract';

const ENV_VAR = 'SERO_DESIGN_LIBRARY_MEDIA_CASSETTE';
const MANIFEST = 'cassette.json';

interface CassetteFile {
  /** The recorded file, relative to the cassette directory. */
  stored: string;
  /** The name the adapter gave it, so replay stores it under the same one. */
  name: string;
  mediaType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

interface CassetteEntry {
  capability: MediaCapability;
  model: string;
  prompt: string;
  /** What was asked for, as a hash. Matched on first; see the note above. */
  key: string;
  files: CassetteFile[];
  provenance: MediaProvenance;
}

interface Cassette {
  entries: CassetteEntry[];
}

/** Where the cassette lives, or nothing when there is none. */
export function cassetteDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[ENV_VAR];
  return value === undefined || value === '' ? undefined : value;
}

/**
 * What was asked for, as a hash.
 *
 * The source pictures are part of it, and they are what makes a frame repair
 * identifiable: the plate handed to the model is that frame's pixels, so the
 * same frame asks the same question every run however the run reached it.
 */
async function requestKey(request: MediaRequest, context: MediaContext): Promise<string> {
  const digest = createHash('sha256');
  digest.update(request.capability);
  digest.update(request.model ?? '');
  digest.update(request.prompt);
  for (const assetId of request.sourceAssetIds ?? []) {
    const asset = await context.readAsset(assetId).catch(() => null);
    digest.update(asset === null ? assetId : asset.bytes);
  }
  return digest.digest('hex');
}

async function readCassette(directory: string): Promise<Cassette> {
  const raw = await readFile(path.join(directory, MANIFEST), 'utf8').catch(() => null);
  if (raw === null) return { entries: [] };
  const parsed: unknown = JSON.parse(raw);
  const entries = (parsed as Partial<Cassette>).entries;
  return { entries: Array.isArray(entries) ? entries : [] };
}

async function writeCassette(directory: string, cassette: Cassette): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, MANIFEST),
    `${JSON.stringify(cassette, null, 2)}\n`,
    'utf8',
  );
}

/**
 * The provider, with a tape running.
 *
 * A capability with a recording left plays it; anything else calls through and
 * is recorded on the way back. That mixture is deliberate: adding one animation
 * to an existing cassette should cost one call, not a whole re-record.
 */
export function withCassette(provider: MediaProvider, directory: string): MediaProvider {
  // Read once, on the first call, and held: the manifest is rewritten as
  // recordings are added and re-reading it would replay what this run just
  // recorded.
  let loaded: Promise<Cassette> | undefined;
  /** Entries this run has already used, by position. Each plays once. */
  const spent = new Set<number>();

  const load = (): Promise<Cassette> => (loaded ??= readCassette(directory));

  const replay = async (entry: CassetteEntry, context: MediaContext): Promise<MediaResult> => {
    const files = await Promise.all(
      entry.files.map(async (file) => ({
        path: await context.store(file.name, await readFile(path.join(directory, file.stored))),
        mediaType: file.mediaType,
        ...(file.width === undefined ? {} : { width: file.width }),
        ...(file.height === undefined ? {} : { height: file.height }),
        ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
      })),
    );
    return { files, provenance: entry.provenance };
  };

  const record = async (
    request: MediaRequest,
    key: string,
    result: MediaResult,
    cassette: Cassette,
  ): Promise<void> => {
    const at = cassette.entries.length;
    const files: CassetteFile[] = [];
    for (const [index, file] of result.files.entries()) {
      const name = path.basename(file.path);
      const stored = `${at}-${index}-${name}`;
      // eslint-disable-next-line no-await-in-loop -- a clip at a time, on purpose
      await mkdir(directory, { recursive: true });
      // eslint-disable-next-line no-await-in-loop
      await writeFile(path.join(directory, stored), await readFile(file.path));
      files.push({
        stored,
        name,
        mediaType: file.mediaType,
        ...(file.width === undefined ? {} : { width: file.width }),
        ...(file.height === undefined ? {} : { height: file.height }),
        ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
      });
    }
    cassette.entries.push({
      capability: request.capability,
      model: request.model ?? '',
      prompt: request.prompt,
      key,
      files,
      provenance: result.provenance,
    });
    await writeCassette(directory, cassette);
  };

  return {
    ...provider,
    async generate(request: MediaRequest, context: MediaContext): Promise<MediaResult> {
      const cassette = await load();
      const key = await requestKey(request, context);

      // What was asked for, then failing that the next unused call of the same
      // kind. See the note at the top for why it needs both.
      const free = (index: number): boolean => !spent.has(index);
      const byKey = cassette.entries.findIndex((entry, at) => free(at) && entry.key === key);
      const at =
        byKey >= 0
          ? byKey
          : cassette.entries.findIndex(
              (entry, index) => free(index) && entry.capability === request.capability,
            );

      const entry = at >= 0 ? cassette.entries[at] : undefined;
      if (entry !== undefined) {
        spent.add(at);
        context.onProgress?.('Replaying a recorded generation…');
        return replay(entry, context);
      }

      const result = await provider.generate(request, context);
      spent.add(cassette.entries.length);
      await record(request, key, result, cassette);
      return result;
    },
  };
}
