import { describe, expect, it } from 'vitest';

import { LIST_ROWS } from '../__preview__/fixture';
import { parseViewId, viewId } from '../lib/navigation';
import { projectRecordPath } from '../lib/use-project-record';
import { needsYouTotal, widgetMeta } from '../lib/widget-model';

describe('navigation', () => {
  it('round-trips the list, the intake dialog and a project page through host history', () => {
    for (const view of [
      { mode: 'list' as const },
      { mode: 'list' as const, intake: true },
      { mode: 'project' as const, projectId: 'hollow-depths' },
      { mode: 'project' as const, projectId: 'hollow-depths', focusMilestoneId: 'm4' },
      { mode: 'history' as const, projectId: 'hollow-depths' },
      { mode: 'models' as const, projectId: 'hollow-depths' },
      { mode: 'inspector' as const, projectId: 'hollow-depths' },
    ]) {
      expect(parseViewId(viewId(view))).toEqual(view.mode === 'list' && !view.intake ? { mode: 'list' } : view);
    }
    expect(parseViewId('elsewhere/1')).toBeNull();
  });

  it('encodes History as its own view and a milestone focus on the project page', () => {
    expect(viewId({ mode: 'history', projectId: 'hollow-depths' })).toBe('projects/hollow-depths/history');
    expect(parseViewId('projects/hollow-depths/history')).toEqual({ mode: 'history', projectId: 'hollow-depths' });
    expect(viewId({ mode: 'project', projectId: 'hollow-depths', focusMilestoneId: 'm4' })).toBe('projects/hollow-depths/milestone/m4');
    expect(parseViewId('projects/hollow-depths/milestone/m4')).toEqual({ mode: 'project', projectId: 'hollow-depths', focusMilestoneId: 'm4' });
  });

  it('finds the record beside the index the runtime writes', () => {
    expect(projectRecordPath('/home/dan/.sero-ui/apps/architect/state.json', 'hollow-depths'))
      .toBe('/home/dan/.sero-ui/apps/architect/projects/hollow-depths.json');
  });
});

describe('the widget', () => {
  it('reads only the index: the needs-you total and one meta line per row', () => {
    expect(needsYouTotal({ version: 1, projects: LIST_ROWS })).toBe(1);
    expect(LIST_ROWS.map(widgetMeta)).toEqual(['decision · $19.7/$40', 'build · $6.1/$25', 'maintain · $31.8/$35', 'paused · $1.2']);
  });
});
