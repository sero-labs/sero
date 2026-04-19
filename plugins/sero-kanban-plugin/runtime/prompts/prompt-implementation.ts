import type { Card, ReviewMode } from '@sero/common';

export interface ImplementationPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export interface SubtaskPromptOptions extends ImplementationPromptOptions {}

function buildPrototypeDeliveryBlock(reviewMode?: ReviewMode): string {
  if (reviewMode !== 'light') return '';

  return '\n## Prototype Delivery Mode\n'
    + 'Light prototype mode is active. Prioritise a working prototype the user can test quickly.\n'
    + '- Do only the minimum evaluation needed to avoid obvious breakage\n'
    + '- Do NOT use browser automation or exhaustive UI interaction testing unless the user explicitly asked for it\n'
    + '- Leave deeper validation, polish, and broad edge-case hunting for later passes\n';
}

function buildSubtaskChecklist(card: Card): string {
  if (card.subtasks.length === 0) {
    return '- No planner subtasks were provided. Implement the card directly from the plan and acceptance criteria.';
  }

  return card.subtasks.map((subtask) => {
    const dependencies = subtask.dependsOn.length > 0
      ? ` depends on: ${subtask.dependsOn.join(', ')};`
      : '';
    const files = subtask.filePaths?.length
      ? ` files: ${subtask.filePaths.join(', ')};`
      : '';
    const testing = subtask.tddDesignation
      ? ` testing: ${subtask.tddDesignation};`
      : '';
    return `- [${subtask.id}] ${subtask.title}: ${subtask.description}${dependencies}${files}${testing}`;
  }).join('\n');
}

function buildTestingGuidance(testingEnabled: boolean): string {
  if (!testingEnabled) {
    return '\nTesting is disabled for this workspace. Do not add broad automated test coverage in this pass.\n';
  }

  return '\nIf you run validation, prefer one integrated pass near the end instead of repeatedly rechecking each subtask in isolation.\n';
}

export function buildImplementationPrompt(
  card: Card,
  options?: ImplementationPromptOptions,
): string {
  const testingEnabled = options?.testingEnabled !== false;
  const lightModeBlock = buildPrototypeDeliveryBlock(options?.reviewMode);
  const testingGuidance = buildTestingGuidance(testingEnabled);

  return `You are implementing an entire kanban card in one cohesive pass.

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((item) => `- ${item}`).join('\n')}` : ''}
${card.plan ? `\nImplementation Plan:\n${card.plan}` : ''}

## Planned Subtasks
Use these as an execution checklist and sequencing guide. They are NOT separate agent assignments.
${buildSubtaskChecklist(card)}
${testingGuidance}${lightModeBlock}

## Progress Reporting
Whenever you finish one of the planned subtasks, call the \`kanban_mark_subtask_complete\` tool with that subtask's id.
- Call it exactly once per completed subtask
- Only call it after the subtask is actually complete
- Call it immediately, before you start the next planned subtask or move on to another major chunk of work
- If one edit happens to complete multiple subtasks, call the tool separately for each subtask in completion order instead of batching them at the very end
- Delayed or end-of-run batching is incorrect because the kanban UI depends on these updates for live progress
- Do not simulate progress by printing marker text such as \`SUBTASK_COMPLETE\`

Correct pattern:
1. Finish subtask 1.
2. Call \`kanban_mark_subtask_complete\` for subtask 1.
3. Then start subtask 2.

## Instructions
- Implement the card yourself in one coordinated pass
- Use the subtasks to structure your work, but make cohesive edits across the feature instead of treating each subtask as an isolated project
- Do not read from or rely on \`.sero/\` files or other kanban card worktrees; they are orchestration state, not product source files
- Avoid re-reading large parts of the codebase unless you need fresh context for a concrete change
- Keep the implementation aligned with existing project conventions and type safety
- If a scaffolder/init tool refuses to run because the worktree directory is not empty, treat that as expected for git worktrees: scaffold in a temporary directory and describe it as a normal workaround, not as a failure
- Do not run dev servers or other long-running processes during implementation
- When done, briefly summarize the files and subtasks you completed`;
}

export function buildSubtaskPrompt(
  card: Card,
  subtaskId: string,
  options?: SubtaskPromptOptions,
): string {
  const subtask = card.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) throw new Error(`Subtask ${subtaskId} not found on card #${card.id}`);

  const testingEnabled = options?.testingEnabled !== false;

  const completedSubtasks = card.subtasks
    .filter((s) => s.status === 'completed')
    .map((s) => {
      const files = s.filePaths?.length ? ` (files: ${s.filePaths.join(', ')})` : '';
      return `- ✅ ${s.title}: ${s.description}${files}`;
    })
    .join('\n');

  const tddBlock = testingEnabled && subtask.tddDesignation && subtask.tddDesignation !== 'no-test'
    ? `\n## Testing Approach: ${subtask.tddDesignation}\n${subtask.tddDesignation === 'tdd'
      ? 'Write a failing test first, then implement to make it pass.'
      : 'Implement first, then write tests covering the core logic.'}\n`
    : testingEnabled ? '' : '\nNote: Testing is disabled for this workspace — do not write tests.\n';
  const lightModeBlock = buildPrototypeDeliveryBlock(options?.reviewMode);

  const filePathsBlock = subtask.filePaths?.length
    ? `\nExpected file paths: ${subtask.filePaths.join(', ')}\n`
    : '';

  return `You are implementing a specific subtask as part of a larger feature.

# Overall Feature: ${card.title}
${card.description ? `\n${card.description}\n` : ''}
## Implementation Plan
${card.plan ?? '(no plan provided)'}

## Your Subtask
**${subtask.title}**
${subtask.description}
${filePathsBlock}${tddBlock}${lightModeBlock}
${completedSubtasks ? `## Already Completed\n${completedSubtasks}\n` : ''}
## Instructions
- Focus ONLY on this subtask — do not implement other subtasks
- Do not read from or rely on \`.sero/\` files or other kanban card worktrees; they are orchestration state, not product source files
- Write clean, well-typed code following existing project conventions
- Create or modify files as needed for this subtask
- If a scaffolder/init tool refuses to run because the worktree directory is not empty, treat that as expected for git worktrees: scaffold in a temporary directory and describe it as a normal workaround, not as a failure
- Do not run the dev server or start any long-running processes
- When done, provide a brief summary of what you implemented`;
}
