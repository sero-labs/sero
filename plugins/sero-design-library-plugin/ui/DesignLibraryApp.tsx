import { Button } from '@sero-ai/ui';
import { Plus, Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';

import './styles.css';

import type { ItemSummary } from '../shared/types';
import { CreateDesignDialog } from './components/design/CreateDesignDialog';
import { useDesigns } from './hooks/useDesigns';
import { useImport } from './hooks/useImport';
import { useLibrary } from './hooks/useLibrary';
import { importableFiles } from './lib/import';
import { REFERENCE_TRANSITION_NAME, navigateWithTransition } from './lib/view-transition';
import { DesignPage } from './pages/DesignPage';
import { ItemPage } from './pages/ItemPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';

/**
 * The Design Library shell.
 *
 * Import lives here rather than on the Library page so a paste lands wherever
 * the user happens to be, and so the file picker is one element rather than
 * one per surface. The create dialog lives here for the same reason: it is
 * opened from the Library's selection but has to outlive a navigation.
 */

type Surface = 'library' | 'settings';

export function DesignLibraryApp() {
  const library = useLibrary();
  const designs = useDesigns();
  const { state: importState, importFiles, dismissErrors } = useImport();
  const [surface, setSurface] = useState<Surface>('library');
  const [creatingFrom, setCreatingFrom] = useState<ItemSummary[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The reference the grid should hand its image to. It outlives the opening,
  // so the same card can receive the image back on the way out.
  const [transitioningItemId, setTransitioningItemId] = useState<string | undefined>(undefined);

  const openItem = (itemId: string) =>
    navigateWithTransition(
      () => library.actions.select(itemId),
      () => setTransitioningItemId(itemId),
    );

  const backToLibrary = () => navigateWithTransition(() => library.actions.select(undefined));

  const liveCount = library.state.items.filter((item) => item.deletedAt === undefined).length;

  return (
    <div className="bg-background text-foreground flex h-full min-h-0 flex-col">
      <header className="border-border flex items-center gap-3 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Design Library</h2>

        <nav className="flex items-center gap-1" aria-label="Design Library surfaces">
          <Button
            type="button"
            variant={surface === 'library' && designs.open === undefined ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setSurface('library');
              void designs.actions.open(undefined);
            }}
          >
            Library
            <span className="text-muted-foreground tabular-nums">{liveCount}</span>
          </Button>
          {designs.list.length > 0 && (
            <Button
              type="button"
              variant={designs.open === undefined ? 'ghost' : 'secondary'}
              size="sm"
              onClick={() => {
                setSurface('library');
                void designs.actions.open(designs.list[0]?.id);
              }}
            >
              Designs
              <span className="text-muted-foreground tabular-nums">{designs.list.length}</span>
            </Button>
          )}
          <Button
            type="button"
            variant={surface === 'settings' ? 'secondary' : 'ghost'}
            size="sm"
            aria-label="Settings"
            onClick={() => setSurface('settings')}
          >
            <Settings2 className="size-4" />
          </Button>
        </nav>

        <div className="ml-auto">
          <Button type="button" size="sm" onClick={() => fileInput.current?.click()}>
            <Plus className="size-3.5" />
            Add inspiration
          </Button>
        </div>
      </header>

      {surface === 'settings' ? (
        <SettingsPage state={library.state} />
      ) : designs.open !== undefined ? (
        <DesignPage
          design={designs.open}
          items={library.state.items}
          activeVariantId={designs.state.view.activeVariantId}
          actions={designs.actions}
          onBack={() => void designs.actions.open(undefined)}
        />
      ) : library.selected ? (
        // An opened reference takes the whole surface, as the prototype has it.
        <ItemPage
          item={library.selected}
          collections={library.state.collections}
          revision={library.state.revision}
          actions={library.actions}
          onBack={backToLibrary}
        />
      ) : (
        <LibraryPage
          library={library}
          importState={importState}
          importFiles={importFiles}
          dismissErrors={dismissErrors}
          onPickFiles={() => fileInput.current?.click()}
          onOpenItem={openItem}
          onCreateDesign={setCreatingFrom}
          {...(transitioningItemId === undefined ? {} : { transitioningItemId })}
          transitionName={REFERENCE_TRANSITION_NAME}
        />
      )}

      {creatingFrom !== null && (
        <CreateDesignDialog
          open
          references={creatingFrom}
          settings={library.state.settings}
          actions={designs.actions}
          onOpenChange={(open) => {
            if (!open) setCreatingFrom(null);
          }}
          // Creating a Design opens it: the runtime selects it, and this surface
          // follows the selection.
          onCreated={() => setCreatingFrom(null)}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void importFiles(importableFiles(event.target.files ?? []), 'file');
          event.target.value = '';
        }}
      />
    </div>
  );
}

export default DesignLibraryApp;
