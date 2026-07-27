import { useCallback, useEffect, useState } from 'react';
import { MAX_DESIGN_REFERENCES } from '../shared/defaults';
import type { DesignLibraryPageId, LibraryFilters } from '../shared/state';
import { AppHeader } from './components/AppHeader';
import { NoticeBar } from './components/NoticeBar';
import { SettingsBar } from './components/SettingsBar';
import { DesignPage } from './pages/DesignPage';
import { GalleryPage } from './pages/GalleryPage';
import { LibraryPage } from './pages/LibraryPage';
import { useDesignLibrary } from './runtime';
import './styles.css';

export function DesignLibraryApp() {
  const { state, updateState, actions } = useDesignLibrary();
  const [showDeletedVersions, setShowDeletedVersions] = useState(false);

  const setUi = useCallback(
    (patch: Partial<typeof state.ui>) => {
      updateState((current) => ({ ...current, ui: { ...current.ui, ...patch } }));
    },
    [updateState],
  );

  const navigate = useCallback((page: DesignLibraryPageId) => setUi({ activePage: page }), [setUi]);

  const toggleSelection = useCallback((itemId: string) => {
    updateState((current) => {
      const draft = current.ui.referenceDraft;
      const next = draft.includes(itemId)
        ? draft.filter((entry) => entry !== itemId)
        : draft.length >= MAX_DESIGN_REFERENCES ? draft : [...draft, itemId];
      return { ...current, ui: { ...current.ui, referenceDraft: next } };
    });
  }, [updateState]);

  const createDesign = useCallback(async () => {
    const itemIds = state.ui.referenceDraft;
    if (itemIds.length === 0) return;
    const primary = state.items.find((item) => item.id === itemIds[0]);
    const result = await actions.createDesign({
      title: primary?.title ?? 'New Design',
      request: `Create an original interface in the design language of ${primary?.title ?? 'the selected references'}.`,
      outputTarget: 'html',
      itemIds,
    });
    const designId = result.details?.designId;
    setUi({
      activePage: 'design',
      referenceDraft: [],
      ...(typeof designId === 'string' ? { activeDesignId: designId } : {}),
    });
  }, [actions, setUi, state.items, state.ui.referenceDraft]);

  // Closing the plugin surface is a tweak checkpoint boundary.
  const { activeDesignId, activeVariantId } = state.ui;
  useEffect(() => {
    const checkpoint = () => {
      if (activeDesignId && activeVariantId) {
        void actions.checkpointTweaks(activeDesignId, activeVariantId, 'panel-closed');
      }
    };
    window.addEventListener('pagehide', checkpoint);
    return () => {
      window.removeEventListener('pagehide', checkpoint);
      checkpoint();
    };
  }, [actions, activeDesignId, activeVariantId]);

  const liveItems = state.items.filter((item) => item.deletedAt === undefined);
  const liveDesigns = state.designs.filter((design) => design.deletedAt === undefined);
  const liveFamilies = state.families.filter((family) => family.deletedAt === undefined);

  return (
    <div className="dl-app" tabIndex={0}>
      <AppHeader
        activePage={state.ui.activePage}
        counts={{
          library: liveItems.length,
          design: liveDesigns.length,
          gallery: liveFamilies.length,
        }}
        onNavigate={navigate}
        settings={
          <SettingsBar
            onChange={(settings) => void actions.updateSettings(settings)}
            settings={state.settings}
          />
        }
      />

      <NoticeBar notices={state.notices} onDismiss={(id) => void actions.dismissNotice(id)} />

      <div className="dl-content">
        {state.ui.activePage === 'library' ? (
          <LibraryPage
            actions={actions}
            filters={state.ui.filters}
            items={state.items}
            onCreateDesign={() => void createDesign()}
            onFilters={(filters: LibraryFilters) => setUi({ filters })}
            onOpenItem={(activeItemId) => setUi({ activeItemId })}
            onSearch={(search) => setUi({ search })}
            onToggleSelection={toggleSelection}
            search={state.ui.search}
            selection={state.ui.referenceDraft}
            {...(state.ui.activeItemId ? { activeItemId: state.ui.activeItemId } : {})}
          />
        ) : null}

        {state.ui.activePage === 'design' ? (
          <DesignPage
            actions={actions}
            designs={state.designs}
            jobs={state.jobs}
            onSelectDesign={(designId) => setUi({ activeDesignId: designId })}
            onSelectVariant={(variantId) => setUi({ activeVariantId: variantId })}
            revisionBehaviour={state.settings.revisionBehaviour}
            variantCount={state.settings.variantCount}
            {...(state.ui.activeDesignId ? { activeDesignId: state.ui.activeDesignId } : {})}
            {...(state.ui.activeVariantId ? { activeVariantId: state.ui.activeVariantId } : {})}
          />
        ) : null}

        {state.ui.activePage === 'gallery' ? (
          <GalleryPage
            actions={actions}
            families={state.families}
            onToggleDeleted={setShowDeletedVersions}
            showDeleted={showDeletedVersions}
          />
        ) : null}
      </div>
    </div>
  );
}

export default DesignLibraryApp;
