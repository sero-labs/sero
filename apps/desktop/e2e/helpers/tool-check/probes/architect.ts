/**
 * The `architect` tool, which only a project's owner session may call. Its
 * steps are the owner's side of the Architect story (architect-story.ts); they
 * run in the owner sessions the pair runner (../architect-pair.ts) opens.
 */
import type { ToolProbe } from '../types';
import { stepsOf } from './architect-story';
import { must } from './architect-support';

const REFUSED = "The architect tool is for a project's owner session, and this session is not one.";

export const architectProbe: ToolProbe = {
  tool: 'architect',
  timeoutMs: 3_600_000,
  steps: stepsOf('owner'),
  // No site-pass session owns a project, so each must be refused.
  siteStep: {
    action: 'status',
    params: { action: 'status', projectId: 'tc-not-a-project' },
    // A site that does not report the error flag still shows the refusal's text.
    expect: (result) => must(result.text.includes(REFUSED), `the call was not refused: ${result.text}`),
  },
};
