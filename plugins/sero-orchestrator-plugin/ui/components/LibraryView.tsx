/**
 * The library surface: My Library (saved loops) and Catalog (curated loops to
 * install) side by side as tabs. New users with an empty library land on the
 * Catalog tab — proven loops beat a blank prompt box.
 */

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@sero-ai/ui';
import type { LibraryIndex } from '../../shared/types';
import { CatalogBrowser } from './CatalogBrowser';
import { LibraryBrowser } from './LibraryBrowser';

type Tab = 'mine' | 'catalog';

interface LibraryViewProps {
  libraryDir: string | null;
  libraryIndex: LibraryIndex;
  busy: boolean;
  onLoad: (entryId: string, version?: number) => void;
  onOpenLoop: (loopId: string) => void;
  dispatch: (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onClose: () => void;
}

export function LibraryView({ libraryDir, libraryIndex, busy, onLoad, onOpenLoop, dispatch, onClose }: LibraryViewProps) {
  const [tab, setTab] = useState<Tab>(() => (libraryIndex.entries.length === 0 ? 'catalog' : 'mine'));
  const [librarySearch, setLibrarySearch] = useState('');

  const showInLibrary = (entryName: string) => {
    setLibrarySearch(entryName);
    setTab('mine');
  };

  return (
    <div className="flex h-full flex-1 flex-col gap-3 overflow-auto p-4">
      <header className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" onClick={onClose} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Loop Library</h1>
        <div className="ml-3 flex items-center gap-1">
          <Button size="sm" variant={tab === 'mine' ? 'secondary' : 'ghost'} onClick={() => setTab('mine')}>
            My Library
          </Button>
          <Button size="sm" variant={tab === 'catalog' ? 'secondary' : 'ghost'} onClick={() => setTab('catalog')}>
            Catalog
          </Button>
        </div>
        {tab === 'mine' && (
          <span className="ml-auto text-xs text-muted-foreground">{libraryIndex.entries.length} saved loop(s)</span>
        )}
      </header>

      {tab === 'mine' ? (
        <LibraryBrowser key={librarySearch} libraryDir={libraryDir} busy={busy} onLoad={onLoad} initialQuery={librarySearch} />
      ) : (
        <CatalogBrowser
          busy={busy}
          libraryIndex={libraryIndex}
          dispatch={dispatch}
          onOpenLoop={onOpenLoop}
          onShowInLibrary={showInLibrary}
        />
      )}
    </div>
  );
}
