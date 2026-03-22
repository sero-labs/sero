/**
 * ContextInjector — injects memory context into the system prompt.
 *
 * Priority ordering (8K total budget):
 *   1. IDENTITY.md + USER.md      (2.0K) — persona, never truncated
 *   2. Open scratchpad items      (1.5K) — active work context
 *   3. QMD search results         (2.5K) — auto-retrieved relevant memories
 *   4. MEMORY.md (long-term)      (2.0K) — curated facts, middle-truncated
 *
 * Daily logs are NOT injected directly — they're surfaced through
 * selective injection (priority 3) when relevant to the current prompt.
 *
 * On first run (no MEMORY.md), injects bootstrap instructions instead.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import {
  resolveMemoryRoot,
  readFile,
  getMemoryPath,
  getIdentityPath,
  getUserPath,
} from './memory-manager';
import {
  checkBootstrapStatus,
  IDENTITY_QUESTIONS,
  USER_QUESTIONS,
  MEMORY_QUESTIONS,
} from './bootstrap';
import type { BootstrapStatus } from './bootstrap';
import { getOpenScratchpadItems, formatScratchpadForInjection } from './scratchpad';
import { searchRelevantMemories, isQmdAvailable } from './qmd';

// ── Budget constants (character limits, ~4 chars per token) ────

const BUDGET_IDENTITY_USER = 2_000; // ~500 tokens
const BUDGET_SCRATCHPAD    = 1_500; // ~375 tokens
const BUDGET_SEARCH        = 2_500; // ~625 tokens
const BUDGET_MEMORY        = 1_200; // ~300 tokens — rely on selective search for deeper recall
const BUDGET_TOTAL         = 7_200; // ~1.8K tokens — safety cap

// ── Bootstrap status cache ─────────────────────────────────────

let cachedStatus: BootstrapStatus | null = null;

async function getCachedBootstrapStatus(): Promise<BootstrapStatus> {
  if (!cachedStatus) {
    cachedStatus = await checkBootstrapStatus();
  }
  return cachedStatus;
}

export function resetBootstrapCache(): void {
  cachedStatus = null;
}

export function markBootstrapDone(): void {
  cachedStatus = { needsBootstrap: false, existingUserContent: null };
}

// ── Truncation helpers ─────────────────────────────────────────

function truncateStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 30) + '\n\n_[truncated]_';
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = '\n\n... (truncated) ...\n\n';
  const keep = maxChars - marker.length;
  if (keep <= 0) return text.slice(0, maxChars);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return text.slice(0, head) + marker + text.slice(text.length - tail);
}

// ── Build normal-mode context ──────────────────────────────────

async function buildPriorityContext(
  root: string,
  prompt: string,
): Promise<string> {
  const sections: string[] = [];
  let totalChars = 0;

  function addSection(content: string): boolean {
    if (!content.trim()) return false;
    if (totalChars + content.length > BUDGET_TOTAL) return false;
    sections.push(content);
    totalChars += content.length;
    return true;
  }

  // Priority 1: IDENTITY.md + USER.md (combined budget)
  const identityContent = await readFile(getIdentityPath(root));
  const userContent = await readFile(getUserPath(root));
  const identityParts: string[] = [];
  if (identityContent?.trim()) identityParts.push(`### IDENTITY.md\n\n${identityContent.trim()}`);
  if (userContent?.trim()) identityParts.push(`### USER.md\n\n${userContent.trim()}`);
  if (identityParts.length > 0) {
    addSection(truncateStart(identityParts.join('\n\n---\n\n'), BUDGET_IDENTITY_USER));
  }

  // Priority 2: Open scratchpad items
  const openItems = await getOpenScratchpadItems();
  if (openItems.length > 0) {
    const scratchpadBlock = formatScratchpadForInjection(openItems);
    addSection(truncateStart(scratchpadBlock, BUDGET_SCRATCHPAD));
  }

  // Priority 3: QMD selective injection (search results)
  const skipSearch = process.env.SERO_MEMORY_NO_SEARCH === '1';
  if (!skipSearch && isQmdAvailable() && prompt) {
    const searchResults = await searchRelevantMemories(prompt);
    if (searchResults.trim()) {
      const searchBlock = `## Relevant memories (auto-retrieved)\n\n${searchResults}`;
      addSection(truncateStart(searchBlock, BUDGET_SEARCH));
    }
  }

  // Priority 4: MEMORY.md (long-term)
  const memoryContent = await readFile(getMemoryPath(root));
  if (memoryContent?.trim()) {
    const memoryBlock = `## MEMORY.md (long-term)\n\n${memoryContent.trim()}`;
    addSection(truncateMiddle(memoryBlock, BUDGET_MEMORY));
  }

  if (sections.length === 0) return '';
  return `\n\n## Memory\n\n${sections.join('\n\n---\n\n')}`;
}

function getMemoryInstructions(): string {
  const root = resolveMemoryRoot();
  const searchLine = isQmdAvailable()
    ? '- `sero memory_search --query "..." [--mode keyword|semantic|deep]` — search past memory when you need more context'
    : '';

  return [
    `\n\n## Memory System`,
    '',
    `All memory files live in \`${root}\`. Only read or write memory files inside that directory.`,
    '',
    'Use these commands when needed:',
    '- `sero memory read --target memory|identity|user|daily`',
    '- `sero memory write --target memory|daily|user --content "..."`',
    '- `sero memory search --query "..."`',
    searchLine,
    '- `sero scratchpad add|done "..."`',
    '',
    'Save proactively but keep it lean:',
    '- Save durable preferences, decisions, project facts, and corrections to `memory`',
    '- Save session-specific progress, blockers, and follow-ups to `daily`',
    '- Search before writing so you update existing memory instead of duplicating it',
    '- Keep entries concise; use the `write` tool directly for multi-line content',
  ].filter(Boolean).join('\n');
}

// ── Bootstrap mode ─────────────────────────────────────────────

function buildBootstrapInstructions(existingUserContent: string | null): string {
  const root = resolveMemoryRoot();
  const identityJson = JSON.stringify(IDENTITY_QUESTIONS, null, 2);
  const userJson = JSON.stringify(USER_QUESTIONS, null, 2);
  const memoryJson = JSON.stringify(MEMORY_QUESTIONS, null, 2);

  const userNote = existingUserContent
    ? `\n\nNote: USER.md already has content:\n\`\`\`\n${existingUserContent}\n\`\`\`\nConfirm this is correct with the user rather than re-asking. Skip the user questionnaire if the content looks good.`
    : '';

  return `
## Memory Setup Required

The memory system is not yet initialised. You MUST set it up now before doing anything else.
Use the \`questionnaire\` tool to ask the user three rounds of questions, then write the answers to memory files.${userNote}

### Step 1: Identity Setup
YOU MUST Call the \`questionnaire\` tool with these questions to configure the agent persona:
${identityJson}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --mode overwrite --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answer>\\n- **Rules:** <rules answer>"\`

### Step 2: User Profile setup
YOU MUST Call the \`questionnaire\` tool again with these questions to configure the user profile:
${userJson}

After receiving answers, write USER.md:
\`sero memory write --target user --mode overwrite --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role>\\n- **Location:** <location>\\n- **Tech Stack:** <stack>\\n- **Communication:** <communication>"\`


### Step 3: Long-term Memory
YOU MUST Call the \`questionnaire\` tool again with these questions:
${memoryJson}

After receiving answers, write MEMORY.md:
\`sero memory write --target memory --mode overwrite --content "# Memory\\n\\n## Technical Knowledge\\n\\n<tech_knowledge>\\n\\n## Coding Preferences\\n\\n<coding_prefs>\\n\\n## Active Projects\\n\\n<projects>"\`

### Important
- Run each questionnaire step in order — don't skip steps.
- Use the exact tool calls shown above.
- After writing all three files, confirm to the user that memory is set up.
- Be friendly and natural between steps — this is a first-time experience.`;
}

// ── Register hooks ─────────────────────────────────────────────

export function registerContextInjection(pi: ExtensionAPI): void {
  pi.on('session_start', () => {
    resetBootstrapCache();
  });

  // Keep the hidden memory-context message for UI/debug visibility, but
  // strip it from outgoing model context because the same content is already
  // injected into the system prompt.
  pi.on('context', async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const msg = message as unknown as Record<string, unknown>;
        return msg.customType !== 'memory-context';
      }),
    };
  });

  pi.on('before_agent_start', async (event) => {
    const status = await getCachedBootstrapStatus();

    let addition: string;
    let contextBlock = '';
    if (status.needsBootstrap) {
      addition = buildBootstrapInstructions(status.existingUserContent);
    } else {
      const root = resolveMemoryRoot();
      contextBlock = await buildPriorityContext(root, event.prompt ?? '');
      addition = contextBlock + getMemoryInstructions();
    }

    // Send the memory context as a custom message so the host can
    // intercept it and display it in the ChatPanel.
    if (contextBlock.trim()) {
      try {
        pi.sendMessage(
          { customType: 'memory-context', content: contextBlock.trim(), display: false },
          { triggerTurn: false },
        );
      } catch {
        // Non-fatal — context is already in the system prompt
      }
    }

    if (!addition.trim()) return;

    return {
      systemPrompt: event.systemPrompt + addition,
    };
  });
}
