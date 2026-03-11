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

import type { GatewayAgentOps } from './index';
import type { GatewayPushEvent, GatewayToolEndEvent } from './protocol';
import type { CostTracker } from './cost-tracker';

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
}

let _sink: EventSink | null = null;
let _costTracker: CostTracker | null = null;

/** Called by gateway.ts once the server is started. */
export function setGatewayEventSink(sink: EventSink): void {
  _sink = sink;
}

/** Called by gateway.ts to enable cost tracking for forwarded events. */
export function setGatewayCostTracker(tracker: CostTracker): void {
  _costTracker = tracker;
}

/**
 * Called by agent.ts's sendEvent() to forward every agent stream event
 * to gateway WebSocket clients. Maps AgentStreamEvent → GatewayPushEvent.
 */
export function forwardEventToGateway(event: Record<string, unknown>): void {
  if (!_sink) return;

  const sessionId = event.sessionId as string | undefined;
  if (!sessionId) return;

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

  const mapped = mapAgentEvent(sessionId, event);
  if (mapped) {
    _sink.pushEvent(sessionId, mapped);
  }
}

/** Map an AgentStreamEvent to a GatewayPushEvent (or null to skip). */
function mapAgentEvent(
  sessionId: string,
  event: Record<string, unknown>,
): GatewayPushEvent | null {
  switch (event.type) {
    case 'agent_start':
      return { type: 'agent_start', sessionId };

    case 'agent_end':
      return { type: 'agent_end', sessionId };

    case 'text_delta':
      return { type: 'text_delta', sessionId, delta: event.delta as string };

    case 'thinking_delta':
      return { type: 'thinking_delta', sessionId, delta: event.delta as string };

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
