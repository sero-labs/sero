/**
 * ContextInjector — injects memory files into the system prompt.
 *
 * Hooks into `before_agent_start` so that MEMORY.md, IDENTITY.md,
 * and USER.md are available to the agent at the start of every turn.
 *
 * On first run (no MEMORY.md), injects bootstrap instructions that
 * tell the agent to use the `questionnaire` tool to collect answers,
 * then write results to memory files.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import {
  resolveMemoryRoot,
  getContextFiles,
} from './memory-manager';
import {
  checkBootstrapStatus,
  IDENTITY_QUESTIONS,
  USER_QUESTIONS,
  MEMORY_QUESTIONS,
} from './bootstrap';

// ── Max injection size (tokens are ~4 chars) ───────────────────

const MAX_INJECTION_CHARS = 4000;

// ── Normal mode: build context from existing files ─────────────

async function buildContextBlock(root: string): Promise<string> {
  const files = await getContextFiles(root);
  if (files.length === 0) return '';

  const sections: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    const section = `### ${file.name}\n\n${file.content}`;
    if (totalChars + section.length > MAX_INJECTION_CHARS) {
      const remaining = MAX_INJECTION_CHARS - totalChars;
      if (remaining > 100) {
        const truncated = file.content.slice(0, remaining - 80);
        const target = file.name.replace('.md', '').toLowerCase();
        sections.push(
          `### ${file.name}\n\n${truncated}\n\n_[truncated — use \`sero memory read --target ${target}\` for full content]_`,
        );
      }
      break;
    }
    sections.push(section);
    totalChars += section.length;
  }

  return `\n\n## Memory\n\nThe following memory files are loaded from the global workspace. Use the \`sero-cli\` tool with \`memory\` commands to manage them.\n\n${sections.join('\n\n---\n\n')}`;
}

function getMemoryInstructions(): string {
  return [
    '\n\n**Memory commands:**',
    '- `sero memory write --target memory --content "..."` — save a long-term fact or decision',
    '- `sero memory write --target daily --content "..."` — log something to today\'s daily note',
    '- `sero memory read --target memory|identity|user|daily` — read a memory file',
    '- `sero memory search --query "..."` — search across all memory files',
    '- `sero memory list` — list all memory files',
    '',
    'Proactively save important facts, user preferences, and decisions to memory.',
    'When the user shares something worth remembering, write it to the appropriate target.',
  ].join('\n');
}

// ── Bootstrap mode: questionnaire-driven setup ─────────────────

function buildBootstrapInstructions(existingUserContent: string | null): string {
  const userNote = existingUserContent
    ? `\n\nNote: USER.md already has content:\n\`\`\`\n${existingUserContent}\n\`\`\`\nConfirm this is correct with the user rather than re-asking. Skip the user questionnaire if the content looks good.`
    : '';

  return `
## Memory Setup Required

The memory system is not yet initialised. You MUST set it up now before doing anything else.
Use the \`questionnaire\` tool to ask the user three rounds of questions, then write the answers to memory files.${userNote}

### Step 1: Identity Setup
Call the \`questionnaire\` tool with these questions to configure the agent persona:
${IDENTITY_QUESTIONS}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --mode overwrite --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answer>\\n- **Rules:** <rules answer>"\`

### Step 2: User Profile${existingUserContent ? ' (verify existing)' : ''}
${existingUserContent
    ? 'Ask the user if the existing USER.md content above is correct. If they want changes, ask what to update. Only rewrite if needed.'
    : `Call the \`questionnaire\` tool with these questions:
${USER_QUESTIONS}

After receiving answers, write USER.md:
\`sero memory write --target user --mode overwrite --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role>\\n- **Location:** <location>\\n- **Tech Stack:** <stack>\\n- **Communication:** <communication>"\``
}

### Step 3: Long-term Memory
Call the \`questionnaire\` tool with these questions:
${MEMORY_QUESTIONS}

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
  pi.on('before_agent_start', async (event) => {
    const status = await checkBootstrapStatus();

    let addition: string;
    if (status.needsBootstrap) {
      addition = buildBootstrapInstructions(status.existingUserContent);
    } else {
      const root = resolveMemoryRoot();
      const contextBlock = await buildContextBlock(root);
      addition = contextBlock + getMemoryInstructions();
    }

    if (!addition.trim()) return;

    return {
      systemPrompt: event.systemPrompt + addition,
    };
  });
}
