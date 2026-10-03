import { describe, expect, it } from 'vitest';

import { LIST_ROWS } from '../__preview__/fixture';
import { parseViewId, viewId } from '../lib/navigation';
import { projectRecordPath } from '../lib/use-project-record';
import { needsYouTotal, widgetMeta } from '../lib/widget-model';

describe('navigation', () => {
  it('round-trips the list, the intake dialog, a project page and a work tab through host history', () => {
    for (const view of [
      { mode: 'list' as const },
      { mode: 'list' as const, intake: true },
      { mode: 'project' as const, projectId: 'hollow-depths' },
      { mode: 'work' as const, projectId: 'hollow-depths', tab: 'live' as const },
      { mode: 'history' as const, projectId: 'hollow-depths' },
      { mode: 'models' as const, projectId: 'hollow-depths' },
      { mode: 'inspector' as const, projectId: 'hollow-depths' },
    ]) {
      expect(parseViewId(viewId(view))).toEqual(view.mode === 'list' && !view.intake ? { mode: 'list' } : view);
    }
    expect(parseViewId('elsewhere/1')).toBeNull();
  });

  it('encodes History and each Work tab as their own views, with a milestone focus on Evidence', () => {
    expect(viewId({ mode: 'history', projectId: 'hollow-depths' })).toBe('projects/hollow-depths/history');
    expect(parseViewId('projects/hollow-depths/history')).toEqual({ mode: 'history', projectId: 'hollow-depths' });
    expect(viewId({ mode: 'work', projectId: 'hollow-depths', tab: 'evidence', focusMilestoneId: 'm4' })).toBe('projects/hollow-depths/work/evidence/m4');
    expect(parseViewId('projects/hollow-depths/work/evidence/m4')).toEqual({ mode: 'work', projectId: 'hollow-depths', tab: 'evidence', focusMilestoneId: 'm4' });
    expect(parseViewId('projects/hollow-depths/work/plan')).toEqual({ mode: 'work', projectId: 'hollow-depths', tab: 'plan' });
    // A tab this build does not know opens Live instead of a blank page.
    expect(parseViewId('projects/hollow-depths/work/other')).toEqual({ mode: 'work', projectId: 'hollow-depths', tab: 'live' });
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
