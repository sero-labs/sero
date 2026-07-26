import { useAppState } from '@sero-ai/app-runtime';
import {
  EmptyState,
  Inline,
  ItemList,
  ItemListItem,
  Stack,
  Text,
  WidgetContent,
} from '@sero-ai/ui';
import { CheckCircle2 } from 'lucide-react';

import type { NotesState } from '../../shared/types';
import { DEFAULT_STATE, normalizeNotesState } from '../../shared/types';
// Every directly-exposed MF entry must import its own stylesheet so external
// remotes ship their own CSS assets.
import '../styles.css';

// Canonical minimal widget: presentation is composed entirely from @sero-ai/ui
// dashboard components. The plugin owns only data (which notes are open).
export function NotesWidget() {
  const [state] = useAppState<NotesState>(DEFAULT_STATE);
  const currentState = normalizeNotesState(state);
  const open = currentState.notes.filter((n) => !n.done);

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline gap="xs" align="baseline">
          <Text variant="numeric" className="text-lg">
            {open.length}
          </Text>
          <Text variant="muted">open / {currentState.notes.length} total</Text>
        </Inline>

        {open.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All done" />
        ) : (
          <Stack gap="none" scroll>
            <ItemList overflowCount={Math.max(0, open.length - 5)}>
              {open.slice(0, 5).map((note) => (
                <ItemListItem key={note.id} primary={note.title} />
              ))}
            </ItemList>
          </Stack>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default NotesWidget;
