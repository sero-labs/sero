import { useState } from 'react';
import { MAX_DESIGN_REFERENCES } from '../shared/defaults';
import { AppHeader } from './components/AppHeader';
import {
  GALLERY_FIXTURES,
  LIBRARY_FIXTURES,
  VARIANT_FIXTURES,
} from './fixtures';
import { DesignPage } from './pages/DesignPage';
import { GalleryPage } from './pages/GalleryPage';
import { LibraryPage } from './pages/LibraryPage';
import type { DesignLibraryPage } from './types';
import './styles.css';

export function DesignLibraryApp() {
  const [activePage, setActivePage] = useState<DesignLibraryPage>('library');
  const [selectedIds, setSelectedIds] = useState<string[]>([
    LIBRARY_FIXTURES[0].id,
    LIBRARY_FIXTURES[1].id,
    LIBRARY_FIXTURES[2].id,
  ]);

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((selectedId) => selectedId !== id);
      }
      if (current.length >= MAX_DESIGN_REFERENCES) {
        return current;
      }
      return [...current, id];
    });
  }

  return (
    <div className="dl-app">
      <AppHeader
        activePage={activePage}
        counts={{
          library: LIBRARY_FIXTURES.length,
          design: 1,
          gallery: GALLERY_FIXTURES.length,
        }}
        onNavigate={setActivePage}
      />

      {activePage === 'library' ? (
        <LibraryPage
          items={LIBRARY_FIXTURES}
          onCreateDesign={() => setActivePage('design')}
          onToggleSelection={toggleSelection}
          selectedIds={selectedIds}
        />
      ) : null}
      {activePage === 'design' ? <DesignPage variants={VARIANT_FIXTURES} /> : null}
      {activePage === 'gallery' ? <GalleryPage families={GALLERY_FIXTURES} /> : null}
    </div>
  );
}

export default DesignLibraryApp;
