import { useAppState } from '@sero-ai/app-runtime';
import { EmptyState, ItemList, ItemListItem, Stack, WidgetContent } from '@sero-ai/ui';
import { Compass } from 'lucide-react';

import type { ArchitectIndex } from '../../shared/types';
import { DEFAULT_INDEX, normalizeIndex } from '../../shared/types';
import '../styles.css';

/** The one Architect widget. It reads only the index: the list rows and the needs-you total. */
export function ArchitectWidget() {
  const [stored] = useAppState<ArchitectIndex>(DEFAULT_INDEX);
  const index = normalizeIndex(stored);

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        {index.projects.length === 0 ? (
          <EmptyState icon={Compass} title="No projects yet" message="Give the Architect an idea and a folder." />
        ) : (
          <Stack gap="none" scroll>
            <ItemList overflowCount={Math.max(0, index.projects.length - 5)}>
              {index.projects.slice(0, 5).map((entry) => (
                <ItemListItem
                  key={entry.id}
                  primary={entry.name}
                  secondary={entry.stateLine}
                  trailing={entry.needsYou > 0 ? String(entry.needsYou) : (entry.overlay ?? entry.phase)}
                />
              ))}
            </ItemList>
          </Stack>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default ArchitectWidget;
