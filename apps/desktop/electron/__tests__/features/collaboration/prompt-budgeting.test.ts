import { describe, expect, it } from 'vitest';
import {
  STANDARD_SYNTHESIS_PROMPT_BUDGET,
  buildCoordinatorSynthesisPrompt,
} from '@electron/features/collaboration/agents';
import {
  DEBATE_SYNTHESIS_PROMPT_BUDGET,
  buildDebateSynthesisPrompt,
} from '@electron/features/collaboration/debate';
import type { CollaborationRole } from '@/types/collaboration';

function makeLongText(length: number, tail: string): string {
  return `${'x'.repeat(length)}${tail}`;
}

describe('collaboration synthesis prompt budgeting', () => {
  it('caps standard collaboration specialist outputs before coordinator synthesis', () => {
    const longResearch = makeLongText(STANDARD_SYNTHESIS_PROMPT_BUDGET.specialistOutputMaxChars + 200, 'RESEARCH_TAIL');
    const longAnalyst = makeLongText(STANDARD_SYNTHESIS_PROMPT_BUDGET.specialistOutputMaxChars + 300, 'ANALYST_TAIL');

    const prompt = buildCoordinatorSynthesisPrompt(
      'Summarize findings',
      longResearch,
      longAnalyst,
      'short visionary output',
    );

    expect(prompt).toContain('[truncated');
    expect(prompt).not.toContain('RESEARCH_TAIL');
    expect(prompt).not.toContain('ANALYST_TAIL');
  });

  it('caps debate analysis and round summaries before final synthesis', () => {
    const analyses = new Map<CollaborationRole, string>([
      ['researcher', makeLongText(DEBATE_SYNTHESIS_PROMPT_BUDGET.analysisPerRoleMaxChars + 120, 'RESEARCH_ANALYSIS_TAIL')],
      ['analyst', 'compact analysis'],
      ['visionary', 'compact vision'],
    ]);

    const debateRounds: Array<{
      challengerRole: CollaborationRole;
      defenderRole: CollaborationRole;
      summary: string;
    }> = [
      {
        challengerRole: 'analyst',
        defenderRole: 'researcher',
        summary: makeLongText(DEBATE_SYNTHESIS_PROMPT_BUDGET.roundSummaryMaxChars + 160, 'ROUND_TAIL'),
      },
    ];

    const prompt = buildDebateSynthesisPrompt(
      makeLongText(DEBATE_SYNTHESIS_PROMPT_BUDGET.queryMaxChars + 80, 'QUERY_TAIL'),
      analyses,
      debateRounds,
    );

    expect(prompt).toContain('[truncated');
    expect(prompt).not.toContain('RESEARCH_ANALYSIS_TAIL');
    expect(prompt).not.toContain('ROUND_TAIL');
    expect(prompt).not.toContain('QUERY_TAIL');
  });
});
