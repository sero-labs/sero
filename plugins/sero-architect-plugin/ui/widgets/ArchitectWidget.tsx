import { openSeroApp, useAppState } from '@sero-ai/app-runtime';
import { Button, EmptyState, ItemList, ItemListItem, Stack, WidgetContent } from '@sero-ai/ui';
import { Compass, Plus } from 'lucide-react';

import type { ArchitectIndex, ArchitectIndexEntry } from '../../shared/types';
import { DEFAULT_INDEX, normalizeIndex } from '../../shared/types';
import { needsYouTotal, widgetMeta } from '../lib/widget-model';
import '../styles.css';

const ROWS = 5;
const openProject = (entry: ArchitectIndexEntry) => void openSeroApp('architect', { projectId: entry.id });
const openIntake = () => void openSeroApp('architect', { intake: true });

/** The one Architect widget. It reads only the index: the list rows and the needs-you total. */
export function ArchitectWidget() {
  const [stored] = useAppState<ArchitectIndex>(DEFAULT_INDEX);
  const index = normalizeIndex(stored);
  const total = needsYouTotal(index);

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        {index.projects.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No projects yet"
            message="Give the Architect an idea and a folder."
            action={
              <Button size="sm" className="ar-btn ar-btn-primary" onClick={openIntake}>
                <Plus className="ar-i" />New project
              </Button>
            }
          />
        ) : (
          <Stack gap="none" scroll>
            {total > 0 && (
              <div className="ar-sec-head" style={{ marginBottom: 6 }}>
                <span className="ar-warn-text">Needs you</span>
                <span className="ar-count" aria-label={`${total} needs you`}>{total}</span>
              </div>
            )}
            <ItemList overflowCount={Math.max(0, index.projects.length - ROWS)}>
              {index.projects.slice(0, ROWS).map((entry) => (
                <ItemListItem
                  key={entry.id}
                  primary={entry.name}
                  secondary={entry.stateLine}
                  trailing={entry.needsYou > 0 ? <span className="ar-count">{entry.needsYou}</span> : <span className="ar-kind">{widgetMeta(entry)}</span>}
                  onClick={() => openProject(entry)}
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
