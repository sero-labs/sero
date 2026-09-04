/**
 * Gateway ↔ Agent Pool bridge.
 *
 * agent.ts registers its pool operations here at startup.
 * The gateway server reads them to service remote client requests.
 *
 * Also handles event forwarding: agent stream events are mapped to
 * gateway push events and relayed to subscribed WebSocket clients.
 *
 * This follows the same callback-injection pattern used by the CLI
 * agent bridge (electron/cli/agent-bridge.ts) — avoids tightly
 * coupling the gateway to the agent pool's internal types.
 */

import type { GatewayAgentOps } from '..';
import type { GatewayPushEvent, GatewayToolEndEvent } from '../server/protocol';
import {
  TURN_SNIPPET_MAX,
  type GatewaySessionState,
} from '../server/protocol-events';
import type { CostTracker } from '../server/cost-tracker';
import { notify } from '@electron/features/notifications/feed';

// ── Agent operations bridge ─────────────────────────────────

let _ops: GatewayAgentOps | null = null;

/** Called by agent.ts after the pool is ready. */
export function installGatewayAgentOps(ops: GatewayAgentOps): void {
  _ops = ops;
  console.log('[gateway] Agent operations bridge installed');
}

/** Called by the gateway server to get agent operations. */
export function getGatewayAgentOps(): GatewayAgentOps | null {
  return _ops;
}

// ── Event forwarding ────────────────────────────────────────

/** Minimal interface — avoids importing the full GatewayServer. */
interface EventSink {
  pushEvent(sessionId: string, event: GatewayPushEvent): void;
  broadcastWorkspaceEvent(workspaceId: string, event: GatewayPushEvent): void;
}

type GatewayEventListener = (event: GatewayPushEvent) => void;

let _sink: EventSink | null = null;
let _costTracker: CostTracker | null = null;
const _listeners = new Set<GatewayEventListener>();

/** Called by gateway.ts once the server is started. */
export function setGatewayEventSink(sink: EventSink): void {
  _sink = sink;
}

/** Called by gateway.ts to enable cost tracking for forwarded events. */
export function setGatewayCostTracker(tracker: CostTracker): void {
  _costTracker = tracker;
}

/** Subscribe to gateway push events forwarded from the agent stream. */
export function subscribeGatewayEvents(listener: GatewayEventListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Called by agent.ts's sendEvent() to forward every agent stream event
 * to gateway WebSocket clients. Maps AgentStreamEvent → GatewayPushEvent.
 */
export function forwardEventToGateway(event: Record<string, unknown>): void {
  if (!_sink) return;

  const sessionId = event.sessionId as string | undefined;
  if (!sessionId) return;

  trackTurnSnippet(sessionId, event);

  // Record token usage for cost tracking (from message_end events)
  if (_costTracker && event.type === 'message_end') {
    const usage = event.usage as Record<string, unknown> | undefined;
    const model = (event.model as string) ?? 'unknown';
    if (usage) {
      const inputTokens = (usage.inputTokens as number) ?? (usage.input_tokens as number) ?? 0;
      const outputTokens = (usage.outputTokens as number) ?? (usage.output_tokens as number) ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        _costTracker.recordUsage(sessionId, model, inputTokens, outputTokens);
      }
    }
  }

  const workspaceId = _ops?.getSessionWorkspaceId(sessionId) ?? null;

  const mapped = mapAgentEvent(sessionId, workspaceId, event);
  if (mapped) {
    // Lifecycle events name a workspace, so every client that can reach
    // that workspace gets them — including for sessions it has not opened.
    // Everything else stays on the per-session subscription path.
    if (workspaceId && (mapped.type === 'agent_start' || mapped.type === 'agent_end')) {
      _sink.broadcastWorkspaceEvent(workspaceId, mapped);
    } else {
      _sink.pushEvent(sessionId, mapped);
    }
    notifyListeners(mapped);
  }

  if (workspaceId) {
    for (const derived of deriveStateEvents(sessionId, workspaceId, event)) {
      _sink.broadcastWorkspaceEvent(workspaceId, derived);
      notifyListeners(derived);
      recordTurnNotification(derived);
    }
  }
}

/**
 * Put a finished turn in the notification feed, so "session finished"
 * reaches a phone without every plugin having to notify.
 *
 * No desktop toast: the desktop is where the turn just finished, and a
 * popup for every turn would be noise.
 */
function recordTurnNotification(event: GatewayPushEvent): void {
  if (event.type !== 'turn_complete') return;

  notify({
    message: event.snippet || 'The agent finished its turn.',
    type: event.outcome === 'error' ? 'error' : 'info',
    source: 'Session',
    workspaceId: event.workspaceId,
    silentOnDesktop: true,
  });
}

function notifyListeners(event: GatewayPushEvent): void {
  for (const listener of _listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error('[gateway] Event listener error:', err);
    }
  }
}

// ── Session state and turn completion ───────────────────────

/**
 * The opening of the agent's most recent message, per session. Reset at
 * every message boundary so `turn_complete` reports the last message and
 * not the first. Capped at TURN_SNIPPET_MAX and dropped when the turn ends.
 */
const _turnSnippets = new Map<string, string>();

function trackTurnSnippet(sessionId: string, event: Record<string, unknown>): void {
  if (event.type === 'message_start' || event.type === 'agent_start') {
    _turnSnippets.set(sessionId, '');
    return;
  }
  if (event.type !== 'text_delta') return;

  const current = _turnSnippets.get(sessionId);
  if (current === undefined || current.length >= TURN_SNIPPET_MAX) return;
  const delta = typeof event.delta === 'string' ? event.delta : '';
  _turnSnippets.set(sessionId, (current + delta).slice(0, TURN_SNIPPET_MAX));
}

function takeTurnSnippet(sessionId: string): string | undefined {
  const snippet = _turnSnippets.get(sessionId)?.trim();
  _turnSnippets.delete(sessionId);
  return snippet ? snippet : undefined;
}

function toTurnOutcome(value: unknown): 'completed' | 'cancelled' | 'error' {
  return value === 'cancelled' || value === 'error' ? value : 'completed';
}

/**
 * Session-state and turn-completion events derived from the agent stream.
 * `agent_end` is the same moment the desktop calls `emitTurnComplete`, and
 * it already reaches the gateway, so it is the single source for both.
 */
function deriveStateEvents(
  sessionId: string,
  workspaceId: string,
  event: Record<string, unknown>,
): GatewayPushEvent[] {
  const ts = Date.now();

  if (event.type === 'agent_start') {
    return [sessionStateEvent(workspaceId, sessionId, 'running', ts)];
  }

  if (event.type === 'agent_end') {
    return [
      {
        type: 'turn_complete',
        workspaceId,
        sessionId,
        ts,
        outcome: toTurnOutcome(event.outcome),
        snippet: takeTurnSnippet(sessionId),
      },
      sessionStateEvent(workspaceId, sessionId, 'idle', ts),
    ];
  }

  return [];
}

function sessionStateEvent(
  workspaceId: string,
  sessionId: string,
  state: GatewaySessionState,
  ts: number,
): GatewayPushEvent {
  return { type: 'session_state', workspaceId, sessionId, state, ts };
}

/**
 * Announce that a session is blocked on the user, or no longer is.
 * Called by the choice/user-feedback bridge; the agent stream has no
 * event for it.
 */
export function publishSessionState(sessionId: string, state: GatewaySessionState): void {
  const workspaceId = _ops?.getSessionWorkspaceId(sessionId) ?? null;
  if (!_sink || !workspaceId) return;
  const event = sessionStateEvent(workspaceId, sessionId, state, Date.now());
  _sink.broadcastWorkspaceEvent(workspaceId, event);
  notifyListeners(event);
}

/** Map an AgentStreamEvent to a GatewayPushEvent (or null to skip). */
function mapAgentEvent(
  sessionId: string,
  workspaceId: string | null,
  event: Record<string, unknown>,
): GatewayPushEvent | null {
  switch (event.type) {
    case 'agent_start':
      return workspaceId ? { type: 'agent_start', workspaceId, sessionId } : null;

    case 'agent_end':
      return workspaceId ? { type: 'agent_end', workspaceId, sessionId } : null;

    case 'text_delta':
      return { type: 'text_delta', sessionId, delta: event.delta as string };

    case 'thinking_delta':
      return { type: 'thinking_delta', sessionId, delta: event.delta as string };

    case 'tool_input_start':
      return {
        type: 'tool_input_start',
        sessionId,
        streamKey: event.streamKey as string,
        toolName: event.toolName as string,
      };

    case 'tool_input_delta':
      return {
        type: 'tool_input_delta',
        sessionId,
        streamKey: event.streamKey as string,
        delta: event.delta as string,
        replace: event.replace as boolean,
        path: (event.path as string | null) ?? null,
      };

    case 'tool_input_end':
      return {
        type: 'tool_input_end',
        sessionId,
        streamKey: event.streamKey as string,
        toolCallId: event.toolCallId as string,
      };

    case 'tool_start': {
      const tool = event.tool as Record<string, unknown> | undefined;
      return {
        type: 'tool_start',
        sessionId,
        toolName: (tool?.toolName as string) ?? 'unknown',
        toolCallId: (tool?.toolCallId as string) ?? '',
        input: tool?.input as Record<string, unknown> | undefined,
      };
    }

    case 'tool_end':
      return {
        type: 'tool_end',
        sessionId,
        toolCallId: event.toolCallId as string,
        output: (event.output as string) ?? null,
        isError: (event.isError as boolean) ?? false,
        images: Array.isArray(event.images) ? event.images as GatewayToolEndEvent['images'] : undefined,
      };

    case 'artifact_added':
      return {
        type: 'artifact_added',
        sessionId,
        artifactId: event.artifactId as string,
        artifactType: event.artifactType as string,
        title: event.title as string,
      };

    default:
      return null; // message_start, message_end, etc. — not forwarded
  }
}
