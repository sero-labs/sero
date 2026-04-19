import type { Card, ReviewMode } from '@sero/common';

interface LightReviewRepairPromptOptions {
  reviewMode?: ReviewMode;
}

export function buildLightReviewRepairPrompt(
  card: Pick<Card, 'id' | 'title' | 'description' | 'acceptance'>,
  failure: string,
  options?: LightReviewRepairPromptOptions,
): string {
  const lightModeBlock = options?.reviewMode === 'light'
    ? '\n## Prototype Delivery Mode\nPrototype light mode is active.\n- Fix only what is required for the smoke checks to pass\n- Prefer the smallest safe change over broad cleanup\n- Do NOT do browser automation unless the reported failure specifically requires it\n'
    : '';
  const acceptanceBlock = card.acceptance.length > 0
    ? `\n## Acceptance Goals\n${card.acceptance.map((criterion) => `- ${criterion}`).join('\n')}\n`
    : '';

  return `You are fixing a prototype light-review failure for a kanban card.

# Card
- Card #${card.id}: ${card.title}
${card.description ? `- Description: ${card.description}\n` : ''}${acceptanceBlock}${lightModeBlock}
## Failure To Fix
\`\`\`
${failure.trim()}
\`\`\`

## Instructions
- Fix only the issue(s) needed for the compile/dev-server smoke checks to pass
- Preserve the intended feature behaviour while keeping scope narrow
- Run the minimum relevant command(s) to confirm the reported failure is fixed
- Do not do broad refactors, polish passes, or exhaustive manual testing
- Do not read from or rely on \`.sero/\` files or other kanban card worktrees
- Do not run \`git commit\`, \`git push\`, or PR commands; the host will handle git state
- When finished, briefly summarize the root cause and what you changed`;
}
