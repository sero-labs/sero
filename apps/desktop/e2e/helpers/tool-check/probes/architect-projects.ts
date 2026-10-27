/**
 * The `architect_projects` tool, which is the user's: it refuses an owner
 * session. Its steps are the user's side of the Architect story
 * (architect-story.ts), run in a chat by the pair runner (../architect-pair.ts).
 */
import type { ToolProbe } from '../types';
import { must, succeeded } from './architect-support';
import { stepsOf } from './architect-story';

export const architectProjectsProbe: ToolProbe = {
  tool: 'architect_projects',
  timeoutMs: 3_600_000,
  steps: [...stepsOf('chat'), {
    action: 'sample_repair',
    params: { action: 'sample_repair' },
    expect: (result) => {
      succeeded(result);
      must(typeof result.details === 'object' && result.details !== null && 'projectId' in result.details && typeof result.details.projectId === 'string', 'sample preparation did not return its saved project');
    },
  }],
  // The site pass only lists, so it makes no project at every site.
  siteStep: {
    action: 'list',
    params: { action: 'list' },
    // An owner is given the tool, which refuses it: the owner acts through `architect`.
    expect: (result, ctx) => ctx.site === 'architect-owner'
      ? must(result.text.includes('The architect_projects tool is for the user.'), `the owner was not refused: ${result.text}`)
      : succeeded(result),
  },
};
