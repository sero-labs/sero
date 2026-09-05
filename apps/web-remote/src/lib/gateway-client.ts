/**
 * Typed requests to the Sero gateway.
 *
 * One method per request type. A method that returns a promise sends a
 * correlated request and resolves with the host's `data`; one that
 * returns nothing sends and lets the store handlers pick up the reply.
 */

import { GatewayTransport } from './gateway-transport';
import type {
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from './gateway-protocol';

export type {
  ConnectionState,
  DisconnectEvent,
  GatewayErrorResponse,
  GatewayMessage,
  GatewayOkResponse,
  GatewayPushEvent,
  GatewayResponse,
  MessageHandler,
  SessionState,
  VoiceTranscriptionResult,
  VoiceTranscriptionStatus,
} from './gateway-protocol';

/**
 * Mirror of the gateway's protocol cap on `voice_transcribe.audioDataUrl`.
 * Kept slightly under the host's 36 MB WebSocket payload limit so the user
 * sees a helpful error rather than a WebSocket disconnect.
 */
const MAX_VOICE_AUDIO_DATA_URL_BYTES = 35 * 1024 * 1024;

export class GatewayClient extends GatewayTransport {
  /** Send a prompt to the agent, optionally with images. */
  sendPrompt(
    workspaceId: string,
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
  ): void {
    this.send({
      type: 'prompt',
      workspaceId,
      sessionId,
      text,
      images: images?.length ? images : undefined,
      idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  }

  /** Request workspace list. */
  requestWorkspaces(): void {
    this.send({ type: 'list_workspaces' });
  }

  /**
   * The sessions of one workspace.
   *
   * Correlated, because replies do not come back in request order: an
   * ordered socket says nothing about the order the host's handlers
   * finish in, and an empty list names no workspace on its own.
   */
  requestSessions(workspaceId: string): Promise<unknown> {
    return this.sendRequest({ type: 'list_sessions', workspaceId });
  }

  /** Search every session this token can reach. */
  searchSessions(query: string, limit?: number): void {
    this.send({ type: 'search_sessions', query, limit });
  }

  /** Put a file into a workspace. A bare name lands in `uploads/`. */
  uploadFile(workspaceId: string, filePath: string, contentBase64: string): void {
    this.send({ type: 'upload_file', workspaceId, path: filePath, contentBase64 });
  }

  /** Read the working tree of a workspace. */
  gitStatus(workspaceId: string): Promise<unknown> {
    return this.sendRequest({ type: 'git_status', workspaceId });
  }

  /** Read one file's diff. */
  gitDiff(workspaceId: string, filePath: string, staged: boolean): Promise<unknown> {
    return this.sendRequest({ type: 'git_diff', workspaceId, path: filePath, staged });
  }

  /** Commit exactly `paths`. Owner tokens only. */
  gitCommit(workspaceId: string, message: string, paths: string[]): Promise<unknown> {
    return this.sendRequest({ type: 'git_commit', workspaceId, message, paths });
  }

  /** Read the notification feed, newest first. */
  listNotifications(since?: number, limit?: number): void {
    this.send({ type: 'list_notifications', since, limit });
  }

  /** Mark notifications read for every client. */
  markNotificationsRead(ids: string[]): void {
    this.send({ type: 'mark_notifications_read', ids });
  }

  /** Remove entries from the feed for every client. */
  dismissNotifications(ids: string[]): void {
    this.send({ type: 'dismiss_notifications', ids });
  }

  /** Remove every read entry. Unread entries stay. */
  clearReadNotifications(): void {
    this.send({ type: 'clear_read_notifications' });
  }

  /** List the dashboard widgets this client may load. */
  listRemoteWidgets<T>(workspaceId: string | null): Promise<T> {
    return this.sendRequest<T>({
      type: 'list_remote_widgets',
      ...(workspaceId ? { workspaceId } : {}),
    });
  }

  /** Read one widget's state, named by its opaque key. */
  appStateGet<T>(key: string): Promise<T> {
    return this.sendRequest<T>({ type: 'app_state_get', key });
  }

  /** Watch one widget's state. Changes arrive as `app_state_changed`. */
  appStateWatch<T>(key: string): Promise<T> {
    return this.sendRequest<T>({ type: 'app_state_watch', key });
  }

  /** Write one widget's state, refusing when the file moved. */
  appStateSet<T>(key: string, data: unknown, expectedEtag?: string | null): Promise<T> {
    return this.sendRequest<T>({ type: 'app_state_set', key, data, expectedEtag });
  }

  /** Stop watching one widget's state. */
  appStateUnwatch(key: string): Promise<unknown> {
    return this.sendRequest({ type: 'app_state_unwatch', key });
  }

  /** Ask whether this machine can send Web Push, and for its key. */
  pushStatus<T>(): Promise<T> {
    return this.sendRequest<T>({ type: 'push_status' });
  }

  /** Register this browser for Web Push. */
  pushSubscribe<T>(endpoint: string, p256dh: string, auth: string): Promise<T> {
    return this.sendRequest<T>({ type: 'push_subscribe', endpoint, p256dh, auth });
  }

  /** Stop this browser's Web Push. */
  pushUnsubscribe<T>(endpoint: string): Promise<T> {
    return this.sendRequest<T>({ type: 'push_unsubscribe', endpoint });
  }

  /** Answer a choice an agent is waiting on. */
  answerChoice(id: string, optionId: string): void {
    this.send({ type: 'answer_choice', id, optionId });
  }

  /** Request token and cost totals for the reachable sessions. */
  requestUsage(): void {
    this.send({ type: 'get_usage' });
  }

  /** Create a new session. */
  createSession(workspaceId: string, name?: string): void {
    this.send({ type: 'create_session', workspaceId, name });
  }

  /** Delete one session. The workspace must hold it. */
  deleteSession(workspaceId: string, sessionId: string): void {
    this.send({ type: 'delete_session', workspaceId, sessionId });
  }

  /**
   * Ask for the session's model, thinking level, and the models it
   * could switch to. This opens the session on the host.
   */
  requestSessionModel(workspaceId: string, sessionId: string): void {
    this.send({ type: 'get_session_model', workspaceId, sessionId });
  }

  /** Switch the session to another model. */
  setSessionModel(
    workspaceId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ): void {
    this.send({ type: 'set_session_model', workspaceId, sessionId, provider, modelId });
  }

  /** Set the session's thinking level. */
  setSessionThinking(workspaceId: string, sessionId: string, level: string): void {
    this.send({ type: 'set_session_thinking', workspaceId, sessionId, level });
  }

  /** Abort the active agent. */
  abortSession(sessionId: string): void {
    this.send({ type: 'abort', sessionId });
  }

  /** Request session message history. */
  requestSessionHistory(workspaceId: string, sessionId: string): void {
    this.send({ type: 'get_session_history', workspaceId, sessionId });
  }

  /** List files in a workspace directory. */
  listFiles(workspaceId: string, filePath: string): void {
    this.send({ type: 'list_files', workspaceId, path: filePath });
  }

  /** Read a file from a workspace. */
  readFile(workspaceId: string, filePath: string): void {
    this.send({ type: 'read_file', workspaceId, path: filePath });
  }

  /** Ask for `file_tree_changed` events from a workspace. */
  watchFileTree(workspaceId: string): void {
    this.send({ type: 'file_tree_watch', workspaceId });
  }

  /** Stop the `file_tree_changed` events from a workspace. */
  unwatchFileTree(workspaceId: string): void {
    this.send({ type: 'file_tree_unwatch', workspaceId });
  }

  /** List artifacts for a session. */
  listArtifacts(sessionId: string): void {
    this.send({ type: 'list_artifacts', sessionId });
  }

  /** Get artifact data. */
  getArtifact(artifactId: string): void {
    this.send({ type: 'get_artifact', artifactId });
  }

  /** Create a web token (requires master token auth). */
  createWebToken(workspaceIds: string[] | null = null, label?: string, expiryDays?: number): void {
    this.send({ type: 'create_web_token', workspaceIds, label, expiryDays });
  }

  /** List web tokens. */
  listWebTokens(): void {
    this.send({ type: 'list_web_tokens' });
  }

  /** Revoke a web token. */
  revokeWebToken(tokenId: string): void {
    this.send({ type: 'revoke_web_token', tokenId });
  }

  /** List dev servers, optionally filtered to a single workspace. */
  listDevServers(workspaceId?: string): void {
    this.send(
      workspaceId
        ? { type: 'list_dev_servers', workspaceId }
        : { type: 'list_dev_servers' },
    );
  }

  /**
   * Mint a short-lived ticket authorising HTTP/WS access to a dev server
   * via the gateway's `/p/<workspace>/<port>/...` proxy.
   */
  createDevServerTicket(workspaceId: string, port: number): void {
    this.send({ type: 'create_devserver_ticket', workspaceId, port });
  }

  /** Check whether the host is configured to perform voice transcription. */
  voiceStatus(timeoutMs = 10_000): Promise<VoiceTranscriptionStatus> {
    return this.sendRequest<VoiceTranscriptionStatus>(
      { type: 'voice_status' },
      timeoutMs,
    );
  }

  /**
   * Transcribe a base64 audio data URL via the host's OpenAI integration.
   * The 90 s timeout allows for upload of larger recordings on slow networks
   * plus the host's own 60 s OpenAI request timeout.
   *
   * Pre-flighted client-side against the 35 MB protocol cap so users get a
   * useful "recording too large" error instead of an opaque WebSocket drop
   * when the gateway's 36 MB payload limit kicks in.
   */
  transcribeVoice(
    audioDataUrl: string,
    mimeType?: string,
    timeoutMs = 90_000,
  ): Promise<VoiceTranscriptionResult> {
    if (audioDataUrl.length > MAX_VOICE_AUDIO_DATA_URL_BYTES) {
      return Promise.reject(
        new Error(
          'Recorded audio is too large to send (limit ~25 MB after decoding). Please record a shorter clip.',
        ),
      );
    }
    return this.sendRequest<VoiceTranscriptionResult>(
      { type: 'voice_transcribe', audioDataUrl, mimeType },
      timeoutMs,
    );
  }
}
