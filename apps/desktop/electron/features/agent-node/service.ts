import { randomUUID } from 'crypto';
import { safeStorage } from 'electron';
import { SERO_HOME } from '@electron/platform/env';
import type {
  AgentNodeAttachResult,
  AgentNodeControlArgs,
  AgentNodeEnrolInput,
  AgentNodeEvent,
  AgentNodeInfo,
  AgentNodeMessageInput,
} from '@/types/ipc-agent-node';
import { AgentNodeRegistry } from './registry';
import { AgentNodeCredentials } from './credentials';
import { PinnedTransport } from './pinned-transport';
import { activateAgentCard } from './agent-card';
import { A2aClient } from './a2a-client';
import { ControlClient, ControlVersionError } from './control-client';
import { RemoteConversationBoundary, remoteSessionKey } from './normalize';
import { RetryingStream } from './retrying-stream';
import { isRecord, rendererNode, type EnrolWireResult, type RuntimeNode, type StoredAgentNode } from './types';

interface Connection {
  transport: PinnedTransport;
  a2a: A2aClient;
  control: ControlClient;
  streams: Set<{ stop(): void }>;
}

type EventSink = (event: AgentNodeEvent) => void;

export class AgentNodeService {
  private readonly registry: AgentNodeRegistry;
  private readonly credentials: AgentNodeCredentials;
  private readonly runtime = new Map<string, RuntimeNode>();
  private readonly connections = new Map<string, Connection>();
  private readonly sinks = new Set<EventSink>();

  constructor(profileRoot = SERO_HOME) {
    this.registry = new AgentNodeRegistry(profileRoot);
    this.credentials = new AgentNodeCredentials(profileRoot, safeStorage);
  }

  async list(): Promise<AgentNodeInfo[]> {
    const stored = await this.registry.list();
    return stored.map((node) => rendererNode(this.runtimeNode(node)));
  }

  async enrol(input: AgentNodeEnrolInput): Promise<AgentNodeInfo> {
    if (!input.fingerprint.trim()) throw new Error('Identity fingerprint is required before first contact');
    const transport = new PinnedTransport(input.address, input.fingerprint);
    const card = await activateAgentCard(transport);
    const control = new ControlClient(transport, card.controlUrl, null);
    const value = await control.call('enrol', { code: input.code, controllerName: input.name });
    if (!isRecord(value) || typeof value.token !== 'string' || typeof value.controllerId !== 'string') {
      throw new Error('Agent node enrolment response is invalid');
    }
    const secret = value as unknown as EnrolWireResult;
    const stored = await this.registry.add(input, card.controlUrl, card.tools);
    try {
      await this.credentials.set(stored.id, secret.token);
    } catch (error) {
      await this.registry.remove(stored.id);
      throw error;
    }
    transport.dispose();
    return this.connect(stored.id);
  }

  async remove(nodeId: string): Promise<void> {
    this.closeConnection(nodeId);
    await this.credentials.remove(nodeId);
    await this.registry.remove(nodeId);
    this.runtime.delete(nodeId);
  }

  async connect(nodeId: string): Promise<AgentNodeInfo> {
    const stored = await this.requireStored(nodeId);
    this.closeConnection(nodeId);
    const node = this.runtimeNode(stored);
    const transport = new PinnedTransport(stored.address, stored.fingerprint);
    try {
      const [card, token] = await Promise.all([activateAgentCard(transport), this.credentials.get(nodeId)]);
      if (!token) throw new Error('Agent node credential is missing for this profile');
      const connection: Connection = {
        transport,
        a2a: new A2aClient(transport, card.a2aUrl, token),
        control: new ControlClient(transport, card.controlUrl, token),
        streams: new Set(),
      };
      this.connections.set(nodeId, connection);
      node.state = 'connected';
      node.lastSeenAt = new Date().toISOString();
      this.emit({ type: 'connection', nodeId, state: node.state });
      this.startAmbientStreams(nodeId, connection);
      return rendererNode(node);
    } catch (error) {
      transport.dispose();
      node.state = 'unreachable';
      this.emit({ type: 'connection', nodeId, state: node.state });
      throw error;
    }
  }

  async control(nodeId: string, args: AgentNodeControlArgs): Promise<unknown> {
    const connection = await this.requireConnection(nodeId);
    try {
      return await connection.control.call(args.operation, args.params);
    } catch (error) {
      if (error instanceof ControlVersionError) this.setState(nodeId, 'version-skew');
      throw error;
    }
  }

  async send(input: AgentNodeMessageInput): Promise<void> {
    const connection = await this.requireConnection(input.nodeId);
    const boundary = new RemoteConversationBoundary(remoteSessionKey(input.nodeId, input.contextId));
    const parts: Array<Record<string, unknown>> = [{ kind: 'text', text: input.text }];
    for (const attachment of input.attachments ?? []) {
      parts.push({ kind: 'file', file: { name: attachment.filename, mimeType: attachment.mediaType, uri: attachment.url } });
    }
    const message: Record<string, unknown> = {
      kind: 'message',
      role: 'user',
      messageId: randomUUID(),
      contextId: input.contextId,
      parts,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.mode ? { metadata: { 'sero:queue-mode': input.mode } } : {}),
    };
    const a2aStream = await connection.a2a.streamMessage({ message }, (event) => {
      for (const normalized of boundary.accept(event.data, event.id)) {
        this.emit({ type: 'conversation', nodeId: input.nodeId, event: normalized });
      }
    });
    connection.streams.add({ stop: a2aStream.close });
    void a2aStream.done.then(() => {
      if (!this.connections.has(input.nodeId)) return;
      this.setState(input.nodeId, 'reconnecting');
      this.startConversationReplay(input.nodeId, input.contextId, connection, boundary);
    }).catch(() => {
      if (!this.connections.has(input.nodeId)) return;
      this.setState(input.nodeId, 'reconnecting');
      this.startConversationReplay(input.nodeId, input.contextId, connection, boundary);
    });
  }

  async getTask(nodeId: string, taskId: string): Promise<unknown> {
    return (await this.requireConnection(nodeId)).a2a.getTask(taskId);
  }

  async cancelTask(nodeId: string, taskId: string): Promise<void> {
    await (await this.requireConnection(nodeId)).a2a.cancelTask(taskId);
  }

  async attach(nodeId: string, contextId: string, cursor?: string): Promise<AgentNodeAttachResult> {
    const connection = await this.requireConnection(nodeId);
    const sessionKey = remoteSessionKey(nodeId, contextId);
    const boundary = new RemoteConversationBoundary(sessionKey);
    const stream = new RetryingStream(
      (nextCursor, onMessage) => connection.control.sessionEvents(contextId, nextCursor, onMessage),
      (message) => {
        for (const event of boundary.accept(message.data, message.id)) {
          this.emit({ type: 'conversation', nodeId, event });
        }
      },
      cursor,
    );
    connection.streams.add(stream);
    void stream.start().catch((error: unknown) => {
      if (error instanceof ControlVersionError) this.setState(nodeId, 'version-skew');
    });
    const snapshot = boundary.snapshot();
    return { sessionKey, messages: snapshot.messages, cursor: stream.getCursor() };
  }

  async readBlob(nodeId: string, blobId: string): Promise<Uint8Array> {
    return (await this.requireConnection(nodeId)).control.readBlob(blobId);
  }

  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  dispose(): void {
    for (const nodeId of this.connections.keys()) this.closeConnection(nodeId);
    this.sinks.clear();
  }

  private async requireStored(nodeId: string): Promise<StoredAgentNode> {
    const node = (await this.registry.list()).find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error('Agent node not found in the active profile');
    return node;
  }

  private async requireConnection(nodeId: string): Promise<Connection> {
    const current = this.connections.get(nodeId);
    if (current) return current;
    await this.connect(nodeId);
    const connected = this.connections.get(nodeId);
    if (!connected) throw new Error('Agent node connection failed');
    return connected;
  }

  private runtimeNode(stored: StoredAgentNode): RuntimeNode {
    const current = this.runtime.get(stored.id);
    if (current) return current;
    const node: RuntimeNode = { stored, state: 'disconnected', lastSeenAt: null };
    this.runtime.set(stored.id, node);
    return node;
  }

  private startAmbientStreams(nodeId: string, connection: Connection): void {
    for (const [path, type] of [['events', 'node'], ['auth/events', 'auth']] as const) {
      const stream = new RetryingStream(
        (cursor, onMessage) => connection.control.stream(path, onMessage, cursor),
        (message) => this.emit({ type, nodeId, event: message.data }),
      );
      connection.streams.add(stream);
      void stream.start().catch((error: unknown) => {
        if (error instanceof ControlVersionError) this.setState(nodeId, 'version-skew');
      });
    }
  }

  private startConversationReplay(
    nodeId: string,
    contextId: string,
    connection: Connection,
    boundary: RemoteConversationBoundary,
  ): void {
    const stream = new RetryingStream(
      (cursor, onMessage) => connection.control.sessionEvents(contextId, cursor, onMessage),
      (message) => {
        this.setState(nodeId, 'connected');
        for (const event of boundary.accept(message.data, message.id)) {
          this.emit({ type: 'conversation', nodeId, event });
        }
      },
      boundary.snapshot().cursor ?? undefined,
    );
    connection.streams.add(stream);
    void stream.start().catch((error: unknown) => {
      if (error instanceof ControlVersionError) this.setState(nodeId, 'version-skew');
    });
  }

  private closeConnection(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (!connection) return;
    for (const stream of connection.streams) stream.stop();
    connection.transport.dispose();
    this.connections.delete(nodeId);
    const node = this.runtime.get(nodeId);
    if (node) node.state = 'disconnected';
  }

  private setState(nodeId: string, state: RuntimeNode['state']): void {
    const node = this.runtime.get(nodeId);
    if (node) node.state = state;
    this.emit({ type: 'connection', nodeId, state });
  }

  private emit(event: AgentNodeEvent): void {
    for (const sink of this.sinks) sink(event);
  }
}
