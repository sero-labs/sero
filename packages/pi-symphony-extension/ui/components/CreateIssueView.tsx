/**
 * CreateIssueView — form for creating new issues via the file-based tracker.
 *
 * Supports optional AI enhancement of the description with streaming,
 * referencing existing issues for context.
 */

import { useState, useCallback, useRef } from 'react';
import { useAI } from '@sero/app-runtime';
import type { SymphonyState, PendingIssueCreate } from '../../shared/types';

interface CreateIssueViewProps {
  state: SymphonyState;
  onSubmit: (issue: PendingIssueCreate) => void;
  onBack: () => void;
}

const PRIORITY_OPTIONS = [
  { value: '', label: 'None' },
  { value: '0', label: 'Urgent (0)' },
  { value: '1', label: 'High (1)' },
  { value: '2', label: 'Medium (2)' },
  { value: '3', label: 'Low (3)' },
];

export function CreateIssueView({ state, onSubmit, onBack }: CreateIssueViewProps) {
  const ai = useAI();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('');
  const [labelsText, setLabelsText] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const pendingDeltaRef = useRef('');
  const rafIdRef = useRef(0);

  const canSubmit = title.trim().length > 0 && !enhancing;
  const canEnhance = description.trim().length > 0 && !enhancing;
  const isFileTracker = state.trackerKind === 'file';

  const handleEnhance = useCallback(async () => {
    if (!canEnhance) return;

    setEnhancing(true);
    setEnhanceError(null);
    pendingDeltaRef.current = '';

    // Build context from running + completed issues
    const contextLines: string[] = [];
    for (const r of state.running) {
      contextLines.push(`- [${r.identifier}] ${r.issue.title} (${r.phase})`);
    }
    if (state.issuesDir) {
      contextLines.push(`\nIssues directory: ${state.issuesDir}`);
      contextLines.push('Read the issues directory to see existing issues for context.');
    }

    const existingContext = contextLines.length > 0
      ? `\n\nExisting issues for context:\n${contextLines.join('\n')}`
      : '';

    const prompt = [
      'You are helping create a well-structured issue for a coding project.',
      'Take the user\'s rough description and enhance it into a clear, actionable issue description.',
      'Keep the original intent but improve clarity, add acceptance criteria if appropriate,',
      'and structure it with markdown. Do NOT add a title — just output the enhanced description body.',
      'Be concise — avoid boilerplate.',
      existingContext,
      `\nTitle: ${title || '(untitled)'}`,
      `\nOriginal description:\n${description}`,
    ].join('\n');

    let isFirstDelta = true;

    try {
      const response = await ai.promptStream(prompt, (delta) => {
        if (isFirstDelta) {
          isFirstDelta = false;
          setDescription(delta);
          return;
        }

        pendingDeltaRef.current += delta;
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const buffered = pendingDeltaRef.current;
            pendingDeltaRef.current = '';
            rafIdRef.current = 0;
            setDescription((prev) => prev + buffered);
          });
        }
      });

      // Flush remaining buffer
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      pendingDeltaRef.current = '';
      setDescription(response);
    } catch (err) {
      setEnhanceError(err instanceof Error ? err.message : 'Enhancement failed');
    } finally {
      setEnhancing(false);
    }
  }, [canEnhance, description, title, state, ai]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    const labels = labelsText
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);

    const issue: PendingIssueCreate = {
      id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      description: description.trim(),
      priority: priority ? parseInt(priority, 10) : null,
      labels,
    };

    onSubmit(issue);
  }, [canSubmit, title, description, priority, labelsText, onSubmit]);

  if (!isFileTracker) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm" style={{ color: 'var(--sy-muted)' }}>
          Issue creation is only available with the file-based tracker.
        </p>
        <button className="sy-button-ghost" onClick={onBack}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1 sy-animate-in">
      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: 'var(--sy-muted)' }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of the issue..."
          className="sy-input"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium" style={{ color: 'var(--sy-muted)' }}>
            Description
          </label>
          <button
            className="sy-button-ghost"
            style={{ fontSize: '11px', padding: '2px 8px' }}
            disabled={!canEnhance}
            onClick={handleEnhance}
          >
            {enhancing ? 'Enhancing...' : 'Enhance with AI'}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the task, bug, or feature..."
          rows={8}
          className="sy-input sy-textarea"
          style={{ resize: 'vertical', minHeight: '120px' }}
        />
        {enhanceError && (
          <p className="text-xs" style={{ color: 'var(--sy-error, #f87171)' }}>
            {enhanceError}
          </p>
        )}
      </div>

      {/* Priority + Labels row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--sy-muted)' }}>
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="sy-input"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--sy-muted)' }}>
            Labels
          </label>
          <input
            type="text"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="bug, frontend (comma-separated)"
            className="sy-input"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          className="sy-button"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Create Issue
        </button>
        <button className="sy-button-ghost" onClick={onBack}>
          Cancel
        </button>
        {state.issuesDir && (
          <span className="ml-auto text-xs" style={{ color: 'var(--sy-dim)' }}>
            Saves to {state.issuesDir}
          </span>
        )}
      </div>
    </div>
  );
}
