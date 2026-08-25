import { randomUUID } from 'crypto';
import { safeStorage, shell } from 'electron';
import { AuthEventSchema, type AuthEvent } from '@sero-ai/a2a';
import { SERO_HOME } from '@electron/platform/env';
import type {
  AgentNodeAttachResult,
  AgentNodeApproval,
  AgentNodeControlArgs,
  AgentNodeEnrolInput,
  AgentNodeEvent,
  AgentNodeInfo,
  AgentNodeMessageInput,
  AgentNodeSendResult,
} from '@/types/ipc-agent-node';
import { AgentNodeRegistry } from './registry';
import { AgentNodeCredentials } from './credentials';
import { PinnedTransport } from './pinned-transport';
import { activateAgentCard } from './agent-card';
import { A2aClient } from './a2a-client';
import { ControlAuthorizationError, ControlClient, ControlVersionError } from './control-client';
import { RemoteConversationBoundary, remoteA2aMessage, remoteArtifacts, remoteSessionKey } from './normalize';
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
      if (error instanceof ControlAuthorizationError) this.setState(nodeId, 'revoked');
      throw error;
    }
  }

  async send(input: AgentNodeMessageInput): Promise<AgentNodeSendResult> {
    const connection = await this.requireConnection(input.nodeId);
    const boundary = new RemoteConversationBoundary(remoteSessionKey(input.nodeId, input.contextId));
    const message = remoteA2aMessage(input, randomUUID());
    let resolveTaskId!: (taskId: string) => void;
    const taskIdReady = new Promise<string>((resolve) => { resolveTaskId = resolve; });
    const a2aStream = await connection.a2a.streamMessage({ message }, (event) => {
      const taskId = taskIdFromWire(event.data);
      if (taskId) resolveTaskId(taskId);
      const approval = approvalFromWire(event.data, input.contextId);
      if (approval) this.emit({
        type: 'approval', nodeId: input.nodeId,
        sessionKey: remoteSessionKey(input.nodeId, input.contextId), approval,
      });
      for (const artifact of remoteArtifacts(event.data)) {
        this.emit({ type: 'artifact', nodeId: input.nodeId, sessionKey: remoteSessionKey(input.nodeId, input.contextId), artifact });
      }
      for (const normalized of boundary.accept(event.data, event.id)) {
        this.emit({ type: 'conversation', nodeId: input.nodeId, event: normalized });
      }
    });
    connection.streams.add({ stop: a2aStream.close });
    const reconnect = () => {
      if (!this.connections.has(input.nodeId)) return;
      this.setState(input.nodeId, 'reconnecting');
      void taskIdReady.then((taskId) => this.reconcileTask(input.nodeId, taskId))
        .finally(() => this.startConversationReplay(input.nodeId, input.contextId, connection, boundary));
    };
    void a2aStream.done.then(reconnect, reconnect);
    return { taskId: await taskIdReady };
  }

  async getTask(nodeId: string, taskId: string): Promise<unknown> {
    const task = await (await this.requireConnection(nodeId)).a2a.getTask(taskId);
    if (JSON.stringify(task).includes('the node restarted')) this.setState(nodeId, 'restarted');
    return task;
  }

  async cancelTask(nodeId: string, taskId: string): Promise<void> {
    await (await this.requireConnection(nodeId)).a2a.cancelTask(taskId);
  }

  async attach(nodeId: string, contextId: string, cursor?: string, taskId?: string): Promise<AgentNodeAttachResult> {
    const connection = await this.requireConnection(nodeId);
    if (taskId) await this.reconcileTask(nodeId, taskId);
    const sessionKey = remoteSessionKey(nodeId, contextId);
    const boundary = new RemoteConversationBoundary(sessionKey);
    const stream = new RetryingStream(
      (nextCursor, onMessage) => connection.control.sessionEvents(contextId, nextCursor, onMessage),
      (message) => {
        const wire = sessionWireEvent(message.event, message.data);
        if (JSON.stringify(wire).includes('the node restarted')) this.setState(nodeId, 'restarted');
        for (const event of boundary.accept(wire, message.id)) {
          this.emit({ type: 'conversation', nodeId, event });
        }
      },
      cursor,
    );
    connection.streams.add(stream);
    void stream.start().catch((error: unknown) => this.handleStreamFailure(nodeId, error));
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
        (message) => {
          if (type === 'node') {
            this.emit({ type, nodeId, event: message.data });
            return;
          }
          const event = normalizeAuthEvent(message.event, message.data);
          if (!event) return;
          const url = event.type === 'auth' ? event.url
            : event.type === 'device_code' ? event.verificationUri : null;
          if (url) void shell.openExternal(url).catch(() => {});
          this.emit({ type, nodeId, event });
        },
      );
      connection.streams.add(stream);
      void stream.start().catch((error: unknown) => this.handleStreamFailure(nodeId, error));
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
        for (const event of boundary.accept(sessionWireEvent(message.event, message.data), message.id)) {
          this.emit({ type: 'conversation', nodeId, event });
        }
      },
      boundary.snapshot().cursor ?? undefined,
    );
    connection.streams.add(stream);
    void stream.start().catch((error: unknown) => this.handleStreamFailure(nodeId, error));
  }

  private handleStreamFailure(nodeId: string, error: unknown): void {
    if (error instanceof ControlVersionError) this.setState(nodeId, 'version-skew');
    if (error instanceof ControlAuthorizationError) this.setState(nodeId, 'revoked');
  }

  private async reconcileTask(nodeId: string, taskId: string): Promise<void> {
    try {
      await this.getTask(nodeId, taskId);
      if (this.runtime.get(nodeId)?.state === 'reconnecting') this.setState(nodeId, 'connected');
    } catch (error) {
      this.handleStreamFailure(nodeId, error);
    }
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

function normalizeAuthEvent(type: string, data: unknown): AuthEvent | null {
  const value = isRecord(data) ? data : {};
  let candidate: unknown;
  if (type === 'auth_url' || type === 'auth') candidate = { type: 'auth', url: value.url, instructions: value.instructions };
  else if (type === 'device_code') candidate = { type, verificationUri: value.verificationUri, userCode: value.userCode, expiresInSeconds: value.expiresInSeconds };
  else if (type === 'prompt') candidate = { type, message: value.message, placeholder: value.placeholder };
  else if (type === 'select') candidate = { type, message: value.message, options: value.options };
  else if (type === 'manual_code' || type === 'manual_input') candidate = { type: 'manual_input', prompt: value.message ?? value.prompt };
  else if (type === 'complete' || type === 'success') candidate = { type: 'success', provider: value.providerId ?? value.provider, message: value.message ?? 'Authentication complete' };
  else if (type === 'error') candidate = { type, provider: value.providerId ?? value.provider, message: value.message };
  else if (type === 'cancelled') candidate = { type };
  else candidate = { type, message: value.message };
  const parsed = AuthEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function sessionWireEvent(type: string, data: unknown): unknown {
  if (type === 'message') return data;
  if (type === 'partial') return { type: 'snapshot', message: { ...(isRecord(data) ? data : {}), role: 'assistant', partial: true, id: 'assistant:partial' } };
  return { type, ...(isRecord(data) ? data : {}) };
}

function taskIdFromWire(value: unknown): string | null {
  const task = taskFromWire(value);
  if (!task) return null;
  return typeof task.id === 'string' ? task.id : typeof task.taskId === 'string' ? task.taskId : null;
}

function approvalFromWire(value: unknown, contextId: string): AgentNodeApproval | null {
  const task = taskFromWire(value);
  if (!task) return null;
  const state = isRecord(task.status) && typeof task.status.state === 'string' ? task.status.state : '';
  if (!state.endsWith('INPUT_REQUIRED')) return null;
  const taskId = taskIdFromWire(task);
  const message = isRecord(task.status) && isRecord(task.status.message) ? task.status.message : null;
  const parts = message && Array.isArray(message.parts) ? message.parts : [];
  const part = parts.find((candidate) => isRecord(candidate) && isRecord(candidate.data));
  const data = isRecord(part) && isRecord(part.data) ? part.data : null;
  const id = data && typeof data.approvalId === 'string' ? data.approvalId : null;
  if (!taskId || !id || !data) return null;
  return {
    id, taskId, contextId,
    title: typeof data.title === 'string'
      ? data.title
      : typeof data.toolName === 'string' ? `Allow ${data.toolName}` : 'Permission required',
    ...(typeof data.description === 'string'
      ? { description: data.description }
      : isRecord(data.input) ? { description: JSON.stringify(data.input) } : {}),
  };
}

function taskFromWire(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const result = isRecord(value.result) ? value.result : value;
  return isRecord(result.task) ? result.task : result;
}
