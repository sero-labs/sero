import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error('FAL_KEY is not set');

export function dataUri(path, mime = 'image/png') {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

const auth = { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' };

/** Submit to the queue and return the handle, without waiting. */
export async function submit(endpoint, input) {
  const res = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${endpoint} rejected (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return { endpoint, ...body };
}

/** Poll a handle until it finishes. */
export async function wait(handle, { timeoutMs = 900_000, onTick } = {}) {
  const started = Date.now();
  for (;;) {
    const res = await fetch(handle.status_url, { headers: { Authorization: `Key ${KEY}` } });
    const status = await res.json();
    if (status.status === 'COMPLETED') {
      const out = await fetch(handle.response_url, { headers: { Authorization: `Key ${KEY}` } });
      const body = await out.json();
      if (!out.ok) throw new Error(`${handle.endpoint} failed: ${JSON.stringify(body).slice(0, 400)}`);
      return body;
    }
    if (status.status === 'FAILED' || status.error) {
      throw new Error(`${handle.endpoint} failed: ${JSON.stringify(status).slice(0, 400)}`);
    }
    if (Date.now() - started > timeoutMs) throw new Error(`${handle.endpoint} timed out`);
    onTick?.(status.status, Math.round((Date.now() - started) / 1000));
    await new Promise((r) => setTimeout(r, 4000));
  }
}

export async function run(endpoint, input, options) {
  return wait(await submit(endpoint, input), options);
}

export async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}
