import { useCallback, useState } from 'react';
import {
  useAI,
  useAgentPrompt,
  useAppInfo,
  useAppState,
  useAppTools,
  useWidgetRegistration,
} from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';

import type { NotesState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { NotesWidget } from './widgets/NotesWidget';
import './styles.css';

export function NotesApp() {
  // File-backed reactive state — written atomically, reloaded on every change.
  const [state, updateState] = useAppState<NotesState>(DEFAULT_STATE);

  // Context about the mount — appId and the current workspace path.
  const { appId, workspacePath } = useAppInfo();

  // Direct invocation of this plugin's own tools.
  // Requires `requiredHostCapabilities: ["appAgent.invokeTool"]`.
  const { run } = useAppTools();

  // Send a user message into the active chat session. Silently no-ops with no chat.
  const prompt = useAgentPrompt();

  // Ad-hoc LLM calls — independent of the chat panel. No chat required.
  const ai = useAI();

  const [title, setTitle] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  // Register a widget dynamically. Equivalent to declaring it in the manifest,
  // but scoped to the lifetime of this component — unregistered on unmount.
  useWidgetRegistration({
    widgetId: 'notes-summary-dynamic',
    name: 'Notes Summary (dynamic)',
    component: NotesWidget,
    defaultSize: { w: 2, h: 2 },
    description: 'Registered at runtime by NotesApp',
  });

  const addNote = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateState((prev) => ({
      ...prev,
      notes: [
        ...prev.notes,
        {
          id: prev.nextId,
          title: trimmed,
          done: false,
          createdAt: new Date().toISOString(),
        },
      ],
      nextId: prev.nextId + 1,
    }));
    setTitle('');
  }, [title, updateState]);

  const toggleNote = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id ? { ...n, done: !n.done } : n,
        ),
      }));
    },
    [updateState],
  );

  const removeNote = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        notes: prev.notes.filter((n) => n.id !== id),
      }));
    },
    [updateState],
  );

  // Example: UI button calls the plugin's own tool directly.
  const removeViaTool = useCallback(
    async (id: number) => {
      await run('notes', { action: 'remove', id });
    },
    [run],
  );

  // Example: ask the agent in the chat panel to run our tool.
  const askAgentToList = () => {
    prompt('List my notes using the notes tool.');
  };

  // Example: ad-hoc LLM call — generate a note title and add it.
  const suggestNote = async () => {
    setSuggesting(true);
    try {
      const response = await ai.prompt(
        'Suggest a single short todo item in under 6 words. Reply with only the item text.',
      );
      const suggested = response.trim().replace(/^["']|["']$/g, '');
      if (suggested) {
        updateState((prev) => ({
          ...prev,
          notes: [
            ...prev.notes,
            {
              id: prev.nextId,
              title: suggested,
              done: false,
              createdAt: new Date().toISOString(),
            },
          ],
          nextId: prev.nextId + 1,
        }));
      }
    } finally {
      setSuggesting(false);
    }
  };

  const openCount = state.notes.filter((n) => !n.done).length;

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Notes</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {openCount} open / {state.notes.length} total · {appId} @ {workspacePath}
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addNote();
        }}
        className="mb-3 flex gap-2"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a note..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" type="submit" disabled={!title.trim()}>
          Add
        </Button>
      </form>

      <div className="mb-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={askAgentToList}>
          Ask agent to list
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={suggestNote}
          disabled={suggesting}
        >
          {suggesting ? 'Thinking…' : 'Suggest with AI'}
        </Button>
      </div>

      <Card className="flex-1 gap-0 overflow-hidden py-0 shadow-none">
        {state.notes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No notes yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {state.notes.map((note) => (
              <div
                key={note.id}
                className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={note.done}
                  onChange={() => toggleNote(note.id)}
                  className="h-4 w-4"
                />
                <span
                  className={`flex-1 text-sm ${
                    note.done
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {note.title}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => removeNote(note.id)}
                >
                  Remove
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => removeViaTool(note.id)}
                  title="Remove via plugin tool"
                >
                  Tool
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Both named and default exports are required for Module Federation lazy loading.
export default NotesApp;
