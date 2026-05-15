import type { RuntimeExecResult, RuntimeForwardedPort, RuntimePreviewUrl, RuntimeDevServer } from '../../types';
import { allocatePreviewSlot, buildPreviewInternalPorts, createPreviewSlots, parseDockerPreviewPortMappings, parseListeningPorts, releasePreviewSlot, type PreviewPortSlot } from '../preview-port-pool';
import { previewUrl, startPreviewBridgeCommand, stopPreviewBridgeCommand } from '../preview-bridge';
import { dockerContainerName, inspectDockerContainer } from './docker-lifecycle';
import type { DockerRunner } from './docker-cli';

export interface DockerPortsOptions {
  workspaceId: string;
  poolSize: number;
  run: DockerRunner;
  exec: (command: string, timeoutMs?: number) => Promise<RuntimeExecResult>;
}

export class DockerPortManager {
  private slots: PreviewPortSlot[] = [];
  private servers = new Map<string, RuntimeDevServer>();

  constructor(private readonly options: DockerPortsOptions) {}

  async refreshFromInspect(): Promise<void> {
    const inspect = await inspectDockerContainer(dockerContainerName(this.options.workspaceId), this.options.run);
    const mappings = parseDockerPreviewPortMappings(inspect, buildPreviewInternalPorts(this.options.poolSize));
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
      if (result.exitCode !== 0) throw new Error(`Failed to start preview bridge for ${targetPort}: ${result.stderr || result.stdout}`);
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
    return { url: previewUrl(forwarded.hostPort, path), targetPort, hostPort: forwarded.hostPort, backend: 'docker' };
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
