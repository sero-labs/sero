import { deflateSync } from 'node:zlib';

/**
 * A stand-in for the fal HTTP API, used by the contract tests.
 *
 * It exists so the shipped adapter — its request bodies, its response reading,
 * its error taxonomy — can be exercised without network or spend. Stubbing the
 * *provider* would have been easier and would have tested nothing that ships;
 * stubbing the transport runs every line between `generate` and the wire.
 *
 * It speaks only as much of the API as the adapter uses: queue submit, status,
 * result, storage upload, and the download of the produced file.
 */

export interface FalTransportOptions {
  /** The payload the result endpoint returns. Defaults to one PNG image. */
  result?: unknown;
  /** Fail every call with this status, to exercise the error mapping. */
  failStatus?: number;
  failBody?: unknown;
  /** Bytes the produced file downloads as. */
  fileBytes?: Uint8Array;
  /**
   * The endpoint's OpenAPI document, when a test cares what the model accepts.
   *
   * Absent means the schema endpoint answers 404, which is the ordinary case for
   * most of these tests and the one where the adapter sends what it was given.
   */
  schema?: unknown;
}

/** A minimal valid PNG, so a stored result is a real image on disk. */
export function tinyPng(): Uint8Array {
  const crc = (bytes: Uint8Array): number => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
      }
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, body: Uint8Array): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(typed), 0);
    return Buffer.concat([length, typed, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface FalTransport {
  fetch: typeof globalThis.fetch;
  /** Every request the adapter made, so a test can assert on what was sent. */
  calls: { url: string; method: string; body?: unknown }[];
}

const FILE_URL = 'https://fal.media/files/result.png';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createFalTransport(options: FalTransportOptions = {}): FalTransport {
  const calls: FalTransport['calls'] = [];
  const result = options.result ?? {
    images: [{ url: FILE_URL, content_type: 'image/png', width: 1, height: 1 }],
    seed: 42,
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    let body: unknown;
    if (typeof init?.body === 'string') body = JSON.parse(init.body) as unknown;
    calls.push({ url, method, ...(body === undefined ? {} : { body }) });

    // Routed on the parsed path, never on the raw string: the client appends
    // query parameters (`?logs=0`), so a suffix match on `/status` silently
    // falls through to the result branch and the poll loop never terminates.
    const parsed = new URL(url);
    const { host, pathname } = parsed;

    if (options.failStatus !== undefined && host.endsWith('fal.run')) {
      return json(options.failBody ?? { detail: 'refused' }, options.failStatus);
    }

    // What the endpoint accepts. Read by the adapter to spell a clip length the
    // way this model spells it.
    if (host === 'fal.ai' && pathname.startsWith('/api/openapi')) {
      return options.schema === undefined
        ? json({ detail: 'no schema' }, 404)
        : json(options.schema);
    }

    // Storage: initiate, then a PUT whose body the client ignores.
    if (pathname.startsWith('/storage/upload/initiate')) {
      return json({
        upload_url: 'https://upload.fal.test/put',
        file_url: 'https://fal.media/src.png',
      });
    }
    if (host === 'upload.fal.test') return new Response('', { status: 200 });

    // Queue: submit, poll, collect.
    if (host === 'queue.fal.run') {
      if (pathname.endsWith('/status')) {
        return json({
          status: 'COMPLETED',
          request_id: 'req-1',
          response_url: '',
          status_url: '',
          cancel_url: '',
        });
      }
      if (pathname.includes('/requests/')) return json(result);
      return json({
        request_id: 'req-1',
        status: 'IN_QUEUE',
        queue_position: 0,
        response_url: '',
        status_url: '',
        cancel_url: '',
      });
    }

    // The produced file itself.
    if (host === 'fal.media') {
      const bytes = options.fileBytes ?? tinyPng();
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }

    return json({ detail: `unexpected ${method} ${url}` }, 404);
  };

  return { fetch, calls };
}
