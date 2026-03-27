import type { Card, ReviewMode } from '../core/types';

interface ConflictResolutionPromptOptions {
  reviewMode?: ReviewMode;
}

export function buildConflictResolutionPrompt(
  card: Pick<Card, 'id' | 'title' | 'description' | 'acceptance'>,
  baseBranch: string,
  conflictFiles: string[],
  options?: ConflictResolutionPromptOptions,
): string {
  const lightModeBlock = options?.reviewMode === 'light'
    ? '\n## Prototype Delivery Mode\nLight prototype mode is active. Resolve only what is required to get the prototype working again.\n- Prefer the smallest safe edit that preserves the card intent\n- Do NOT do broad browser automation or exhaustive interaction testing\n- Leave non-blocking polish for later\n'
    : '';
  const descriptionBlock = card.description ? `- Description: ${card.description}\n` : '';
  const acceptanceBlock = card.acceptance?.length
    ? `- Acceptance: ${card.acceptance.join('; ')}\n`
    : '';

  return `You are resolving git rebase conflicts for a kanban card before review/PR creation.

# Card
- Card #${card.id}: ${card.title}
${descriptionBlock}${acceptanceBlock}
## Rebase Context
- The branch is being rebased onto the latest \`${baseBranch}\`
- Resolve the conflicts so the card still delivers its intended behaviour while incorporating upstream changes

## Conflicted Files
${conflictFiles.map((file) => `- ${file}`).join('\n')}
${lightModeBlock}
## Instructions
- Inspect only the conflicted files and any directly related code needed to resolve them correctly
- Remove all git conflict markers and leave each file in a valid final state
- Preserve the card's intended behaviour unless upstream changes make a different integration necessary
- Prefer the smallest coherent resolution; do not broaden scope
- Do not read from or rely on \`.sero/\` files or other kanban card worktrees
- Do not run \`git rebase\`, \`git merge\`, \`git commit\`, or \`git push\`; the host will handle git state after your edits
- If you run checks, keep them narrow and fast
- When finished, briefly summarize the conflicts you resolved and any assumptions you made`;
}
