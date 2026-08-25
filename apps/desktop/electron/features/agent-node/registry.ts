import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import type { AgentNodeEnrolInput } from '@/types/ipc-agent-node';
import type { AgentNodeRegistryFile, StoredAgentNode } from './types';
import { isRecord } from './types';

const EMPTY_REGISTRY: AgentNodeRegistryFile = { version: 1, nodes: [] };

function isStoredNode(value: unknown): value is StoredAgentNode {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.address === 'string'
    && typeof value.fingerprint === 'string'
    && (value.controlUrl === null || typeof value.controlUrl === 'string')
    && Array.isArray(value.tools) && value.tools.every((tool) => typeof tool === 'string')
    && typeof value.createdAt === 'string';
}

export class AgentNodeRegistry {
  readonly filePath: string;

  constructor(profileRoot: string) {
    this.filePath = path.join(profileRoot, 'agent-nodes.json');
  }

  async list(): Promise<StoredAgentNode[]> {
    return (await this.read()).nodes;
  }

  async add(input: AgentNodeEnrolInput, controlUrl: string, tools: string[]): Promise<StoredAgentNode> {
    const registry = await this.read();
    const node: StoredAgentNode = {
      id: randomUUID(),
      name: input.name.trim(),
      address: normalizeAddress(input.address),
      fingerprint: normalizeFingerprint(input.fingerprint),
      controlUrl,
      tools: [...tools],
      createdAt: new Date().toISOString(),
    };
    registry.nodes.push(node);
    await this.write(registry);
    return node;
  }

  async remove(id: string): Promise<void> {
    const registry = await this.read();
    registry.nodes = registry.nodes.filter((node) => node.id !== id);
    await this.write(registry);
  }

  private async read(): Promise<AgentNodeRegistryFile> {
    const handle = await readFile(this.filePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (handle === null) return { ...EMPTY_REGISTRY, nodes: [] };
    const value: unknown = JSON.parse(handle);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.nodes)
      || !value.nodes.every(isStoredNode)) {
      throw new Error('Agent node registry is invalid');
    }
    return { version: 1, nodes: [...value.nodes] };
  }

  private async write(registry: AgentNodeRegistryFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

export function normalizeAddress(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Agent node address must use HTTPS');
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function normalizeFingerprint(value: string): string {
  const compact = value.trim().toLowerCase().replace(/^sha256:/, '').replace(/:/g, '');
  if (!/^[a-f0-9]{64}$/.test(compact)) throw new Error('Identity fingerprint must be SHA-256');
  return compact;
}
