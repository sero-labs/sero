import { existsSync, promises as fs } from 'fs';
import path from 'path';

import { SERO_AGENT_DIR } from '@electron/platform/env';

export type OpenShellCloudAuthMode = 'none' | 'browser' | 'external';

export interface OpenShellCloudGatewayEntry {
  id: string;
  name: string;
  endpoint: string;
  authMode: OpenShellCloudAuthMode;
  resourceLabel?: string;
  cpuLabel?: string;
  memoryLabel?: string;
  gpuLabel?: string;
  costLabel?: string;
  idleTimeoutMinutes: number;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
}

export type OpenShellCloudGatewayInput = Omit<
  OpenShellCloudGatewayEntry,
  'createdAt' | 'updatedAt' | 'idleTimeoutMinutes'
> & {
  idleTimeoutMinutes?: number;
};

interface OpenShellCloudGatewayRegistryData {
  gateways: OpenShellCloudGatewayEntry[];
}

const REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'openshell-cloud-gateways.json');
const CLOUD_ID_PREFIX = 'openshell-cloud-';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
const AUTH_MODES = new Set<OpenShellCloudAuthMode>(['none', 'browser', 'external']);
const FORBIDDEN_SECRET_KEY_PATTERN = /token|cookie|api[-_]?key|bearer|password|passwd|secret|credential/i;
const ENDPOINT_VALIDATION_MESSAGE =
  'OpenShell Cloud gateway endpoints must use HTTPS unless they are explicitly local/trusted test endpoints on localhost or 127.0.0.1.';
const ENDPOINT_SECRET_VALIDATION_MESSAGE =
  'OpenShell Cloud gateway endpoints must not include credentials, tokens, cookies, or other auth secrets.';

export class OpenShellCloudGatewayRegistry {
  async list(): Promise<OpenShellCloudGatewayEntry[]> {
    const data = await this.readRegistry();
    return data.gateways;
  }

  async upsert(input: OpenShellCloudGatewayInput): Promise<OpenShellCloudGatewayEntry> {
    const normalized = validateCloudGatewayInput(input);
    const data = await this.readRegistry();
    const existing = data.gateways.find((gateway) => gateway.id === normalized.id);
    const now = new Date().toISOString();
    const entry: OpenShellCloudGatewayEntry = {
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
    if (!normalizedId) throw new Error('OpenShell Cloud gateway id is required.');

    const data = await this.readRegistry();
    const nextGateways = data.gateways.filter((gateway) => gateway.id !== normalizedId);
    if (nextGateways.length === data.gateways.length) return;
    await this.writeRegistry({ gateways: nextGateways });
  }

  private async readRegistry(): Promise<OpenShellCloudGatewayRegistryData> {
    if (!existsSync(REGISTRY_PATH)) return { gateways: [] };

    try {
      const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return { gateways: parseCloudGateways(parsed) };
    } catch (error: unknown) {
      console.error('[openshell-cloud] Failed to load cloud gateway registry:', error);
      return { gateways: [] };
    }
  }

  private async writeRegistry(data: OpenShellCloudGatewayRegistryData): Promise<void> {
    await fs.mkdir(SERO_AGENT_DIR, { recursive: true });
    const json = JSON.stringify(data, null, 2) + '\n';
    await fs.writeFile(REGISTRY_PATH, json, 'utf8');
  }
}

export function validateCloudGatewayInput(input: OpenShellCloudGatewayInput): OpenShellCloudGatewayInput & {
  idleTimeoutMinutes: number;
} {
  rejectSecretFields(input);

  const id = input.id.trim();
  const name = input.name.trim();
  const endpoint = validateCloudGatewayEndpoint(input.endpoint);
  const authMode = input.authMode;
  const idleTimeoutMinutes = input.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;

  if (!id) throw new Error('OpenShell Cloud gateway id is required.');
  if (!id.startsWith(CLOUD_ID_PREFIX)) {
    throw new Error(`OpenShell Cloud gateway id must start with ${CLOUD_ID_PREFIX}.`);
  }
  if (!name) throw new Error('OpenShell Cloud gateway name is required.');
  if (!AUTH_MODES.has(authMode)) throw new Error('OpenShell Cloud gateway auth mode is invalid.');
  if (!Number.isInteger(idleTimeoutMinutes) || idleTimeoutMinutes < 1) {
    throw new Error('OpenShell Cloud gateway idle timeout must be a positive integer.');
  }

  return {
    id,
    name,
    endpoint,
    authMode,
    resourceLabel: trimmedOptional(input.resourceLabel),
    cpuLabel: trimmedOptional(input.cpuLabel),
    memoryLabel: trimmedOptional(input.memoryLabel),
    gpuLabel: trimmedOptional(input.gpuLabel),
    costLabel: trimmedOptional(input.costLabel),
    idleTimeoutMinutes,
    lastCheckedAt: trimmedOptional(input.lastCheckedAt),
  };
}

export function validateCloudGatewayEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new Error('OpenShell Cloud gateway endpoint must be a valid URL.');
  }

  rejectEndpointSecrets(parsed);

  if (parsed.protocol === 'https:') return normalizeEndpoint(parsed);
  if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    return normalizeEndpoint(parsed);
  }
  throw new Error(ENDPOINT_VALIDATION_MESSAGE);
}

export function parseCloudGateways(value: unknown): OpenShellCloudGatewayEntry[] {
  if (!isRecord(value) || !Array.isArray(value.gateways)) return [];
  return value.gateways.flatMap((gateway) => {
    const parsed = parseCloudGatewayEntry(gateway);
    return parsed ? [parsed] : [];
  });
}

function parseCloudGatewayEntry(value: unknown): OpenShellCloudGatewayEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (hasSecretFields(value)) return undefined;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return undefined;
  if (!optionalString(value.resourceLabel)) return undefined;
  if (!optionalString(value.cpuLabel)) return undefined;
  if (!optionalString(value.memoryLabel)) return undefined;
  if (!optionalString(value.gpuLabel)) return undefined;
  if (!optionalString(value.costLabel)) return undefined;
  if (!optionalString(value.lastCheckedAt)) return undefined;
  if (!isCloudAuthMode(value.authMode)) return undefined;
  if (!optionalNumber(value.idleTimeoutMinutes)) return undefined;
  if (typeof value.id !== 'string') return undefined;
  if (typeof value.name !== 'string') return undefined;
  if (typeof value.endpoint !== 'string') return undefined;

  try {
    const normalized = validateCloudGatewayInput({
      id: value.id,
      name: value.name,
      endpoint: value.endpoint,
      authMode: value.authMode,
      resourceLabel: value.resourceLabel,
      cpuLabel: value.cpuLabel,
      memoryLabel: value.memoryLabel,
      gpuLabel: value.gpuLabel,
      costLabel: value.costLabel,
      idleTimeoutMinutes: value.idleTimeoutMinutes,
      lastCheckedAt: value.lastCheckedAt,
    });
    return { ...normalized, createdAt: value.createdAt, updatedAt: value.updatedAt };
  } catch {
    return undefined;
  }
}

function normalizeEndpoint(parsed: URL): string {
  return parsed.toString().replace(/\/$/, '');
}

function rejectEndpointSecrets(parsed: URL): void {
  if (parsed.username || parsed.password) throw new Error(ENDPOINT_SECRET_VALIDATION_MESSAGE);
  if (parsed.search) throw new Error(ENDPOINT_SECRET_VALIDATION_MESSAGE);
  if (parsed.hash) throw new Error(ENDPOINT_SECRET_VALIDATION_MESSAGE);
}

function trimmedOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function rejectSecretFields(input: object): void {
  if (hasSecretFields(input)) {
    throw new Error('OpenShell Cloud gateway registry stores metadata only and does not accept auth secrets.');
  }
}

function hasSecretFields(input: object): boolean {
  return Object.keys(input).some((key) => FORBIDDEN_SECRET_KEY_PATTERN.test(key));
}

function isCloudAuthMode(value: unknown): value is OpenShellCloudAuthMode {
  return typeof value === 'string' && AUTH_MODES.has(value as OpenShellCloudAuthMode);
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
