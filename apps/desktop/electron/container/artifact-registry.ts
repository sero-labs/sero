/**
 * Artifact Registry — tracks screenshots, logs, and evidence from agent sessions.
 *
 * Follows the same event-driven, in-memory registry pattern as DevServerRegistry.
 * Artifacts are ephemeral (don't survive app restart) and are associated with
 * a workspace + session pair.
 */

import crypto from 'crypto';

// ── Types ───────────────────────────────────────────────────

export type ArtifactType = 'screenshot' | 'log' | 'video';

export interface Artifact {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: ArtifactType;
  title: string;
  timestamp: string;
  /** Path inside the container (e.g. /workspace/.sero/artifacts/screenshot-001.png). */
  containerPath?: string;
  /** Base64-encoded data (for screenshots). */
  base64?: string;
  mimeType: string;
}

export type ArtifactChangeEvent =
  | { type: 'added'; artifact: Artifact }
  | { type: 'removed'; artifactId: string };

type ChangeListener = (event: ArtifactChangeEvent) => void;

// ── Registry ────────────────────────────────────────────────

export class ArtifactRegistry {
  /** All artifacts: key = artifactId */
  private artifacts = new Map<string, Artifact>();
  private listeners = new Set<ChangeListener>();
  /** Auto-increment counter for human-readable titles. */
  private counters = new Map<string, number>();

  // ── Registration ──────────────────────────────────────────

  /**
   * Add an artifact. Returns the created Artifact.
   * If no title is provided, auto-generates "Screenshot 1", "Screenshot 2", etc.
   */
  add(params: {
    sessionId: string;
    workspaceId: string;
    type: ArtifactType;
    title?: string;
    containerPath?: string;
    base64?: string;
    mimeType: string;
  }): Artifact {
    const counterKey = `${params.sessionId}:${params.type}`;
    const count = (this.counters.get(counterKey) ?? 0) + 1;
    this.counters.set(counterKey, count);

    const title =
      params.title ??
      `${params.type.charAt(0).toUpperCase() + params.type.slice(1)} ${count}`;

    const artifact: Artifact = {
      id: crypto.randomUUID(),
      sessionId: params.sessionId,
      workspaceId: params.workspaceId,
      type: params.type,
      title,
      timestamp: new Date().toISOString(),
      containerPath: params.containerPath,
      base64: params.base64,
      mimeType: params.mimeType,
    };

    this.artifacts.set(artifact.id, artifact);
    this.emit({ type: 'added', artifact });
    console.log(
      `[artifact] Added: ${artifact.type} "${artifact.title}" (session ${artifact.sessionId})`,
    );
    return artifact;
  }

  /** Remove an artifact by ID. */
  remove(artifactId: string): boolean {
    if (!this.artifacts.has(artifactId)) return false;
    this.artifacts.delete(artifactId);
    this.emit({ type: 'removed', artifactId });
    return true;
  }

  // ── Queries ───────────────────────────────────────────────

  /** List all artifacts, optionally filtered by session. */
  list(sessionId?: string): Artifact[] {
    const all = Array.from(this.artifacts.values());
    if (!sessionId) return all;
    return all.filter((a) => a.sessionId === sessionId);
  }

  /** Get a single artifact by ID. */
  get(artifactId: string): Artifact | undefined {
    return this.artifacts.get(artifactId);
  }

  /** Clear all artifacts for a session. */
  clearSession(sessionId: string): void {
    for (const [id, artifact] of this.artifacts) {
      if (artifact.sessionId === sessionId) {
        this.artifacts.delete(id);
        this.emit({ type: 'removed', artifactId: id });
      }
    }
  }

  // ── Events ────────────────────────────────────────────────

  /** Subscribe to registry change events. Returns unsubscribe function. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ArtifactChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[artifact] Listener error:', err);
      }
    }
  }

  /** Build a markdown summary of artifacts for PR descriptions. */
  buildPrSummary(sessionId: string): string | null {
    const artifacts = this.list(sessionId);
    if (artifacts.length === 0) return null;

    const screenshots = artifacts.filter((a) => a.type === 'screenshot');
    const logs = artifacts.filter((a) => a.type === 'log');

    const lines: string[] = ['## Agent Verification', ''];

    if (screenshots.length > 0) {
      lines.push(
        `The agent captured **${screenshots.length} screenshot${screenshots.length > 1 ? 's' : ''}** verifying the changes:`,
        '',
      );
      for (const s of screenshots) {
        lines.push(`- **${s.title}** (${s.timestamp})`);
      }
      lines.push('');
    }

    if (logs.length > 0) {
      lines.push(
        `**${logs.length} log${logs.length > 1 ? 's' : ''}** captured:`,
        '',
      );
      for (const l of logs) {
        lines.push(`- ${l.title}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Clean up on shutdown. */
  dispose(): void {
    this.listeners.clear();
    this.artifacts.clear();
    this.counters.clear();
  }
}
