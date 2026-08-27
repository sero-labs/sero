import { createHash, X509Certificate } from 'crypto';
import type { LookupAddress } from 'dns';
import { lookup } from 'dns/promises';
import https, { type RequestOptions } from 'https';
import type { LookupFunction } from 'net';
import tls from 'tls';
import { normalizeAddress, normalizeFingerprint } from './registry';

export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function certificatePem(certificate: X509Certificate): string {
  const base64 = certificate.raw.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}

function transportUrl(value: string, base?: string): URL {
  try {
    return new URL(value, base);
  } catch {
    throw new Error('Agent node URL is invalid');
  }
}

/** Verify the exact two-certificate chain required by the Agent Node spec. */
export interface PinnedPeerChain {
  raw: Buffer;
  issuerCertificate?: { raw: Buffer };
}

interface PinnedEndpoint extends LookupAddress {
  identityCa: string;
}

export function verifyPinnedPeer(peer: PinnedPeerChain, expectedFingerprint: string): string {
  if (!peer.raw || !peer.issuerCertificate?.raw || peer.issuerCertificate === peer) {
    throw new Error('Agent node did not serve its identity CA chain');
  }
  const leaf = new X509Certificate(peer.raw);
  const identity = new X509Certificate(peer.issuerCertificate.raw);
  if (!identity.ca || !identity.verify(identity.publicKey)) {
    throw new Error('Agent node identity certificate is not a self-signed CA');
  }
  if (!leaf.checkIssued(identity) || !leaf.verify(identity.publicKey)) {
    throw new Error('Agent node leaf certificate was not issued by its identity CA');
  }
  const actual = createHash('sha256')
    .update(identity.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  if (actual !== normalizeFingerprint(expectedFingerprint)) {
    throw new Error('Agent node identity fingerprint does not match the pinned value');
  }
  return certificatePem(identity);
}

export class PinnedTransport {
  readonly baseUrl: string;
  private endpoint: PinnedEndpoint | null = null;

  constructor(address: string, private readonly fingerprint: string) {
    this.baseUrl = normalizeAddress(address);
    normalizeFingerprint(fingerprint);
  }

  async request(
    method: 'GET' | 'POST',
    target: string,
    options: { headers?: Record<string, string>; body?: string; maxBytes?: number } = {},
  ): Promise<TransportResponse> {
    const response = await this.open(method, target, options.headers, options.body);
    const chunks: Buffer[] = [];
    let size = 0;
    const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        response.destroy(new Error('Agent node response is too large'));
        throw new Error('Agent node response is too large');
      }
      chunks.push(buffer);
    }
    return { status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) };
  }

  async open(
    method: 'GET' | 'POST',
    target: string,
    headers: Record<string, string> = {},
    body?: string,
    idleTimeoutMs = 30_000,
  ): Promise<import('http').IncomingMessage> {
    const endpoint = this.endpoint ?? await this.preflight();
    this.endpoint = endpoint;
    const url = transportUrl(target, `${this.baseUrl}/`);
    if (url.origin !== transportUrl(this.baseUrl).origin) {
      throw new Error('Agent node request cannot leave the pinned origin');
    }
    const requestOptions: RequestOptions = {
      method,
      ca: endpoint.identityCa,
      rejectUnauthorized: true,
      checkServerIdentity: () => undefined,
      lookup: pinnedLookup(endpoint),
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
    };
    return new Promise((resolve, reject) => {
      const request = https.request(url, requestOptions, (response) => {
        request.setTimeout(idleTimeoutMs);
        resolve(response);
      });
      request.once('error', (error) => {
        if (this.endpoint === endpoint) this.endpoint = null;
        reject(error);
      });
      request.setTimeout(30_000, () => request.destroy(new Error('Agent node request timed out')));
      if (body !== undefined) request.write(body);
      request.end();
    });
  }

  dispose(): void {
    this.endpoint = null;
  }

  private async preflight(): Promise<PinnedEndpoint> {
    const url = transportUrl(this.baseUrl);
    // A multi-homed .local host can retain an unreachable address. Race all
    // records, then keep HTTP on the address whose pinned TLS chain passed.
    const addresses = await lookup(url.hostname, { all: true });
    const sockets = new Set<tls.TLSSocket>();
    try {
      return await Promise.any(addresses.map(({ address, family }) => new Promise<PinnedEndpoint>((resolve, reject) => {
        const socket = tls.connect({
          host: address,
          port: Number(url.port || 443),
          servername: undefined,
          rejectUnauthorized: false,
        });
        sockets.add(socket);
        socket.setTimeout(15_000, () => socket.destroy(new Error('Agent node TLS preflight timed out')));
        socket.once('error', reject);
        socket.once('close', () => reject(new Error('Agent node TLS preflight closed')));
        socket.once('secureConnect', () => {
          try {
            const identityCa = verifyPinnedPeer(socket.getPeerCertificate(true), this.fingerprint);
            resolve({ address, family, identityCa });
          } catch (error) {
            reject(error);
          }
        });
      })));
    } catch (error) {
      if (error instanceof AggregateError) {
        const firstError = error.errors.find((item): item is Error => item instanceof Error);
        if (firstError) throw firstError;
      }
      throw error;
    } finally {
      for (const socket of sockets) socket.destroy();
    }
  }
}

function pinnedLookup(endpoint: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: endpoint.address, family: endpoint.family }]);
      return;
    }
    callback(null, endpoint.address, endpoint.family);
  };
}
