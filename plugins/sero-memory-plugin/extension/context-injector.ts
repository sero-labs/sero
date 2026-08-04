/**
 * ContextInjector — injects memory context into the agent's context.
 *
 * Split injection model (designed for provider-level prompt caching):
 *   System prompt (session-stable; captured once per session in `frozen` mode):
 *     - IDENTITY.md + USER.md — persona
 *     - MEMORY.md — curated long-term memory
 *     - Memory instructions — retrieval/storage commands (deterministic)
 *
 *   Per-turn message stream (changes between turns):
 *     - QMD search results — memories relevant to the current user prompt
 *       (only when auto-retrieve is on)
 *
 * The `context` event strips prior-turn search messages so only the latest
 * copy reaches the LLM. The system-prompt addition
 * is byte-identical across turns in frozen mode so cache hits are preserved.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  checkBootstrapStatus,
  IDENTITY_QUESTIONS,
  MEMORY_QUESTIONS,
  USER_QUESTIONS,
} from './bootstrap';
import type { BootstrapStatus } from './bootstrap';
import { getUserPath, readFile, resolveMemoryRoot } from './memory-manager';
import { getAutoRetrieveModeSync, getMemorySnapshotModeSync } from './memory-config';
import type { AutoRetrieveMode } from './memory-config';
import { buildPriorityContextSplit, clearPriorityContextCache } from './priority-context';
import { isQmdAvailable, runQmdUpdateNow } from './qmd';
import { error, errorDetails, info } from './logger';
import { runPhase1Migration } from './migration';
import {
  clearPhase1MigrationState,
  getPhase1MigrationState,
  setPhase1MigrationState,
} from './phase1-migration-state';
import { flushPendingStats } from './memory-scoring';
import { getCavemanPromptAddition } from './caveman';
import { getMemoryInstructions } from './memory-instructions';
import {
  clearMemoryPromptDebugState,
  logMemoryPromptAgentStart,
  logMemoryPromptBeforeAgentStart,
} from './prompt-debug';

/** Custom message type for auto-retrieved search results. */
const SEARCH_CONTEXT_TYPE = 'memory-search-context';

/**
 * Custom message type for the display-only memory context block. The desktop
 * renderer intercepts this (see agent-subscription.ts) and surfaces it as a
 * collapsible block gated behind the MemoryBlocksToggle. It is stripped from
 * the LLM-bound message stream by the `context` hook so it never duplicates
 * the static memory already injected into the system prompt.
 */
const MEMORY_CONTEXT_DISPLAY_TYPE = 'memory-context';

let cachedStatus: BootstrapStatus | null = null;

async function getCachedBootstrapStatus(): Promise<BootstrapStatus> {
  if (!cachedStatus) cachedStatus = await checkBootstrapStatus();
  return cachedStatus;
}

export function resetBootstrapCache(): void {
  cachedStatus = null;
}

export function markBootstrapDone(): void {
  cachedStatus = { needsBootstrap: false, existingUserContent: null };
}

export { buildPriorityContext } from './priority-context';

function formatToolParamsJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function buildBootstrapInstructions(existingUserContent: string | null): string {
  const identityJson = formatToolParamsJson(IDENTITY_QUESTIONS);
  const userJson = formatToolParamsJson(USER_QUESTIONS);
  const memoryJson = formatToolParamsJson(MEMORY_QUESTIONS);

  const userNote = existingUserContent
    ? `\n\nNote: USER.md already has content:\n\`\`\`\n${existingUserContent}\n\`\`\`\nConfirm this is correct with the user rather than re-asking. Skip the user questionnaire if the content looks good.`
    : '';

  return `
## Memory Setup Required

The memory system is not yet initialised. You MUST set it up now before doing anything else.
Use the \`questionnaire\` tool to ask the user three rounds of questions, then write the answers to memory files.${userNote}

The questionnaire UI supports step-based multiple-choice forms, multi-select questions, and option-specific \`subQuestion\` choices. For any question that already includes predefined \`options\`, preserve those options exactly so the user gets clickable choices. Do NOT rewrite option-based questions into free-form chat. Only rely on custom text when none of the provided options fit.

### Step 1: Identity Setup
YOU MUST call the \`questionnaire\` tool with the exact JSON parameters below to configure the agent persona. Preserve every \`options\`, \`label\`, \`description\`, \`exclusive\`, \`multiSelect\`, and \`allowOther\` field exactly as shown:
${identityJson}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --mode overwrite --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answers joined with commas if multiple>\\n- **Rules:** <rules answers joined with commas if multiple>"\`

### Step 2: User Profile setup
YOU MUST call the \`questionnaire\` tool again with the exact JSON parameters below to configure the user profile. Keep the predefined options intact so the user can tap through the multiple-choice UI where applicable:
${userJson}

After receiving answers, write USER.md:
\`sero memory write --target user --mode overwrite --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role answers joined with commas if multiple>\\n- **Location:** <location>\\n- **Tech Stack:** <stack answers joined with commas if multiple>\\n- **Communication:** <communication answers joined with commas if multiple>\\n- **Caveman Mode:** <lite|full|ultra if selected, otherwise off>"\`

If the user selected caveman mode but the level answer is unavailable, write \`full\` for \`Caveman Mode\`.

### Step 3: Long-term Memory
YOU MUST call the \`questionnaire\` tool again with the exact JSON parameters below. Keep the option lists intact instead of converting these prompts into open-ended chat questions:
${memoryJson}

After receiving answers, write MEMORY.md:
\`sero memory write --target memory --mode overwrite --content "# Memory\\n\\n## Technical Knowledge\\n\\n<tech_knowledge answers — use short bullet lines if multiple>\\n\\n## Coding Preferences\\n\\n<explorer_prefs answers — use short bullet lines if multiple>\\n\\n## Active Projects\\n\\n<projects answer>"\`

### Important
- Run each questionnaire step in order — don't skip steps.
- Use the exact tool parameters shown above.
- Prefer the predefined multiple-choice options whenever they fit; \`allowOther\` is only the fallback for custom answers.
- For any \`multiSelect\` question, preserve all selected human-readable answers when writing the memory files.
- When writing the memory files, use the human-readable answer text the user selected or typed.
- After writing all three files, confirm to the user that memory is set up.
- Be friendly and natural between steps — this is a first-time experience.`;
}

/**
 * Build the memory context for a normal (non-bootstrap) turn.
 *
 * Returns:
 *   - `systemPromptAddition`: session-stable memory + instructions for the
 *     system prompt. Byte-identical across turns in frozen mode so provider
 *     prompt caching keeps hitting.
 *   - `searchContext`: dynamic QMD search results for message injection
 *   - `contextBlock`: full combined context (for debug logging only)
 */
async function buildTurnContext(
  prompt: string,
  sessionId: string,
  autoRetrieveMode: AutoRetrieveMode,
): Promise<{
  systemPromptAddition: string;
  searchContext: string;
  contextBlock: string;
  memoryInstructions: string;
}> {
  const root = resolveMemoryRoot();
  const snapshotMode = getMemorySnapshotModeSync();
  const { staticContext, searchContext } = await buildPriorityContextSplit(
    root,
    prompt,
    sessionId,
    snapshotMode,
    { includeSearch: autoRetrieveMode === 'on' },
  );
  const memoryInstructions = getMemoryInstructions();
  const userContent = await readFile(getUserPath(root));
  const cavemanInstructions = getCavemanPromptAddition(userContent ?? staticContext);
  const systemPromptAddition = staticContext + memoryInstructions + cavemanInstructions;
  // Full combined context for debug logging only — not the wire format.
  const parts: string[] = [];
  if (staticContext) parts.push(staticContext);
  if (searchContext) parts.push(searchContext);
  const contextBlock = parts.join('\n\n---\n\n');

  return { systemPromptAddition, searchContext, contextBlock, memoryInstructions };
}

export function registerContextInjection(pi: ExtensionAPI): void {
  pi.on('session_start', (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    info('bootstrap_cache_reset', { source: 'session_start', sessionId });
    clearPriorityContextCache(sessionId);
    clearMemoryPromptDebugState(sessionId);
    resetBootstrapCache();
  });

  // Strip prior-turn search context messages so only the latest reaches the
  // LLM, and strip the display-only memory-context block entirely (it exists
  // purely for the renderer; the static memory it mirrors is already in the
  // system prompt).
  pi.on('context', async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const custom = message as unknown as Record<string, unknown>;
        return custom.customType !== SEARCH_CONTEXT_TYPE
          && custom.customType !== MEMORY_CONTEXT_DISPLAY_TYPE;
      }),
    };
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    clearPriorityContextCache(sessionId);
    clearMemoryPromptDebugState(sessionId);
    clearPhase1MigrationState(sessionId);
    await flushPendingStats();
  });

  pi.on('agent_start', async (_event, ctx) => {
    logMemoryPromptAgentStart(ctx.sessionManager.getSessionId(), ctx.getSystemPrompt());
  });

  pi.on('before_agent_start', async (event, ctx) => {
    try {
      const status = await getCachedBootstrapStatus();
      const sessionId = ctx.sessionManager.getSessionId();
      const autoRetrieveMode = getAutoRetrieveModeSync();

      let addition = '';
      let contextBlock = '';
      let memoryInstructions = '';
      let searchContext = '';
      let needsBootstrap = status.needsBootstrap;

      if (needsBootstrap) {
        addition = buildBootstrapInstructions(status.existingUserContent);
      } else {
        const phase1State = getPhase1MigrationState(sessionId);
        if (!phase1State?.checked) {
          const migration = await runPhase1Migration(ctx);
          setPhase1MigrationState(sessionId, migration.changed);
          info('before_agent_start_migration', {
            changed: migration.changed,
            notes: migration.notes,
          });
          if (migration.changed && isQmdAvailable()) {
            await runQmdUpdateNow();
            info('before_agent_start_qmd_update', { reason: 'migration_changed' });
          }
          cachedStatus = null;
        }

        const refreshedStatus = await getCachedBootstrapStatus();
        needsBootstrap = refreshedStatus.needsBootstrap;
        if (needsBootstrap) {
          addition = buildBootstrapInstructions(refreshedStatus.existingUserContent);
        } else {
          const turn = await buildTurnContext(event.prompt ?? '', sessionId, autoRetrieveMode);
          addition = turn.systemPromptAddition;
          contextBlock = turn.contextBlock;
          memoryInstructions = turn.memoryInstructions;
          searchContext = turn.searchContext;
        }
      }

      if (!needsBootstrap && !addition) {
        const turn = await buildTurnContext(event.prompt ?? '', sessionId, autoRetrieveMode);
        addition = turn.systemPromptAddition;
        contextBlock = turn.contextBlock;
        memoryInstructions = turn.memoryInstructions;
        searchContext = turn.searchContext;
      }

      logMemoryPromptBeforeAgentStart({
        sessionId,
        prompt: event.prompt ?? '',
        incomingSystemPrompt: event.systemPrompt,
        contextBlock,
        memoryInstructions,
        addition,
        needsBootstrap,
        snapshotMode: getMemorySnapshotModeSync(),
        qmdAvailable: isQmdAvailable(),
        skipSearch: process.env.SERO_MEMORY_NO_SEARCH === '1',
      });

      info('before_agent_start', {
        needsBootstrap,
        snapshotMode: getMemorySnapshotModeSync(),
        autoRetrieve: autoRetrieveMode,
        promptChars: event.prompt?.length ?? 0,
        contextChars: contextBlock.length,
        searchChars: searchContext.length,
        additionChars: addition.length,
      });

      // Inject QMD search results as a per-turn message when auto-retrieve is on.
      // The `context` event filter strips these from prior turns so only the
      // latest search results reach the LLM.
      if (searchContext.trim() && autoRetrieveMode === 'on') {
        try {
          pi.sendMessage(
            { customType: SEARCH_CONTEXT_TYPE, content: searchContext.trim(), display: false },
            { triggerTurn: false },
          );
        } catch {
          // Non-fatal — search results are supplementary context, not critical.
        }
      }

      // Mirror the combined context (static memory + search results) to the
      // renderer as a display-only message. The `context` hook strips this
      // before it reaches the LLM, so it adds no tokens — it just lets the
      // MemoryBlocksToggle surface exactly what contributed to this turn.
      if (contextBlock.trim()) {
        try {
          // Awaited so the message lands before the assistant turn's
          // message_start — the renderer stashes it as pending memory context
          // and attaches it to the next assistant message, so ordering matters.
          await pi.sendMessage(
            { customType: MEMORY_CONTEXT_DISPLAY_TYPE, content: contextBlock.trim(), display: false },
            { triggerTurn: false },
          );
        } catch {
          // Non-fatal — the display block is informational, not critical.
        }
      }

      if (!addition.trim()) return;
      return { systemPrompt: event.systemPrompt + addition };
    } catch (err) {
      error('before_agent_start_failed', errorDetails(err));
      throw err;
    }
  });
}
