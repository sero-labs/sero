import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { GraphifyPaths } from '../../shared/paths';
import { readStateFile } from '../../shared/state-io';
import type { AutoContextSettings } from '../../shared/types';
import { createGraphContextState, MAX_AUGMENT_CACHE_KEYS, addBoundedSet } from './state';
import type { GraphContextState } from './state';
import {
  syncGraphContextProjectState,
  resetGraphContextSessionState,
  detectGraphArtifacts,
} from './graph-state';
import {
  buildGraphifySystemPrompt,
  buildSessionOrientation,
  buildGraphifyAugmentContext,
  extractAugmentCacheKey,
  readBoundedText,
} from './augment';
import { classifyGraphifyIntent, type GraphifyIntent } from './intent';
import { runAutoQuery } from './auto-query';
import {
  loadAutoContextSettings,
  MIN_TOOL_RESULT_LINES,
  QUERY_BUDGET,
  REPORT_MAX_CHARS,
  TRIGGER_PATTERNS,
  TRIGGER_TOOLS,
} from './settings';

// Minimal local types for event payloads (avoids importing internal Pi types)
type BeforeAgentStartEvent = { systemPrompt?: string };
type ToolResultEvent = {
  toolName?: string;
  input?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

export type AutoContextRegistration = {
  graphContextState: GraphContextState;
};

/** Truncate text to maxLen, cutting at the last newline before the limit. */
function truncateSnippet(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastNewline = truncated.lastIndexOf('\n');
  return (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated) + '…';
}

/** Build the intent-aware augmentation text for tool results. */
function buildIntentAugmentation(
  intent: GraphifyIntent,
  state: GraphContextState,
): string | undefined {
  if (!state.graphExists) return undefined;
  if (intent.kind === 'none') return undefined;

  const question = intent.suggestedQuestion ?? 'How do these files relate in the system?';
  return (
    `[Graphify] ${intent.reason}. For architecture context, call the \`sero-cli\` model tool with:\n` +
    `graphify_query --question "${question}" --budget ${QUERY_BUDGET}\n` +
    'Do not run a `sero-cli` executable through Bash.'
  );
}

/**
 * Register Graphify auto-context hooks. Fully idle when no graph exists;
 * failures degrade to no injection — never errors a session.
 */
export function registerAutoContext(
  pi: ExtensionAPI,
  paths: GraphifyPaths,
  triggerTools: Set<string> = TRIGGER_TOOLS,
): AutoContextRegistration {
  const graphContextState = createGraphContextState();
  const settings = (): Promise<AutoContextSettings> => loadAutoContextSettings(paths.stateFile);

  pi.on('session_start', async (_event: unknown, ctx: ExtensionContext) => {
    await resetGraphContextSessionState(graphContextState, paths, ctx.cwd);
  });

  pi.on('before_agent_start', async (_event: unknown, ctx: ExtensionContext) => {
    await syncGraphContextProjectState(graphContextState, paths, ctx.cwd);

    if (!graphContextState.graphExists) return;
    if (graphContextState.reportContextInjected) return;

    const event = _event as BeforeAgentStartEvent;
    if (!event.systemPrompt) return;

    const autoContext = await settings();
    graphContextState.reportContextInjected = true;

    let promptText: string;
    if (autoContext.sessionSummary) {
      const artifacts = await detectGraphArtifacts(paths, ctx.cwd);
      let reportSnippet: string | undefined;
      if (artifacts.reportExists) {
        const reportText = readBoundedText(artifacts.reportPath, REPORT_MAX_CHARS);
        if (reportText) reportSnippet = truncateSnippet(reportText, 400);
      }

      // Profile-wide graph summary from plugin state (no graph read needed).
      let profileSummary: string | undefined;
      const state = await readStateFile(paths.stateFile);
      if (state?.profileGraph.status === 'ready') {
        profileSummary = `${state.profileGraph.nodes ?? 0} nodes / ${state.profileGraph.edges ?? 0} edges across ${state.profileGraph.workspaceIds?.length ?? 0} workspaces. Use the sero-cli model tool with graphify_search.`;
      }

      promptText = buildSessionOrientation(graphContextState, reportSnippet, profileSummary);
      if (promptText.length > autoContext.maxAugmentChars) {
        promptText = promptText.slice(0, autoContext.maxAugmentChars) + '…';
      }
    } else {
      promptText = buildGraphifySystemPrompt();
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptText}`,
    };
  });

  // tool_result is a typed event on ExtensionAPI
  // Use broad cast to bypass strict handler type while keeping event name type-safe
  (
    pi as {
      on: (
        event: string,
        handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>,
      ) => void;
    }
  ).on('tool_result', async (_event: unknown, ctx: ExtensionContext) => {
    const autoContext = await settings();
    if (!autoContext.augmentSearchResults) return;

    const event = _event as ToolResultEvent;
    if (!event.toolName || !triggerTools.has(event.toolName)) return;
    if (!event.content || !Array.isArray(event.content)) return;

    await syncGraphContextProjectState(graphContextState, paths, ctx.cwd);
    if (!graphContextState.graphExists) return;

    // Enforce session augmentation budget
    if (graphContextState.augmentHits >= autoContext.maxSessionAugments) return;

    // Skip small results
    const totalLines = event.content.reduce((acc, c) => {
      if (c.text) return acc + c.text.split('\n').length;
      return acc;
    }, 0);
    if (totalLines < MIN_TOOL_RESULT_LINES) return;

    // Classify intent
    const intent = classifyGraphifyIntent(event, TRIGGER_PATTERNS);
    if (intent.kind === 'none') return;

    graphContextState.hookFires += 1;
    const cacheKey = intent.cacheKey;
    if (graphContextState.augmentedCache.has(cacheKey)) return;
    if (graphContextState.emptyCache.has(cacheKey)) return;

    let augmentText: string | undefined;

    // Auto-query mode: run an in-process graph query on high-confidence intents
    if (autoContext.autoQuery && intent.confidence >= 0.7) {
      const queryResult = await runAutoQuery(
        graphContextState.graphPath,
        intent,
        QUERY_BUDGET,
        autoContext.maxAugmentChars,
      );
      if (queryResult) {
        augmentText = `[Graphify] ${intent.reason}.\n\n${queryResult}`;
      }
    }

    // Fall back to intent-aware hint
    if (!augmentText) {
      augmentText = buildIntentAugmentation(intent, graphContextState);
    }

    if (!augmentText) {
      addBoundedSet(graphContextState.emptyCache, cacheKey, MAX_AUGMENT_CACHE_KEYS);
      return;
    }

    // Bound augmentation text
    const boundedText =
      augmentText.length > autoContext.maxAugmentChars
        ? augmentText.slice(0, autoContext.maxAugmentChars) + '…'
        : augmentText;

    addBoundedSet(graphContextState.augmentedCache, cacheKey, MAX_AUGMENT_CACHE_KEYS);
    graphContextState.augmentHits += 1;

    return {
      content: [...event.content, { type: 'text', text: `\n\n---\n${boundedText}\n---` }],
    };
  });

  pi.on('session_shutdown', async () => {
    graphContextState.augmentedCache.clear();
    graphContextState.emptyCache.clear();
  });

  return { graphContextState };
}
