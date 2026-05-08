import { promises as fs } from 'fs';
import path from 'path';

import { SERO_AGENT_DIR } from '@electron/platform/env';

export type OpenShellRemoteConnectionMode = 'ssh-tunnel' | 'direct';

export interface OpenShellRemoteGatewayEntry {
  id: string;
  name: string;
  sshHost: string;
  sshKeyPath?: string;
  port: number;
  gatewayHost?: string;
  localPort?: number;
  connectionMode?: OpenShellRemoteConnectionMode;
  createdAt: string;
  updatedAt: string;
}

export type OpenShellRemoteGatewayInput = Omit<OpenShellRemoteGatewayEntry, 'createdAt' | 'updatedAt'>;

interface OpenShellRemoteGatewayRegistryData {
  gateways: OpenShellRemoteGatewayEntry[];
}

const REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'openshell-remote-gateways.json');
const SSH_DESTINATION_PATTERN = /^[^\s@]+@[^\s@]+$/;
const PHASE_5_MESSAGE =
  'OpenShell Remote currently requires an SSH destination like user@host. Endpoint-only and cloud gateways are Phase 5.';
const CONNECTION_MODES = new Set<OpenShellRemoteConnectionMode>(['ssh-tunnel', 'direct']);
const FORBIDDEN_SECRET_KEY_PATTERN = /password|passphrase|token|secret|credential/i;

export class OpenShellRemoteGatewayRegistry {
  async list(): Promise<OpenShellRemoteGatewayEntry[]> {
    const data = await this.readRegistry();
    return data.gateways;
  }

  async upsert(input: OpenShellRemoteGatewayInput): Promise<OpenShellRemoteGatewayEntry> {
    const normalized = validateGatewayInput(input);
    const data = await this.readRegistry();
    const existing = data.gateways.find((gateway) => gateway.id === normalized.id);
    const now = new Date().toISOString();
    const entry: OpenShellRemoteGatewayEntry = {
      ...normalized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const nextGateways = existing
      ? data.gateways.map((gateway) => (gateway.id === entry.id ? entry : gateway))
      : [...data.gateways, entry];

    await this.writeRegistry({ gateways: nextGateways });
    return entry;
  }

  async remove(id: string): Promise<void> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('OpenShell Remote gateway id is required.');

    const data = await this.readRegistry();
    const nextGateways = data.gateways.filter((gateway) => gateway.id !== normalizedId);
    if (nextGateways.length === data.gateways.length) return;
    await this.writeRegistry({ gateways: nextGateways });
  }

  private async readRegistry(): Promise<OpenShellRemoteGatewayRegistryData> {
    try {
      const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return { gateways: parseGateways(parsed) };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { gateways: [] };
      }
      console.error('[openshell-remote] Failed to load remote gateway registry:', error);
      return { gateways: [] };
    }
  }

  private async writeRegistry(data: OpenShellRemoteGatewayRegistryData): Promise<void> {
    await fs.mkdir(SERO_AGENT_DIR, { recursive: true });
    const json = JSON.stringify(data, null, 2) + '\n';
    await fs.writeFile(REGISTRY_PATH, json, 'utf8');
  }
}

export function getOpenShellRemoteConnectionMode(
  entry: Pick<OpenShellRemoteGatewayEntry, 'connectionMode'>,
): OpenShellRemoteConnectionMode {
  return entry.connectionMode ?? 'ssh-tunnel';
}

export function getOpenShellRemoteLocalPort(
  entry: Pick<OpenShellRemoteGatewayEntry, 'port' | 'localPort'>,
): number {
  return entry.localPort ?? entry.port;
}

function validateGatewayInput(input: OpenShellRemoteGatewayInput): OpenShellRemoteGatewayInput {
  rejectSecretFields(input);

  const id = input.id.trim();
  const name = input.name.trim();
  const sshHost = input.sshHost.trim();
  const sshKeyPath = input.sshKeyPath?.trim() || undefined;
  const gatewayHost = input.gatewayHost?.trim() || undefined;
  const connectionMode = input.connectionMode ?? 'ssh-tunnel';

  if (!id) throw new Error('OpenShell Remote gateway id is required.');
  if (!name) throw new Error('OpenShell Remote gateway name is required.');
  if (!sshHost) throw new Error(PHASE_5_MESSAGE);
  if (!SSH_DESTINATION_PATTERN.test(sshHost)) throw new Error(PHASE_5_MESSAGE);
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    throw new Error('OpenShell Remote gateway port must be an integer between 1 and 65535.');
  }
  if (
    input.localPort !== undefined &&
    (!Number.isInteger(input.localPort) || input.localPort < 1 || input.localPort > 65_535)
  ) {
    throw new Error('OpenShell Remote local tunnel port must be an integer between 1 and 65535.');
  }
  if (!CONNECTION_MODES.has(connectionMode)) {
    throw new Error('OpenShell Remote connection mode must be ssh-tunnel or direct.');
  }

  return {
    id,
    name,
    sshHost,
    sshKeyPath,
    port: input.port,
    gatewayHost,
    localPort: input.localPort,
    connectionMode,
  };
}

function parseGateways(value: unknown): OpenShellRemoteGatewayEntry[] {
  if (!isRecord(value) || !Array.isArray(value.gateways)) return [];
  return value.gateways.flatMap((gateway) => {
    const parsed = parseGatewayEntry(gateway);
    return parsed ? [parsed] : [];
  });
}

function parseGatewayEntry(value: unknown): OpenShellRemoteGatewayEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (hasSecretFields(value)) return undefined;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return undefined;
  if (!optionalString(value.sshKeyPath)) return undefined;
  if (!optionalString(value.gatewayHost)) return undefined;
  if (!optionalNumber(value.localPort)) return undefined;
  if (!optionalConnectionMode(value.connectionMode)) return undefined;
  if (typeof value.id !== 'string') return undefined;
  if (typeof value.name !== 'string') return undefined;
  if (typeof value.sshHost !== 'string') return undefined;
  if (typeof value.port !== 'number') return undefined;

  try {
    const normalized = validateGatewayInput({
      id: value.id,
      name: value.name,
      sshHost: value.sshHost,
      sshKeyPath: value.sshKeyPath,
      port: value.port,
      gatewayHost: value.gatewayHost,
      localPort: value.localPort,
      connectionMode: value.connectionMode,
    });
    return { ...normalized, createdAt: value.createdAt, updatedAt: value.updatedAt };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function optionalConnectionMode(value: unknown): value is OpenShellRemoteConnectionMode | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && CONNECTION_MODES.has(value as OpenShellRemoteConnectionMode))
  );
}

function rejectSecretFields(input: object): void {
  if (hasSecretFields(input)) {
    throw new Error('OpenShell Remote gateway registry stores metadata only and does not accept auth secrets.');
  }
}

function hasSecretFields(input: object): boolean {
  return Object.keys(input).some((key) => FORBIDDEN_SECRET_KEY_PATTERN.test(key));
}
