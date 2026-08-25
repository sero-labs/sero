import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StatePaths } from "./state.ts";

export const INLINE_ARTIFACT_LIMIT = 1_000_000;

export class BlobStore {
  constructor(readonly paths: StatePaths, readonly publicBaseUrl: string) {}
  async artifact(contextId: string, data: Uint8Array, mediaType: string, name: string): Promise<Record<string, unknown>> {
    const id = randomUUID();
    if (data.byteLength < INLINE_ARTIFACT_LIMIT) {
      return { artifactId: id, name, parts: [{ raw: Buffer.from(data).toString("base64"), mediaType }] };
    }
    const directory = join(this.paths.blobs, contextId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, id), data, { mode: 0o600 });
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ contextId, mediaType, name }), { mode: 0o600 });
    return { artifactId: id, name, parts: [{ url: `${this.publicBaseUrl}/sero/v1/blob/${id}`, mediaType }] };
  }
  async find(id: string): Promise<{ data: Uint8Array; mediaType: string } | undefined> {
    for (const contextId of await Array.fromAsync(new Bun.Glob("*/" + id + ".json").scan({ cwd: this.paths.blobs, onlyFiles: true }))) {
      const metadata = await Bun.file(join(this.paths.blobs, contextId)).json() as { mediaType: string };
      const file = join(this.paths.blobs, contextId.replace(/\.json$/, ""));
      return { data: new Uint8Array(await readFile(file)), mediaType: metadata.mediaType };
    }
    return undefined;
  }
  async removeSession(contextId: string): Promise<void> { await rm(join(this.paths.blobs, contextId), { recursive: true, force: true }); }
}
