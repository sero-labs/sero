/**
 * IdleView — empty state with research input, article analysis input, and history.
 */

import type { ReactNode, ChangeEvent, KeyboardEvent } from 'react';
import { useState, useCallback } from 'react';
import type { ResearchHistoryEntry } from '../shared/types';

type TabId = 'research' | 'article';

interface IdleViewProps {
  onStart: (question: string) => void;
  onAnalyze: (urls: string[], context: string) => void;
  history: ResearchHistoryEntry[];
}

export function IdleView({ onStart, onAnalyze, history }: IdleViewProps) {
  const [tab, setTab] = useState<TabId>('research');
  const [question, setQuestion] = useState('');
  const [articleInput, setArticleInput] = useState('');
  const [contextInput, setContextInput] = useState('');

  const handleResearch = useCallback(() => {
    const q = question.trim();
    if (q) {
      onStart(q);
      setQuestion('');
    }
  }, [question, onStart]);

  const handleAnalyze = useCallback(() => {
    const urls = articleInput
      .split(/[\n,]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.startsWith('http'));
    if (urls.length > 0) {
      onAnalyze(urls, contextInput.trim());
      setArticleInput('');
      setContextInput('');
    }
  }, [articleInput, contextInput, onAnalyze]);

  return (
    <>
      <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
        <div className="rs-empty-orb rs-animate-in" style={{ marginBottom: 20 }} />

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--rs-bg-elevated)', borderRadius: 8, padding: 3 }}>
          <TabButton active={tab === 'research'} onClick={() => setTab('research')}>Research</TabButton>
          <TabButton active={tab === 'article'} onClick={() => setTab('article')}>Analyse Article</TabButton>
        </div>

        {tab === 'research' ? (
          <ResearchTab question={question} setQuestion={setQuestion} onSubmit={handleResearch} />
        ) : (
          <ArticleTab
            articleInput={articleInput}
            setArticleInput={setArticleInput}
            contextInput={contextInput}
            setContextInput={setContextInput}
            onSubmit={handleAnalyze}
          />
        )}
      </div>

      {history.length > 0 && (
        <HistorySection history={history} />
      )}
    </>
  );
}

// ── Tab Button ────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 6,
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "'DM Sans', sans-serif",
        cursor: 'pointer',
        transition: 'all 0.15s',
        background: active ? 'var(--rs-accent)' : 'transparent',
        color: active ? '#fff' : 'var(--rs-muted)',
      }}
    >
      {children}
    </button>
  );
}

// ── Research Tab ──────────────────────────────────────────

function ResearchTab({ question, setQuestion, onSubmit }: {
  question: string; setQuestion: (v: string) => void; onSubmit: () => void;
}) {
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        Multi-Agent Research
      </h2>
      <p style={{ margin: '8px 0 20px', maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: 'var(--rs-muted)' }}>
        Decompose any question into parallel workstreams. Multiple agents research simultaneously and synthesize results.
      </p>
      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
        <input
          className="rs-input"
          value={question}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuestion(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && onSubmit()}
          placeholder="What do you want to research?"
        />
        <button onClick={onSubmit} className="rs-button primary" disabled={!question.trim()}>
          Research
        </button>
      </div>
    </>
  );
}

// ── Article Tab ──────────────────────────────────────────

function ArticleTab({ articleInput, setArticleInput, contextInput, setContextInput, onSubmit }: {
  articleInput: string; setArticleInput: (v: string) => void;
  contextInput: string; setContextInput: (v: string) => void;
  onSubmit: () => void;
}) {
  const hasUrls = articleInput.split(/[\n,]+/).some((s: string) => s.trim().startsWith('http'));

  return (
    <>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--rs-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        Analyse Article
      </h2>
      <p style={{ margin: '8px 0 20px', maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: 'var(--rs-muted)' }}>
        Paste article links to extract key ideas, identify commercial opportunities, and get actionable advice for your projects.
      </p>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--rs-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Article URLs (one per line)
        </label>
        <textarea
          className="rs-input"
          value={articleInput}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setArticleInput(e.target.value)}
          placeholder={"https://x.com/i/status/...\nhttps://example.com/article"}
          rows={3}
          style={{ resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}
        />
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--rs-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Context (optional) — what are you building?
        </label>
        <input
          className="rs-input"
          value={contextInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setContextInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && hasUrls && onSubmit()}
          placeholder="e.g. AI coding tool, SaaS product, developer platform..."
        />
        <button onClick={onSubmit} className="rs-button primary" disabled={!hasUrls} style={{ alignSelf: 'flex-end' }}>
          Analyse
        </button>
      </div>
    </>
  );
}

// ── History ──────────────────────────────────────────────

function HistorySection({ history }: { history: ResearchHistoryEntry[] }) {
  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--rs-border)', padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--rs-dim)', marginBottom: 8 }}>
        History
      </div>
      {history.slice(0, 5).map((entry, i) => (
        <div key={i} style={{ fontSize: 13, color: 'var(--rs-muted)', padding: '6px 0', borderBottom: i < Math.min(history.length, 5) - 1 ? '1px solid var(--rs-border)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--rs-text)', fontWeight: 400 }}>
            {entry.mode === 'article' && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(129, 140, 248, 0.12)', color: 'var(--rs-accent)', fontWeight: 600 }}>
                ARTICLE
              </span>
            )}
            {entry.question.length > 70 ? entry.question.slice(0, 70) + '\u2026' : entry.question}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            {entry.agentCount} agents · {entry.outputDir}
          </div>
        </div>
      ))}
    </div>
  );
}
