import type { ReviewIssue, ReviewResult } from './review-types';

export function parseReviewResult(raw: string, cardTitle?: string): ReviewResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
    || raw.match(/\{[\s\S]*"prTitle"[\s\S]*"prBody"[\s\S]*\}/);

  const fallbackTitle = cardTitle
    ? `feat: ${cardTitle.toLowerCase().slice(0, 65)}`
    : 'feat: implementation';

  const fallback: ReviewResult = {
    approved: true,
    summary: raw.slice(0, 500),
    issues: [],
    prTitle: fallbackTitle,
    prBody: raw.slice(0, 2000),
  };

  if (!jsonMatch) {
    return buildRawReviewFallback(raw, fallback);
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    let categorizedIssues: ReviewIssue[] | undefined;
    if (Array.isArray(parsed.categorizedIssues)) {
      categorizedIssues = parsed.categorizedIssues
        .filter((issue: unknown) => issue && typeof issue === 'object')
        .map((issue: Record<string, unknown>) => normalizeReviewIssue(issue));
    }

    if ((!categorizedIssues || categorizedIssues.length === 0) && Array.isArray(parsed.issues)) {
      const objectIssues = parsed.issues
        .filter((issue: unknown) => issue && typeof issue === 'object')
        .map((issue: Record<string, unknown>) => normalizeReviewIssue(issue));
      if (objectIssues.length > 0) {
        categorizedIssues = objectIssues;
      }
    }

    const validVerdicts = new Set(['merge', 'fix-first', 'reject']);
    const verdict = validVerdicts.has(parsed.verdict) ? parsed.verdict : undefined;

    return {
      approved: parsed.approved !== false && verdict !== 'fix-first' && verdict !== 'reject',
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(normalizeReviewIssueText) : [],
      categorizedIssues,
      verdict,
      prTitle: typeof parsed.prTitle === 'string'
        ? parsed.prTitle.slice(0, 72)
        : fallback.prTitle,
      prBody: typeof parsed.prBody === 'string' ? parsed.prBody : fallback.prBody,
    };
  } catch {
    return buildRawReviewFallback(raw, fallback);
  }
}

function buildRawReviewFallback(raw: string, fallback: ReviewResult): ReviewResult {
  const verdict = parseRawVerdict(raw);
  const issues = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .filter(Boolean)
    .slice(0, 5);

  return {
    ...fallback,
    approved: verdict ? verdict === 'merge' : true,
    verdict,
    issues,
  };
}

function parseRawVerdict(raw: string): ReviewResult['verdict'] | undefined {
  const match = raw.match(/verdict[:\s`*-]+(merge|fix-first|reject)/i);
  return match ? match[1].toLowerCase() as ReviewResult['verdict'] : undefined;
}

function normalizeReviewIssueText(issue: unknown): string {
  if (typeof issue === 'string') return issue;
  if (issue && typeof issue === 'object') {
    const value = issue as Record<string, unknown>;
    return typeof value.description === 'string'
      ? value.description
      : JSON.stringify(value);
  }
  return String(issue);
}

function normalizeReviewIssue(issue: Record<string, unknown>): ReviewIssue {
  return {
    description: typeof issue.description === 'string' ? issue.description : normalizeReviewIssueText(issue),
    severity: normalizeReviewSeverity(issue.severity),
    file: typeof issue.file === 'string' ? issue.file : undefined,
    line: typeof issue.line === 'number' ? issue.line : undefined,
    suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : undefined,
  };
}

function normalizeReviewSeverity(raw: unknown): ReviewIssue['severity'] {
  const severity = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (severity === 'critical') return 'critical';
  if (severity === 'important' || severity === 'warning') return 'important';
  return 'minor';
}
