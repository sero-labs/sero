/**
 * ContextInjector — injects memory context into the system prompt.
 *
 * Priority ordering (8K total budget):
 *   1. IDENTITY.md + USER.md  — persona, never fully dropped
 *   2. Open scratchpad items  — active work context
 *   3. QMD search results     — auto-retrieved relevant memories
 *   4. MEMORY.md              — curated long-term memory
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import {
  resolveMemoryRoot,
  readFile,
  getIdentityPath,
  getMemoryPath,
  getScratchpadPath,
  getTargetUsage,
  getUserPath,
  statFile,
} from './memory-manager';
import {
  checkBootstrapStatus,
  IDENTITY_QUESTIONS,
  MEMORY_QUESTIONS,
  USER_QUESTIONS,
} from './bootstrap';
import type { BootstrapStatus } from './bootstrap';
import { formatScratchpadForInjection, getOpenScratchpadItems } from './scratchpad';
import { isQmdAvailable, runQmdUpdateNow, searchRelevantMemories } from './qmd';
import { formatRankedResults } from './retrieval';
import {
  buildFingerprint,
  clearCache,
  consumeCache,
  mergeCachedResults,
  storeTurnResults,
} from './prefetch';
import {
  formatMemoryEntry,
  formatShortTimestamp,
  HIGH_PRIORITY_TYPES,
  LOW_PRIORITY_TYPES,
  parseMemoryEntries,
  renderMemoryForRead,
  stripEntryIdComments,
  stripManagedFileMetadata,
  type MemoryEntry,
} from './memory-format';
import { error, errorDetails, info } from './logger';
import { runPhase1Migration } from './migration';
import { flushPendingStats, recordHits, sortByScore } from './memory-scoring';
import { getMemoryInstructions } from './memory-instructions';

const BUDGET_IDENTITY = 1_000;
const BUDGET_USER = 1_000;
const BUDGET_SCRATCHPAD = 1_500;
const BUDGET_SEARCH = 2_500;
const BUDGET_MEMORY = 1_600;
const BUDGET_TOTAL = 7_600;

let cachedStatus: BootstrapStatus | null = null;
let migrationChecked = false;

async function getCachedBootstrapStatus(): Promise<BootstrapStatus> {
  if (!cachedStatus) cachedStatus = await checkBootstrapStatus();
  return cachedStatus;
}

export function resetBootstrapCache(): void {
  cachedStatus = null;
  migrationChecked = false;
}

export function markBootstrapDone(): void {
  cachedStatus = { needsBootstrap: false, existingUserContent: null };
}

function truncateStart(text: string, maxChars: number): { text: string; notice: string } {
  if (text.length <= maxChars) return { text, notice: '' };
  const notice = `_[truncated: showing ${Math.min(maxChars, text.length)} of ${text.length} chars]_`;
  return { text: text.slice(0, maxChars), notice };
}

/**
 * Type-aware + score-aware truncation for MEMORY.md (§3.2, §3.3).
 * Preserves [decision], [preference], [question] entries first;
 * drops [hypothesis] entries before others; cuts [fact]/[lesson] last.
 * Within each bucket, entries are already sorted by recency score.
 */
function truncateMemoryByType(entries: MemoryEntry[], maxChars: number): { text: string; notice: string } {
  // Render all entries without IDs for injection
  const allLines = entries.map((e) => stripEntryIdComments(formatMemoryEntry(e)));
  const fullText = allLines.join('\n');
  if (fullText.length <= maxChars) return { text: fullText, notice: '' };

  // Bucket entries by priority (order within buckets preserved from score sort)
  const high: string[] = [];
  const normal: string[] = [];
  const low: string[] = [];
  for (const entry of entries) {
    const line = stripEntryIdComments(formatMemoryEntry(entry));
    if (HIGH_PRIORITY_TYPES.has(entry.type)) high.push(line);
    else if (LOW_PRIORITY_TYPES.has(entry.type)) low.push(line);
    else normal.push(line);
  }

  // Build output greedily: high → normal → low
  const selected: string[] = [];
  let chars = 0;
  for (const line of [...high, ...normal, ...low]) {
    const nextChars = chars + line.length + (selected.length > 0 ? 1 : 0); // +1 for \n
    if (nextChars > maxChars) break;
    selected.push(line);
    chars = nextChars;
  }

  const dropped = entries.length - selected.length;
  const notice = dropped > 0
    ? `_[type-prioritised truncation: showing ${selected.length} of ${entries.length} entries]_`
    : '';
  return { text: selected.join('\n'), notice };
}

function truncateMiddle(text: string, maxChars: number): { text: string; notice: string } {
  if (text.length <= maxChars) return { text, notice: '' };
  const marker = '\n\n... (truncated) ...\n\n';
  const keep = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return {
    text: text.slice(0, head) + marker + text.slice(text.length - tail),
    notice: `_[middle-truncated: showing ${Math.min(maxChars, text.length)} of ${text.length} chars]_`,
  };
}

async function buildManagedBlock(options: {
  label: string;
  path: string;
  target: 'memory' | 'identity' | 'user' | 'scratchpad';
  visibleContent: string;
  usageContent?: string;
  budget: number;
  truncateMode: 'start' | 'middle';
  entryCount?: number;
}): Promise<string> {
  const stat = await statFile(options.path);
  const usage = getTargetUsage(options.target, options.usageContent ?? options.visibleContent);
  const updated = stat ? formatShortTimestamp(stat.mtime) : 'unknown';
  const entrySuffix = options.entryCount != null ? ` (${options.entryCount} entries)` : '';
  const header = `### ${options.label} [${usage.percent}% — ${usage.chars}/${usage.max} chars] (updated: ${updated})${entrySuffix}`;
  const truncated = options.truncateMode === 'middle'
    ? truncateMiddle(options.visibleContent.trim(), options.budget)
    : truncateStart(options.visibleContent.trim(), options.budget);

  const parts = [header];
  if (truncated.notice) parts.push('', truncated.notice);
  if (truncated.text.trim()) parts.push('', truncated.text.trim());
  return parts.join('\n');
}

/** @internal Exported for testing. */
export async function buildPriorityContext(root: string, prompt: string, sessionId?: string): Promise<string> {
  const sections: string[] = [];
  let totalChars = 0;

  function addSection(section: string): void {
    if (!section.trim()) return;
    if (totalChars + section.length > BUDGET_TOTAL) return;
    sections.push(section);
    totalChars += section.length;
  }

  const identityPath = getIdentityPath(root);
  const identityContent = await readFile(identityPath);
  if (identityContent?.trim()) {
    addSection(await buildManagedBlock({
      label: 'IDENTITY.md',
      path: identityPath,
      target: 'identity',
      visibleContent: stripManagedFileMetadata(identityContent),
      budget: BUDGET_IDENTITY,
      truncateMode: 'start',
    }));
  }

  const userPath = getUserPath(root);
  const userContent = await readFile(userPath);
  if (userContent?.trim()) {
    addSection(await buildManagedBlock({
      label: 'USER.md',
      path: userPath,
      target: 'user',
      visibleContent: stripManagedFileMetadata(userContent),
      budget: BUDGET_USER,
      truncateMode: 'start',
    }));
  }

  const openScratchpadItems = await getOpenScratchpadItems();
  if (openScratchpadItems.length > 0) {
    const scratchpadPath = getScratchpadPath(root);
    const scratchpadContent = await readFile(scratchpadPath);
    if (scratchpadContent?.trim()) {
      addSection(await buildManagedBlock({
        label: 'SCRATCHPAD.md',
        path: scratchpadPath,
        target: 'scratchpad',
        visibleContent: formatScratchpadForInjection(openScratchpadItems),
        usageContent: scratchpadContent,
        budget: BUDGET_SCRATCHPAD,
        truncateMode: 'start',
        entryCount: openScratchpadItems.length,
      }));
    }
  }

  const skipSearch = process.env.SERO_MEMORY_NO_SEARCH === '1';
  if (!skipSearch && isQmdAvailable() && prompt) {
    const { formatted, results: freshResults } = await searchRelevantMemories(prompt);
    const currentFingerprint = buildFingerprint(prompt);

    // Merge with cache from previous turn if topic overlaps (§2.2)
    let mergedFormatted = formatted;
    if (sessionId) {
      const cached = consumeCache(sessionId);
      if (cached && freshResults.length > 0) {
        const merged = mergeCachedResults(freshResults, cached, currentFingerprint, 3);
        if (merged.length > freshResults.length) {
          mergedFormatted = formatRankedResults(merged);
        }
      }
      // Store this turn's results for the next turn
      if (freshResults.length > 0) {
        storeTurnResults(sessionId, prompt, freshResults, currentFingerprint);
      }
    }

    if (mergedFormatted.trim()) {
      const truncated = truncateStart(`## Relevant memories (auto-retrieved)\n\n${mergedFormatted}`, BUDGET_SEARCH);
      addSection([truncated.text, truncated.notice ? `\n\n${truncated.notice}` : ''].join('').trim());

      // Record hits for memory entries found in search results (§3.3)
      const memoryHitIds = freshResults
        .flatMap((r) => {
          const text = r.content?.toString() ?? '';
          const ids: string[] = [];
          const regex = /<!-- id: (mem-[a-f0-9]+) -->/gi;
          let match;
          while ((match = regex.exec(text)) !== null) ids.push(match[1]!);
          return ids;
        });
      if (memoryHitIds.length > 0) {
        recordHits(memoryHitIds).catch(() => {});
      }
    }
  }

  const memoryPath = getMemoryPath(root);
  const memoryContent = await readFile(memoryPath);
  if (memoryContent?.trim()) {
    const memoryEntries = parseMemoryEntries(memoryContent);
    if (memoryEntries.length > 0) {
      // Sort by recency score before type-aware truncation (§3.3)
      const scoredEntries = await sortByScore(memoryEntries);
      const truncated = truncateMemoryByType(scoredEntries, BUDGET_MEMORY);
      const stat = await statFile(memoryPath);
      const usage = getTargetUsage('memory', memoryContent);
      const updated = stat ? formatShortTimestamp(stat.mtime) : 'unknown';
      const header = `### MEMORY.md [${usage.percent}% — ${usage.chars}/${usage.max} chars] (updated: ${updated}) (${memoryEntries.length} entries)`;
      const parts = [header];
      if (truncated.notice) parts.push('', truncated.notice);
      if (truncated.text.trim()) parts.push('', truncated.text.trim());
      addSection(parts.join('\n'));
    } else {
      addSection(await buildManagedBlock({
        label: 'MEMORY.md',
        path: memoryPath,
        target: 'memory',
        visibleContent: renderMemoryForRead(memoryContent, false),
        budget: BUDGET_MEMORY,
        truncateMode: 'middle',
        entryCount: 0,
      }));
    }
  }

  if (sections.length === 0) return '';
  return `\n\n## Memory\n\n${sections.join('\n\n---\n\n')}`;
}

// Memory instructions (getMemoryInstructions) are in memory-instructions.ts

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

The questionnaire UI supports step-based multiple-choice forms, including multi-select questions. For any question that already includes predefined \`options\`, preserve those options exactly so the user gets clickable choices. Do NOT rewrite option-based questions into free-form chat. Only rely on custom text when none of the provided options fit.

### Step 1: Identity Setup
YOU MUST call the \`questionnaire\` tool with the exact JSON parameters below to configure the agent persona. Preserve every \`options\`, \`label\`, \`description\`, \`exclusive\`, \`multiSelect\`, and \`allowOther\` field exactly as shown:
${identityJson}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --mode overwrite --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answers joined with commas if multiple>\\n- **Rules:** <rules answers joined with commas if multiple>"\`

### Step 2: User Profile setup
YOU MUST call the \`questionnaire\` tool again with the exact JSON parameters below to configure the user profile. Keep the predefined options intact so the user can tap through the multiple-choice UI where applicable:
${userJson}

After receiving answers, write USER.md:
\`sero memory write --target user --mode overwrite --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role answers joined with commas if multiple>\\n- **Location:** <location>\\n- **Tech Stack:** <stack answers joined with commas if multiple>\\n- **Communication:** <communication answers joined with commas if multiple>"\`

### Step 3: Long-term Memory
YOU MUST call the \`questionnaire\` tool again with the exact JSON parameters below. Keep the option lists intact instead of converting these prompts into open-ended chat questions:
${memoryJson}

After receiving answers, write MEMORY.md:
\`sero memory write --target memory --mode overwrite --content "# Memory\\n\\n## Technical Knowledge\\n\\n<tech_knowledge answers — use short bullet lines if multiple>\\n\\n## Coding Preferences\\n\\n<coding_prefs answers — use short bullet lines if multiple>\\n\\n## Active Projects\\n\\n<projects answer>"\`

### Important
- Run each questionnaire step in order — don't skip steps.
- Use the exact tool parameters shown above.
- Prefer the predefined multiple-choice options whenever they fit; \`allowOther\` is only the fallback for custom answers.
- For any \`multiSelect\` question, preserve all selected human-readable answers when writing the memory files.
- When writing the memory files, use the human-readable answer text the user selected or typed.
- After writing all three files, confirm to the user that memory is set up.
- Be friendly and natural between steps — this is a first-time experience.`;
}

export function registerContextInjection(pi: ExtensionAPI): void {
  pi.on('session_start', () => {
    info('bootstrap_cache_reset', { source: 'session_start' });
    resetBootstrapCache();
  });

  pi.on('session_switch', () => {
    info('bootstrap_cache_reset', { source: 'session_switch' });
    resetBootstrapCache();
  });

  pi.on('context', async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const custom = message as unknown as Record<string, unknown>;
        return custom.customType !== 'memory-context';
      }),
    };
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    clearCache(ctx.sessionManager.getSessionId());
    await flushPendingStats();
  });

  pi.on('before_agent_start', async (event, ctx) => {
    try {
      const status = await getCachedBootstrapStatus();
      const sessionId = ctx.sessionManager.getSessionId();

      let addition = '';
      let contextBlock = '';
      if (status.needsBootstrap) {
        addition = buildBootstrapInstructions(status.existingUserContent);
      } else {
        if (!migrationChecked) {
          const migration = await runPhase1Migration(ctx);
          migrationChecked = true;
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
        if (refreshedStatus.needsBootstrap) {
          addition = buildBootstrapInstructions(refreshedStatus.existingUserContent);
        } else {
          const root = resolveMemoryRoot();
          contextBlock = await buildPriorityContext(root, event.prompt ?? '', sessionId);
          addition = contextBlock + getMemoryInstructions();
        }
      }

      if (!status.needsBootstrap && !addition) {
        const root = resolveMemoryRoot();
        contextBlock = await buildPriorityContext(root, event.prompt ?? '', sessionId);
        addition = contextBlock + getMemoryInstructions();
      }

      info('before_agent_start', {
        needsBootstrap: status.needsBootstrap,
        promptChars: event.prompt?.length ?? 0,
        contextChars: contextBlock.length,
        additionChars: addition.length,
      });

      if (contextBlock.trim()) {
        try {
          pi.sendMessage(
            { customType: 'memory-context', content: contextBlock.trim(), display: false },
            { triggerTurn: false },
          );
        } catch {
          // Non-fatal — the same content is already injected into the system prompt.
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
