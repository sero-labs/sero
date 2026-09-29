/**
 * useSkillView: what the Skills list shows. The workspace filter picks which
 * projects' skills appear, the search narrows them, and both feed the counts.
 */

import { useMemo, useState } from 'react';
import {
  ALL_PROJECTS,
  matchesQuery,
  skillsInView,
  statusOf,
  unusedCount,
  type SkillEntry,
  type SkillStatus,
} from '../lib/skill-catalogue';

export interface SkillView {
  workspace: string;
  setWorkspace: (workspace: string) => void;
  query: string;
  setQuery: (query: string) => void;
  projectNames: ReadonlyMap<string, string>;
  /** Skills the workspace filter shows, before search. */
  inView: SkillEntry[];
  /** Skills that also match the search. */
  shown: SkillEntry[];
  statusFor: (skill: SkillEntry) => SkillStatus | null;
  /** "12 skills, 2 not used", or "3 of 12 skills" while searching. */
  countText: string;
}

export function useSkillView(skills: SkillEntry[], projects: Array<{ id: string; name: string }>): SkillView {
  const [chosen, setWorkspace] = useState(ALL_PROJECTS);
  const [query, setQuery] = useState('');

  // A project that lost its last skill falls back to All projects.
  const workspace = chosen === ALL_PROJECTS || projects.some((project) => project.id === chosen) ? chosen : ALL_PROJECTS;
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const inView = useMemo(() => skillsInView(skills, workspace), [skills, workspace]);
  const shown = useMemo(
    () => inView.filter((skill) => matchesQuery(skill, query, projectNames)),
    [inView, query, projectNames],
  );
  const unused = useMemo(() => unusedCount(inView, workspace), [inView, workspace]);

  const noun = inView.length === 1 ? 'skill' : 'skills';
  const base = query.trim() ? `${shown.length} of ${inView.length} ${noun}` : `${inView.length} ${noun}`;

  return {
    workspace,
    setWorkspace,
    query,
    setQuery,
    projectNames,
    inView,
    shown,
    statusFor: (skill) => statusOf(skill, inView, workspace),
    countText: unused > 0 ? `${base}, ${unused} not used` : base,
  };
}
