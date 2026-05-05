import { promises as fs } from 'fs';
import path from 'path';

import { SERO_AGENT_DIR } from '@electron/platform/env';

export interface OpenShellRemoteGatewayEntry {
  id: string;
  name: string;
  sshHost: string;
  sshKeyPath?: string;
  port: number;
  gatewayHost?: string;
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

function validateGatewayInput(input: OpenShellRemoteGatewayInput): OpenShellRemoteGatewayInput {
  const id = input.id.trim();
  const name = input.name.trim();
  const sshHost = input.sshHost.trim();
  const sshKeyPath = input.sshKeyPath?.trim() || undefined;
  const gatewayHost = input.gatewayHost?.trim() || undefined;

  if (!id) throw new Error('OpenShell Remote gateway id is required.');
  if (!name) throw new Error('OpenShell Remote gateway name is required.');
  if (!sshHost) throw new Error(PHASE_5_MESSAGE);
  if (!SSH_DESTINATION_PATTERN.test(sshHost)) throw new Error(PHASE_5_MESSAGE);
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    throw new Error('OpenShell Remote gateway port must be an integer between 1 and 65535.');
  }

  return { id, name, sshHost, sshKeyPath, port: input.port, gatewayHost };
}

function parseGateways(value: unknown): OpenShellRemoteGatewayEntry[] {
  if (!isRecord(value) || !Array.isArray(value.gateways)) return [];
  return value.gateways.filter(isGatewayEntry);
}

function isGatewayEntry(value: unknown): value is OpenShellRemoteGatewayEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.sshHost === 'string' &&
    typeof value.port === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    optionalString(value.sshKeyPath) &&
    optionalString(value.gatewayHost)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
