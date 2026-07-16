/**
 * GraphifySearch — compact global-search panel contributed to the Sero shell
 * via `sero.app.search`. Mounted by the host in the global search overlay
 * (sidebar trigger and ⌘K); all querying stays inside this plugin.
 *
 * Results list the files the query touched; clicking one opens it in the
 * workspace editor. By default opening a result closes the overlay so the file
 * is visible — toggle "Keep open" to open several files in a row.
 *
 * The last query, its results and the toggle live in a module-scoped cache so
 * the panel restores when reopened in the same session. It is intentionally NOT
 * persisted to disk — a fresh app launch starts empty.
 */

import { useState } from 'react';
import {
  closeSeroSearch,
  openSeroApp,
  openSeroFile,
  useAppState,
  useAppTools,
} from '@sero-ai/app-runtime';
import { Button, Input, Label, Switch } from '@sero-ai/ui';
import { FileText, Loader2, Search, Waypoints } from 'lucide-react';
import type { SearchFileHit } from '../shared/query-engine';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';
import './styles.css';

/** In-memory, session-scoped so the panel restores on reopen without persisting. */
const session: {
  question: string;
  files: SearchFileHit[] | null;
  note: string | null;
  keepOpen: boolean;
} = { question: '', files: null, note: null, keepOpen: false };

export function GraphifySearch() {
  const [state] = useAppState<GraphifyState>(DEFAULT_STATE);
  const { run } = useAppTools();
  const [question, setQuestion] = useState(session.question);
  const [files, setFiles] = useState(session.files);
  const [note, setNote] = useState(session.note);
  const [keepOpen, setKeepOpen] = useState(session.keepOpen);
  const [searching, setSearching] = useState(false);

  const { profileGraph } = state;

  const updateQuestion = (value: string) => {
    session.question = value;
    setQuestion(value);
  };

  const updateKeepOpen = (value: boolean) => {
    session.keepOpen = value;
    setKeepOpen(value);
  };

  const search = async () => {
    const trimmed = question.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    try {
      const result = await run('graphify_search', { question: trimmed });
      const hits = (result.details?.files as SearchFileHit[] | undefined) ?? [];
      session.files = hits;
      session.note = hits.length === 0 ? result.text || 'No files matched.' : null;
    } catch (err) {
      session.files = [];
      session.note = err instanceof Error ? err.message : String(err);
    } finally {
      setFiles(session.files);
      setNote(session.note);
      setSearching(false);
    }
  };

  const openFile = async (file: SearchFileHit) => {
    await openSeroFile(file.workspaceId, file.path);
    if (!keepOpen) closeSeroSearch();
  };

  return (
    <div className="flex h-full flex-col gap-3 bg-background p-4 text-foreground">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={question}
          onChange={(e) => updateQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="Search across all indexed workspaces…"
        />
        <Button
          aria-label="Search"
          onClick={() => void search()}
          disabled={searching || !question.trim()}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {files && files.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {files.map((file) => {
              const location = `${file.workspaceId}/${file.path}`;
              return (
                <li key={location}>
                  <button
                    type="button"
                    onClick={() => void openFile(file)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" title={file.label}>
                        {file.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" title={location}>
                        {location}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : note !== null ? (
          <p className="text-sm text-muted-foreground">{note}</p>
        ) : (
          <p className="text-base text-muted-foreground">
            {profileGraph.status === 'ready'
              ? 'Ask about any concept, file, or connection in your indexed workspaces.'
              : 'No profile graph yet — index workspaces in the Graphify app first.'}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {profileGraph.status === 'ready' && profileGraph.nodes
            ? `${profileGraph.nodes} nodes · ${profileGraph.edges} edges`
            : `Profile graph: ${profileGraph.status}`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="graphify-keep-open" checked={keepOpen} onCheckedChange={updateKeepOpen} />
          <Label htmlFor="graphify-keep-open" className="cursor-pointer font-normal">
            Keep open
          </Label>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void openSeroApp('graphify')}>
          <Waypoints className="h-4 w-4" />
          Open Graphify
        </Button>
      </footer>
    </div>
  );
}

export default GraphifySearch;
