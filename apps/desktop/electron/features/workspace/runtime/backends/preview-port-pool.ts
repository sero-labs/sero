import net from 'net';

export const PREVIEW_INTERNAL_PORT_START = 32000;
/**
 * Default preview capacity per workspace. 16 keeps container startup args small
 * while covering typical app + API + storybook/card preview workflows. Increase
 * workspace.runtime.previewPortPoolSize when more concurrent previews are needed.
 */
export const DEFAULT_PREVIEW_PORT_POOL_SIZE = 16;

export interface PreviewPortMapping {
  internalPort: number;
  hostPort: number;
}

export interface PreviewPortSlot extends PreviewPortMapping {
  targetPort?: number;
  bridged?: boolean;
}

export function normalizePreviewPortPoolSize(size: number | undefined): number {
  if (!Number.isFinite(size) || !size) return DEFAULT_PREVIEW_PORT_POOL_SIZE;
  return Math.max(1, Math.min(64, Math.floor(size)));
}

export function buildPreviewInternalPorts(size: number): number[] {
  return Array.from({ length: normalizePreviewPortPoolSize(size) }, (_, index) => PREVIEW_INTERNAL_PORT_START + index);
}

export async function allocateLoopbackHostPorts(size: number): Promise<PreviewPortMapping[]> {
  const ports = buildPreviewInternalPorts(size);
  const mappings: PreviewPortMapping[] = [];
  for (const internalPort of ports) {
    mappings.push({ internalPort, hostPort: await reserveLoopbackPort() });
  }
  return mappings;
}

export function createPreviewSlots(mappings: PreviewPortMapping[]): PreviewPortSlot[] {
  return mappings.map((mapping) => ({ ...mapping }));
}

export function allocatePreviewSlot(slots: PreviewPortSlot[], targetPort: number): PreviewPortSlot {
  const existing = slots.find((slot) => slot.targetPort === targetPort);
  if (existing) return existing;
  const available = slots.find((slot) => slot.targetPort === undefined);
  if (!available) {
    throw new Error(`Preview port pool exhausted for target port ${targetPort}. Pool size is ${slots.length}; increase workspace runtime.previewPortPoolSize and recreate the runtime.`);
  }
  available.targetPort = targetPort;
  return available;
}

export function releasePreviewSlot(slots: PreviewPortSlot[], targetPort: number, hostPort?: number): PreviewPortSlot | undefined {
  const slot = slots.find((candidate) => candidate.targetPort === targetPort && (hostPort === undefined || candidate.hostPort === hostPort));
  if (!slot) return undefined;
  delete slot.targetPort;
  delete slot.bridged;
  return slot;
}

export function parseDockerPreviewPortMappings(inspect: unknown, internalPorts: number[]): PreviewPortMapping[] {
  const ports = asRecord(asRecord(inspect).NetworkSettings).Ports;
  const portMap = asRecord(ports);
  return internalPorts.map((internalPort) => {
    const bindings = portMap[`${internalPort}/tcp`];
    if (!Array.isArray(bindings) || bindings.length === 0) throw new Error(`Docker preview port ${internalPort} is not published.`);
    const first = asRecord(bindings[0]);
    const hostPort = Number(first.HostPort);
    if (!hostPort) throw new Error(`Docker preview port ${internalPort} has no host port in inspect output.`);
    return { internalPort, hostPort };
  });
}

export function parseApplePreviewPortMappings(inspect: unknown, internalPorts: number[]): PreviewPortMapping[] {
  const ports = collectApplePublishedPorts(inspect);
  return internalPorts.map((internalPort) => {
    const match = ports.find((port) => port.internalPort === internalPort && (!port.hostAddress || port.hostAddress === '127.0.0.1'));
    if (!match) throw new Error(`Apple Container preview port ${internalPort} is not published on 127.0.0.1.`);
    return { internalPort, hostPort: match.hostPort };
  });
}

export interface ListeningPort {
  port: number;
  public: boolean;
}

const SYSTEM_PORTS = new Set([22, 80, 443]);

export function parseListeningPorts(ssOutput: string): ListeningPort[] {
  const seen = new Set<number>();
  const ports: ListeningPort[] = [];
  for (const line of ssOutput.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    const match = line.match(/LISTEN\s+\d+\s+\d+\s+([\w.:*\[\]]+):(\d+)/);
    if (!match) continue;
    const port = Number(match[2]);
    if (!port || port >= 65536 || SYSTEM_PORTS.has(port) || seen.has(port)) continue;
    seen.add(port);
    const addr = match[1];
    ports.push({ port, public: addr === '0.0.0.0' || addr === '::' || addr === '*' || addr === '[::]' });
  }
  return ports;
}

interface ApplePublishedPort {
  internalPort: number;
  hostPort: number;
  hostAddress?: string;
}

function collectApplePublishedPorts(value: unknown): ApplePublishedPort[] {
  if (Array.isArray(value)) return value.flatMap(collectApplePublishedPorts);
  const record = asRecord(value);
  const published = record.publishedPorts;
  if (Array.isArray(published)) {
    return published.map(toApplePublishedPort).filter(isApplePublishedPort);
  }
  return Object.values(record).flatMap(collectApplePublishedPorts);
}

function toApplePublishedPort(value: unknown): ApplePublishedPort | null {
  if (typeof value === 'string') {
    const match = value.match(/^(?:(127\.0\.0\.1):)?(\d{2,5}):(\d{2,5})(?:\/tcp)?$/);
    if (!match) return null;
    return { hostAddress: match[1], hostPort: Number(match[2]), internalPort: Number(match[3]) };
  }
  const record = asRecord(value);
  const hostPort = Number(record.hostPort);
  const internalPort = Number(record.containerPort ?? record.internalPort);
  if (!hostPort || !internalPort) return null;
  return { hostAddress: typeof record.hostAddress === 'string' ? record.hostAddress : undefined, hostPort, internalPort };
}

function isApplePublishedPort(value: ApplePublishedPort | null): value is ApplePublishedPort {
  return Boolean(value);
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
