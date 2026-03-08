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

// ── Budget constants ───────────────────────────────────────────

const BUDGET_IDENTITY_USER = 2_000;
const BUDGET_SCRATCHPAD    = 1_500;
const BUDGET_SEARCH        = 2_500;
const BUDGET_MEMORY        = 2_000;
const BUDGET_TOTAL         = 8_000;

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
  const searchLine = isQmdAvailable()
    ? '- `sero memory_search --query "..." [--mode keyword|semantic|deep]` — semantic search across all memory files'
    : '';

  return [
    '\n\n**Memory commands:**',
    '- `sero memory write --target memory --content "..."` — save a long-term fact or decision',
    '- `sero memory write --target daily --content "..."` — log something to today\'s daily note',
    '- `sero memory read --target memory|identity|user|daily` — read a memory file',
    '- `sero memory search --query "..."` — grep search across memory files',
    searchLine,
    '- `sero scratchpad add "..."` — add item to scratchpad checklist',
    '- `sero memory list` — list all memory files',
    '',
    'Use #tags (e.g. #decision, #preference) and [[links]] (e.g. [[auth-strategy]]) in memory content to improve search recall.',
    'Proactively save important facts, user preferences, and decisions to memory.',
    'When the user shares something worth remembering, write it to the appropriate target.',
  ].filter(Boolean).join('\n');
}

// ── Bootstrap mode ─────────────────────────────────────────────

function buildBootstrapInstructions(existingUserContent: string | null): string {
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
Call the \`questionnaire\` tool with these questions to configure the agent persona:
${identityJson}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --mode overwrite --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answer>\\n- **Rules:** <rules answer>"\`

### Step 2: User Profile${existingUserContent ? ' (verify existing)' : ''}
${existingUserContent
    ? 'Ask the user if the existing USER.md content above is correct. If they want changes, ask what to update. Only rewrite if needed.'
    : `Call the \`questionnaire\` tool with these questions:
${userJson}

After receiving answers, write USER.md:
\`sero memory write --target user --mode overwrite --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role>\\n- **Location:** <location>\\n- **Tech Stack:** <stack>\\n- **Communication:** <communication>"\``
}

### Step 3: Long-term Memory
Call the \`questionnaire\` tool with these questions:
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

  pi.on('before_agent_start', async (event) => {
    const status = await getCachedBootstrapStatus();

    let addition: string;
    if (status.needsBootstrap) {
      addition = buildBootstrapInstructions(status.existingUserContent);
    } else {
      const root = resolveMemoryRoot();
      const contextBlock = await buildPriorityContext(root, event.prompt ?? '');
      addition = contextBlock + getMemoryInstructions();
    }

    if (!addition.trim()) return;

    return {
      systemPrompt: event.systemPrompt + addition,
    };
  });
}
