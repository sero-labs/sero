import { Button } from '@sero-ai/ui';
import { Plus, Settings2, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import './styles.css';

import type { ItemSummary } from '../shared/types';
import type { GalleryVersionRecord } from '../shared/gallery';
import { GenerateDialog, type GenerateSource } from './components/GenerateDialog';
import { CreateDesignDialog } from './components/design/CreateDesignDialog';
import { useDesigns } from './hooks/useDesigns';
import { useGallery } from './hooks/useGallery';
import { useMedia } from './hooks/useMedia';
import { useVideoFrames } from './hooks/useVideoFrames';
import { useImport } from './hooks/useImport';
import { useLibrary } from './hooks/useLibrary';
import { importableFiles } from './lib/import';
import { REFERENCE_TRANSITION_NAME, navigateWithTransition } from './lib/view-transition';
import { DesignPage } from './pages/DesignPage';
import { ItemPage } from './pages/ItemPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { GalleryPage } from './pages/GalleryPage';
import { SpriteStudioPage } from '../sprite-studio/ui';
import { ExportNotifications } from './components/gallery/ExportNotifications';

/**
 * The Design Library shell.
 *
 * Import lives here rather than on the Library page so a paste lands wherever
 * the user happens to be, and so the file picker is one element rather than
 * one per surface. The create dialog lives here for the same reason: it is
 * opened from the Library's selection but has to outlive a navigation.
 */

type Surface = 'library' | 'gallery' | 'sprites' | 'settings';

export function DesignLibraryApp() {
  const library = useLibrary();
  const designs = useDesigns();
  const gallery = useGallery();
  const { state: importState, importFiles, dismissErrors } = useImport();
  const [surface, setSurface] = useState<Surface>('library');
  const [creatingFrom, setCreatingFrom] = useState<ItemSummary[] | null>(null);
  const [remixing, setRemixing] = useState<{
    familyId: string;
    version: GalleryVersionRecord;
    references: ItemSummary[];
  } | null>(null);
  const [galleryError, setGalleryError] = useState<string>();
  /** Null when closed; the item to work from, or undefined for a fresh one. */
  const [generatingFrom, setGeneratingFrom] = useState<{ item?: ItemSummary } | null>(null);
  const media = useMedia();
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
  const galleryFamilyCount = gallery.families.length;
  const characterCount = library.state.sprite.characters.filter(
    (character) => character.deletedAt === undefined,
  ).length;

  // Videos generated while Sero was closed have no stills yet, and the runtime
  // cannot make them. Done here rather than on the Library page so it keeps
  // going while the user is inside a Design (D4).
  const awaitingFrames = useMemo(
    () =>
      library.state.items.flatMap((item) =>
        item.awaitingFrames === true && item.deletedAt === undefined
          ? [{ kind: 'item' as const, itemId: item.id }]
          : [],
      ),
    [library.state.items],
  );
  useVideoFrames(awaitingFrames);

  // Anything live can be restyled or upscaled — unlike a Design reference, this
  // does not need the Librarian to have read it first.
  const librarySources = useMemo<GenerateSource[]>(
    () =>
      library.state.items.flatMap((item) =>
        item.deletedAt === undefined ? [{ id: item.id, label: item.title, kind: item.kind }] : [],
      ),
    [library.state.items],
  );

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
            variant={surface === 'gallery' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setSurface('gallery');
              void designs.actions.open(undefined);
            }}
          >
            Gallery
            <span className="text-muted-foreground tabular-nums">{galleryFamilyCount}</span>
          </Button>
          <Button
            type="button"
            variant={surface === 'sprites' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setSurface('sprites');
              void designs.actions.open(undefined);
            }}
          >
            Sprite Studio
            <span className="text-muted-foreground tabular-nums">{characterCount}</span>
          </Button>
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

        {surface === 'library' && designs.open === undefined && library.selected === undefined && (
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setGeneratingFrom({})}
          >
            <Sparkles className="size-3.5" />
            Generate
          </Button>
          <Button type="button" size="sm" onClick={() => fileInput.current?.click()}>
            <Plus className="size-3.5" />
            Add inspiration
          </Button>
        </div>
        )}
      </header>

      {surface === 'settings' ? (
        <SettingsPage state={library.state} />
      ) : surface === 'sprites' ? (
        // Sprite Studio owns its whole surface, including its own rails and
        // toolbars: all of its code lives in one folder so it can be lifted
        // into its own plugin later (D6).
        <SpriteStudioPage />
      ) : surface === 'gallery' ? (
        <GalleryPage
          families={gallery.families}
          trash={gallery.trash}
          actions={gallery.actions}
          onOpened={() => setSurface('library')}
          {...(galleryError === undefined ? {} : { error: galleryError })}
          onRemix={(familyId, versionId) => {
            setGalleryError(undefined);
            void gallery.actions.read(familyId, versionId).then((version) => {
              if (!version) return;
              const references = version.references.flatMap((reference) => {
                const item = library.state.items.find(
                  (candidate) => candidate.id === reference.itemId && candidate.deletedAt === undefined,
                );
                return item ? [item] : [];
              });
              if (references.length !== version.references.length) {
                setGalleryError('Restore every source reference before remixing this version.');
                return;
              }
              setRemixing({ familyId, version, references });
            });
          }}
        />
      ) : designs.open !== undefined ? (
        <DesignPage
          design={designs.open}
          designs={designs.list}
          items={library.state.items}
          settings={library.state.settings}
          mediaOptions={library.state.mediaOptions}
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
          onGenerate={(sourceItem) => setGeneratingFrom(sourceItem ? { item: sourceItem } : {})}
          onDismissJob={(jobId) => void media.dismissJob(jobId)}
          {...(transitioningItemId === undefined ? {} : { transitioningItemId })}
          transitionName={REFERENCE_TRANSITION_NAME}
        />
      )}

      <ExportNotifications
        summary={gallery.latestExport}
        workspaceId={gallery.latestExportWorkspaceId ?? ''}
      />

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

      {remixing !== null && (
        <CreateDesignDialog
          key={remixing.version.id}
          open
          references={remixing.references}
          settings={library.state.settings}
          actions={designs.actions}
          initialBrief={remixing.version.brief}
          galleryParent={{ familyId: remixing.familyId, versionId: remixing.version.id }}
          onOpenChange={(open) => {
            if (!open) setRemixing(null);
          }}
          onCreated={() => {
            setRemixing(null);
            setSurface('library');
          }}
        />
      )}

      {generatingFrom !== null && (
        <GenerateDialog
          // Keyed on the source so opening Remix on a different reference
          // starts from that one, rather than reusing the last dialog's state.
          key={generatingFrom.item?.id ?? 'new'}
          open
          target={{ kind: 'library' }}
          sources={librarySources}
          modelOptions={library.state.mediaOptions}
          {...(generatingFrom.item === undefined ? {} : { initialSourceId: generatingFrom.item.id })}
          onOpenChange={(open) => {
            if (!open) setGeneratingFrom(null);
          }}
          onGenerate={(request) => {
            const { sourceId, ...rest } = request;
            void media.generateIntoLibrary({
              ...rest,
              ...(sourceId === undefined ? {} : { sourceItemId: sourceId }),
            });
          }}
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
