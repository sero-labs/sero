import { useMemo, useState } from 'react';
import { AppProvider, type AppProfilePreferenceValue } from '@sero-ai/app-runtime';
import { Inspector } from '../components/Inspector';
import type { ArchitectActions } from '../lib/actions';
import type { ProjectRecord } from '../../shared/record';
import { readActivity, type TracePage } from '../lib/trace';
import { INSPECTOR_PROJECT, inspectorPage, lifetimeView, longRunPage } from './inspector-fixture';

/**
 * A real run, when one was exported next to this file: a runtime `queryTrace`
 * answer over a copied profile, saved as `*.local.json`. Never committed.
 */
const LOCAL = import.meta.glob<{ project: ProjectRecord; answer: Omit<TracePage, 'activity'> & { activity: unknown } }>('./*.local.json', { eager: true, import: 'default' });

function localRun(): { project: ProjectRecord; page: TracePage } | null {
  const found = Object.values(LOCAL)[0];
  if (!found) return null;
  const { answer } = found;
  return { project: found.project, page: { ...answer, records: answer.records ?? [], nextAfterSeq: answer.nextAfterSeq ?? null, incomplete: answer.incomplete ?? false, activity: readActivity(answer.activity) } };
}

/**
 * The run inspector against the fixture journal. `?run=long` serves the
 * 1,240-activity run. Preferences live in memory here; the host keeps them in
 * its layout service.
 */
export function InspectorPreview({ actions }: { actions: ArchitectActions }) {
  const [values, setValues] = useState<Record<string, AppProfilePreferenceValue>>({});
  const which = new URLSearchParams(window.location.search).get('run');
  const real = useMemo(() => (which === 'frogger' ? localRun() : null), [which]);
  const page = useMemo(() => real?.page ?? (which === 'long' ? longRunPage() : inspectorPage()), [real, which]);
  const lifetime = useMemo(() => lifetimeView(), []);
  const inspectorActions: ArchitectActions = {
    ...actions,
    trace: async () => ({ ok: true, text: 'ok', page }),
    lifetime: async () => ({ ok: true, text: 'ok', lifetime }),
  };
  return (
    <AppProvider value={{
      appId: 'architect', workspaceId: 'global', workspacePath: '', stateFilePath: '',
      profilePreferences: { values, set: (key, value) => setValues((current) => ({ ...current, [key]: value })) },
    }}>
      <Inspector record={real?.project ?? INSPECTOR_PROJECT} actions={inspectorActions} onBack={() => undefined} />
    </AppProvider>
  );
}
