import { useCallback, useState } from 'react';
import {
  useAI,
  useAgentPrompt,
  useAppInfo,
  useAppState,
  useAppTools,
  useWidgetRegistration,
} from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';

import type { NotesState } from '../shared/types';
import { DEFAULT_STATE, normalizeNotesState } from '../shared/types';
import { NotesWidget } from './widgets/NotesWidget';
import './styles.css';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h16" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 11v6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 11v6" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M6.5 7l.7 12.1A2 2 0 0 0 9.2 21h5.6a2 2 0 0 0 2-1.9L17.5 7"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 7V5.7A2.7 2.7 0 0 1 11.7 3h.6A2.7 2.7 0 0 1 15 5.7V7"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function createNote(title: string, state: NotesState): NotesState {
  return {
    ...state,
    notes: [
      ...state.notes,
      {
        id: state.nextId,
        title,
        done: false,
        createdAt: new Date().toISOString(),
      },
    ],
    nextId: state.nextId + 1,
  };
}

export function NotesApp() {
  // File-backed reactive state, written atomically, reloaded on every change.
  const [state, updateState] = useAppState<NotesState>(DEFAULT_STATE);
  const currentState = normalizeNotesState(state);

  // Context about the mount, appId and the current workspace path.
  const { appId, workspacePath } = useAppInfo();

  // Direct invocation of this plugin's own tools.
  // Requires `requiredHostCapabilities: ["appAgent.invokeTool"]`.
  const { run } = useAppTools();

  // Send a user message into the active chat session. Silently no-ops with no chat.
  const prompt = useAgentPrompt();

  // Ad-hoc LLM calls, independent of the chat panel. No chat required.
  const ai = useAI();

  const [title, setTitle] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState('');
  const [toolError, setToolError] = useState('');

  // Register a widget dynamically. Equivalent to declaring it in the manifest,
  // but scoped to the lifetime of this component, unregistered on unmount.
  useWidgetRegistration({
    widgetId: 'notes-summary-dynamic',
    name: 'Notes Summary (dynamic)',
    component: NotesWidget,
    defaultSize: { w: 2, h: 2 },
    description: 'Registered at runtime by NotesApp',
  });

  const addNoteTitle = useCallback(
    (nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) return;
      updateState((prev) => createNote(trimmed, normalizeNotesState(prev)));
    },
    [updateState],
  );

  const addNote = useCallback(() => {
    addNoteTitle(title);
    setTitle('');
  }, [addNoteTitle, title]);

  const toggleNote = useCallback(
    (id: number) => {
      updateState((prev) => {
        const current = normalizeNotesState(prev);
        return {
          ...current,
          notes: current.notes.map((n) =>
            n.id === id ? { ...n, done: !n.done } : n,
          ),
        };
      });
    },
    [updateState],
  );

  const removeNote = useCallback(
    (id: number) => {
      updateState((prev) => {
        const current = normalizeNotesState(prev);
        return {
          ...current,
          notes: current.notes.filter((n) => n.id !== id),
        };
      });
    },
    [updateState],
  );

  // Example: UI button calls the plugin's own tool directly.
  const runListTool = useCallback(async () => {
    setToolBusy(true);
    setToolError('');
    try {
      const result = await run('notes', { action: 'list' });
      setToolResult(result.text || 'Tool returned no text.');
    } catch (error) {
      setToolResult('');
      setToolError(error instanceof Error ? error.message : 'Tool call failed');
    } finally {
      setToolBusy(false);
    }
  }, [run]);

  // Example: ask the agent in the chat panel to run our tool.
  const askAgentToSummarize = () => {
    prompt('Use the notes tool to summarize my open notes in one short paragraph.');
  };

  // Example: ad-hoc LLM call, generate a note title and add it.
  const generateNote = async () => {
    setSuggesting(true);
    try {
      const response = await ai.prompt(
        'Suggest a single short todo item in under 6 words. Reply with only the item text.',
      );
      const suggested = response.trim().replace(/^["']|["']$/g, '');
      if (suggested) addNoteTitle(suggested);
    } finally {
      setSuggesting(false);
    }
  };

  const total = currentState.notes.length;
  const openCount = currentState.notes.filter((n) => !n.done).length;
  const doneCount = total - openCount;
  const workspaceName = workspacePath.split('/').filter(Boolean).at(-1) ?? workspacePath;
  const hasResult = Boolean(toolResult || toolError);

  return (
    <div className="mx-auto flex size-full max-w-2xl flex-col gap-4 overflow-hidden bg-background p-5 text-foreground">
      <header className="flex items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Sero plugin example
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight">Notes Lab</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span className="font-medium text-foreground">{openCount}</span> open
            {doneCount > 0 && <span className="ml-1 opacity-70">· {doneCount} done</span>}
          </span>
          <span className="hidden sm:inline truncate font-mono text-sm opacity-70">
            {appId} @ {workspaceName}
          </span>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addNote();
        }}
        className="flex items-center gap-2"
      >
        <input
          id="notes-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a note..."
          aria-label="Add a note"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" type="submit" variant="default" disabled={!title.trim()}>
          Add
        </Button>
        <Button
          size="sm"
          type="button"
          onClick={generateNote}
          disabled={suggesting}
          title="Generate a note with AI"
          className={`bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm hover:from-violet-500/90 hover:to-fuchsia-500/90 ${
            suggesting ? 'animate-pulse' : ''
          }`}
        >
          <SparkleIcon />
          {suggesting ? 'Generating...' : 'Generate'}
        </Button>
      </form>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        {total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
            <p className="text-base font-medium">No notes yet</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Add one above, or use the sparkle button to generate one with AI.
            </p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {currentState.notes.map((note) => (
              <li
                key={note.id}
                className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-secondary/40"
              >
                <input aria-label="Checkbox input"
                  type="checkbox"
                  checked={note.done}
                  onChange={() => toggleNote(note.id)}
                  aria-label={`Mark ${note.title} as ${note.done ? 'open' : 'done'}`}
                  className="size-4 shrink-0 rounded border-input"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-base ${
                    note.done
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {note.title}
                </span>
                <span className="font-mono text-sm text-muted-foreground/70 tabular-nums">
                  #{note.id}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removeNote(note.id)}
                  aria-label={`Remove ${note.title}`}
                  title="Remove note"
                >
                  <TrashIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Capability demos
          </p>
          {hasResult && (
            <button
              type="button"
              onClick={() => {
                setToolResult('');
                setToolError('');
              }}
              className="text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runListTool}
            disabled={toolBusy}
          >
            {toolBusy ? 'Running...' : 'Run notes tool'}
          </Button>
          <Button size="sm" variant="outline" onClick={askAgentToSummarize}>
            Ask agent to summarize
          </Button>
        </div>
        {hasResult && (
          <pre
            className={`max-h-32 overflow-auto rounded-md border border-border bg-secondary/20 p-2 font-mono text-sm leading-relaxed ${
              toolError ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {toolError || toolResult}
          </pre>
        )}
      </section>
    </div>
  );
}

// Both named and default exports are required for Module Federation lazy loading.
export default NotesApp;
