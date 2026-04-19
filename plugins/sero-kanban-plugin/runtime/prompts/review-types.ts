import type { ReviewMode } from '@sero/common';

export interface ReviewPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export interface ReviewRevisionPromptOptions {
  testingEnabled?: boolean;
  reviewMode?: ReviewMode;
}

export interface ReviewIssue {
  description: string;
  severity: 'critical' | 'important' | 'minor';
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  /** Legacy flat issues list (backward compat) */
  issues: string[];
  /** Structured issue categories */
  categorizedIssues?: ReviewIssue[];
  /** Explicit verdict: 'merge' | 'fix-first' | 'reject' */
  verdict?: 'merge' | 'fix-first' | 'reject';
  prTitle: string;
  prBody: string;
}
