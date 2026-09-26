/**
 * ContextInjector — adds memory to the agent's system prompt.
 *
 * The addition is IDENTITY.md + USER.md + MEMORY.md, the memory instructions,
 * and caveman instructions when USER.md turns caveman mode on. The memory
 * files are captured once per session, so the addition is byte-identical
 * across turns and provider prompt caching keeps hitting.
 *
 * Before setup is done, the addition is the onboarding instructions instead.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  checkBootstrapStatus,
  IDENTITY_QUESTIONS,
  USER_QUESTIONS,
} from './bootstrap';
import type { BootstrapStatus } from './bootstrap';
import { getUserPath, readFile, resolveMemoryRoot } from './memory-manager';
import { buildPriorityContext, clearPriorityContextCache } from './priority-context';
import { getCavemanPromptAddition } from './caveman';
import { getMemoryInstructions } from './memory-instructions';

/**
 * Custom message types that older versions of this plugin stored in session
 * files: per-turn search results and a display-only copy of the memory
 * context. They are filtered out so a resumed session does not send them to
 * the model.
 */
const LEGACY_MESSAGE_TYPES = new Set(['memory-search-context', 'memory-context']);

let cachedStatus: BootstrapStatus | null = null;

/**
 * Only a finished setup is cached. Until then every turn re-checks the files,
 * so a setup turn that is aborted or ends early cannot leave the onboarding
 * instructions in place once the files exist.
 */
async function getCachedBootstrapStatus(): Promise<BootstrapStatus> {
  if (cachedStatus) return cachedStatus;
  const status = await checkBootstrapStatus();
  if (!status.needsBootstrap) cachedStatus = status;
  return status;
}

export function resetBootstrapCache(): void {
  cachedStatus = null;
}

function formatToolParamsJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function buildBootstrapInstructions(existingUserContent: string | null): string {
  const identityJson = formatToolParamsJson(IDENTITY_QUESTIONS);
  const userJson = formatToolParamsJson(USER_QUESTIONS);

  const userNote = existingUserContent
    ? `\n\nNote: USER.md already has content:\n\`\`\`\n${existingUserContent}\n\`\`\`\nConfirm this is correct with the user rather than re-asking. Skip the user questionnaire if the content looks good.`
    : '';

  return `
## Memory Setup Required

The memory system is not yet initialised. You MUST set it up now before doing anything else.
Use the \`questionnaire\` tool to ask the user two rounds of questions, then write the answers to memory files.${userNote}

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

### Important
- Run each questionnaire step in order — don't skip steps.
- Use the exact tool parameters shown above.
- Prefer the predefined multiple-choice options whenever they fit; \`allowOther\` is only the fallback for custom answers.
- For any \`multiSelect\` question, preserve all selected human-readable answers when writing the memory files.
- When writing the memory files, use the human-readable answer text the user selected or typed.
- After writing both files, confirm to the user that memory is set up.
- Be friendly and natural between steps — this is a first-time experience.`;
}

async function buildMemoryAddition(sessionId: string): Promise<string> {
  const root = resolveMemoryRoot();
  const staticContext = await buildPriorityContext(root, sessionId);
  const userContent = await readFile(getUserPath(root));
  return staticContext + getMemoryInstructions() + getCavemanPromptAddition(userContent ?? staticContext);
}

export function registerContextInjection(pi: ExtensionAPI): void {
  pi.on('session_start', (_event, ctx) => {
    clearPriorityContextCache(ctx.sessionManager.getSessionId());
    resetBootstrapCache();
  });

  pi.on('context', async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const custom = message as unknown as Record<string, unknown>;
        return typeof custom.customType !== 'string' || !LEGACY_MESSAGE_TYPES.has(custom.customType);
      }),
    };
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    clearPriorityContextCache(ctx.sessionManager.getSessionId());
    resetBootstrapCache();
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const status = await getCachedBootstrapStatus();
    const addition = status.needsBootstrap
      ? buildBootstrapInstructions(status.existingUserContent)
      : await buildMemoryAddition(ctx.sessionManager.getSessionId());

    if (!addition.trim()) return;
    return { systemPrompt: event.systemPrompt + addition };
  });
}
