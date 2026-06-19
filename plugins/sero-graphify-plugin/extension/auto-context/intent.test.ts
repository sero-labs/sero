import { describe, expect, it } from 'vitest';
import { classifyGraphifyIntent } from './intent';
import { TRIGGER_PATTERNS } from './settings';

const lines = (n: number) => [{ type: 'text', text: Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') }];

describe('classifyGraphifyIntent', () => {
  it('classifies broad grep results', () => {
    const intent = classifyGraphifyIntent({ toolName: 'grep', input: { pattern: 'auth' }, content: lines(10) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('broad-search');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.8);
    expect(intent.suggestedQuestion).toBeTruthy();
    expect(intent.cacheKey).toBe('grep:auth');
  });

  it('classifies high-value file reads', () => {
    const intent = classifyGraphifyIntent({ toolName: 'read', input: { path: 'src/README.md' }, content: lines(3) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('overview-file');
  });

  it('classifies doc/plan reads', () => {
    const intent = classifyGraphifyIntent({ toolName: 'read', input: { path: 'docs/design.md' }, content: lines(3) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('docs-or-plan');
  });

  it('classifies large multi-file results from any tool', () => {
    const intent = classifyGraphifyIntent({ toolName: 'bash', input: { command: 'ls -R' }, content: lines(25) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('multi-file-result');
  });

  it('classifies architecture-term inputs', () => {
    const intent = classifyGraphifyIntent({ toolName: 'bash', input: { command: 'check the architecture diagram' }, content: lines(2) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('architecture-question');
  });

  it('returns none for small unrelated results', () => {
    const intent = classifyGraphifyIntent({ toolName: 'bash', input: { command: 'pwd' }, content: lines(1) }, TRIGGER_PATTERNS);
    expect(intent.kind).toBe('none');
    expect(intent.confidence).toBe(0);
  });
});
