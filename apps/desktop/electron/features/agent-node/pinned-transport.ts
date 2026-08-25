import { createHash, X509Certificate } from 'crypto';
import https, { type RequestOptions } from 'https';
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

/** Verify the exact two-certificate chain required by the Agent Node spec. */
export interface PinnedPeerChain {
  raw: Buffer;
  issuerCertificate?: { raw: Buffer };
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
  private identityCa: string | null = null;

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
  ): Promise<import('http').IncomingMessage> {
    const identityCa = this.identityCa ?? await this.preflight();
    this.identityCa = identityCa;
    const url = new URL(target, `${this.baseUrl}/`);
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new Error('Agent node request cannot leave the pinned origin');
    }
    const requestOptions: RequestOptions = {
      method,
      ca: identityCa,
      rejectUnauthorized: true,
      checkServerIdentity: () => undefined,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
    };
    return new Promise((resolve, reject) => {
      const request = https.request(url, requestOptions, resolve);
      request.once('error', reject);
      request.setTimeout(30_000, () => request.destroy(new Error('Agent node request timed out')));
      if (body !== undefined) request.write(body);
      request.end();
    });
  }

  dispose(): void {
    this.identityCa = null;
  }

  private preflight(): Promise<string> {
    const url = new URL(this.baseUrl);
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: url.hostname,
        port: Number(url.port || 443),
        servername: undefined,
        rejectUnauthorized: false,
      });
      socket.setTimeout(15_000, () => socket.destroy(new Error('Agent node TLS preflight timed out')));
      socket.once('error', reject);
      socket.once('secureConnect', () => {
        try {
          const identity = verifyPinnedPeer(socket.getPeerCertificate(true), this.fingerprint);
          socket.end();
          resolve(identity);
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      });
    });
  }
}
