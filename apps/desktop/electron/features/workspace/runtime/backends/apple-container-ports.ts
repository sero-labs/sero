import { execFile } from 'child_process';
import { promisify } from 'util';
import { CONTAINER_BIN, containerId } from '@electron/features/container/core/types';
import type { RuntimeDevServer, RuntimeExecResult, RuntimeForwardedPort, RuntimePreviewUrl } from '../types';
import { allocateLoopbackHostPorts, allocatePreviewSlot, buildPreviewInternalPorts, createPreviewSlots, parseApplePreviewPortMappings, parseListeningPorts, releasePreviewSlot, type PreviewPortMapping, type PreviewPortSlot } from './preview-port-pool';
import { previewUrl, startPreviewBridgeCommand, stopPreviewBridgeCommand } from './preview-bridge';

const execFileAsync = promisify(execFile);

export interface AppleContainerPortsOptions {
  workspaceId: string;
  poolSize: number;
  exec: (command: string, timeoutMs?: number) => Promise<RuntimeExecResult>;
  inspect?: () => Promise<unknown>;
}

export class AppleContainerPortManager {
  private slots: PreviewPortSlot[] = [];
  private servers = new Map<string, RuntimeDevServer>();

  constructor(private readonly options: AppleContainerPortsOptions) {}

  async prepareRunMappings(): Promise<PreviewPortMapping[]> {
    const mappings = await allocateLoopbackHostPorts(this.options.poolSize);
    this.slots = createPreviewSlots(mappings);
    return mappings;
  }

  setMappings(mappings: PreviewPortMapping[]): void {
    this.slots = createPreviewSlots(mappings);
  }

  async refreshFromInspect(): Promise<void> {
    const inspect = this.options.inspect ? await this.options.inspect() : await inspectAppleContainer(this.options.workspaceId);
    const mappings = parseApplePreviewPortMappings(inspect, buildPreviewInternalPorts(this.options.poolSize));
    this.slots = createPreviewSlots(mappings);
  }

  async detectPorts(): Promise<number[]> {
    const result = await this.options.exec('ss -tlnp 2>/dev/null', 10_000);
    if (result.exitCode !== 0) return [];
    const gatewayPorts = new Set(this.slots.map((slot) => slot.internalPort));
    return parseListeningPorts(result.stdout).map((port) => port.port).filter((port) => !gatewayPorts.has(port));
  }

  async forwardPort(targetPort: number): Promise<RuntimeForwardedPort> {
    if (this.slots.length === 0) await this.refreshFromInspect();
    const slot = allocatePreviewSlot(this.slots, targetPort);
    if (!slot.bridged) {
      const result = await this.options.exec(startPreviewBridgeCommand(this.options.workspaceId, targetPort, slot.internalPort), 10_000);
      if (result.exitCode !== 0) throw new Error(`Failed to start Apple Container preview bridge for ${targetPort}: ${result.stderr || result.stdout}`);
      slot.bridged = true;
    }
    return { targetPort, hostPort: slot.hostPort, url: previewUrl(slot.hostPort), bridged: true };
  }

  async stopForward(targetPort: number, hostPort?: number): Promise<void> {
    const slot = releasePreviewSlot(this.slots, targetPort, hostPort);
    if (slot) await this.options.exec(stopPreviewBridgeCommand(this.options.workspaceId, targetPort, slot.internalPort), 10_000);
  }

  async resolvePreviewUrl(targetPort: number, path?: string): Promise<RuntimePreviewUrl> {
    const forwarded = await this.forwardPort(targetPort);
    return { url: previewUrl(forwarded.hostPort, path), targetPort, hostPort: forwarded.hostPort, backend: 'apple-container' };
  }

  registerServer(server: RuntimeDevServer): RuntimeDevServer {
    this.servers.set(server.id, server);
    return server;
  }

  getServer(serverId: string): RuntimeDevServer | undefined {
    return this.servers.get(serverId);
  }

  listServers(): RuntimeDevServer[] {
    return Array.from(this.servers.values());
  }

  deleteServer(serverId: string): boolean {
    return this.servers.delete(serverId);
  }
}

export function applePreviewPublishArgs(mappings: PreviewPortMapping[]): string[] {
  return mappings.flatMap(({ hostPort, internalPort }) => ['-p', `127.0.0.1:${hostPort}:${internalPort}`]);
}

async function inspectAppleContainer(workspaceId: string): Promise<unknown> {
  const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', containerId(workspaceId)], { timeout: 10_000 });
  return JSON.parse(stdout) as unknown;
}
