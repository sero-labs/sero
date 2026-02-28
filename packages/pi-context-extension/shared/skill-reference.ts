/**
 * Key excerpts from the context-management SKILL.md for the UI quick reference.
 * These are displayed in a collapsible panel so users can learn the workflow.
 */

export const QUICK_START_LOOP = [
  { step: '1. CHECK', desc: 'Verify state → context_log' },
  { step: '2. START', desc: 'Tag the beginning → context_tag("<task>-start")' },
  { step: '3. WORK', desc: 'Execute steps normally' },
  { step: '4. MILESTONE', desc: 'Tag stable states → context_tag("<task>-plan")' },
  { step: '5. SQUASH', desc: 'Compress noisy history → context_checkout with backupTag' },
] as const;

export const TOOL_REFERENCE = [
  {
    tool: 'context_tag',
    analog: 'git tag',
    purpose: 'Bookmark a stable state',
    when: 'Before risky changes. Before starting a new task.',
  },
  {
    tool: 'context_log',
    analog: 'git log',
    purpose: 'See where you are',
    when: 'When you feel lost. To find IDs for checkout.',
  },
  {
    tool: 'context_checkout',
    analog: 'git reset --soft',
    purpose: 'Time Travel / Squash',
    when: 'To undo mistakes. To compress history.',
  },
] as const;

export const TAG_NAMING = [
  { category: 'Start', pattern: '<task>-start', example: 'auth-jwt-start' },
  { category: 'Plan', pattern: '<task>-plan', example: 'api-v2-plan' },
  { category: 'Milestone', pattern: '<task>-<milestone>', example: 'auth-jwt-impl-done' },
  { category: 'Backup', pattern: '<task>-raw-history', example: 'auth-jwt-raw-history' },
  { category: 'Failure', pattern: '<task>-fail-<reason>', example: 'auth-jwt-fail-timeout' },
] as const;

export const DECISION_MATRIX = [
  { situation: 'Starting Task', action: 'context_tag', reason: 'Create a rollback point' },
  { situation: 'Research / Logs', action: 'context_checkout (squash)', reason: 'Process is noise — keep result' },
  { situation: 'Messy Debugging', action: 'Squash w/ Backup', reason: 'Error logs are noise once fixed' },
  { situation: 'Task Done', action: 'Squash w/ Backup', reason: 'Summary usually enough, backup exists' },
  { situation: 'Goal Shift', action: 'context_checkout (squash)', reason: 'Old context is irrelevant' },
  { situation: 'Drift (no tags)', action: 'Tag (Milestone)', reason: "Maintain skeleton — don't fly blind" },
] as const;
