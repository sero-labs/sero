import type { ProjectRecord } from './record';

/** Clear only the source whose complete cumulative usage is now known. */
export function setAccountingIncomplete(record: ProjectRecord, source: string, incomplete: boolean): ProjectRecord {
  const sources = new Set(record.budget.incompleteSources ?? (record.budget.incomplete === false ? [] : ['historical']));
  if (incomplete) sources.add(source);
  else sources.delete(source);
  const incompleteSources = [...sources];
  const unchanged = record.budget.incomplete === (incompleteSources.length > 0)
    && record.budget.incompleteSources?.length === incompleteSources.length
    && record.budget.incompleteSources.every((entry, index) => entry === incompleteSources[index]);
  if (unchanged) return record;
  return { ...record, budget: { ...record.budget, incomplete: incompleteSources.length > 0, incompleteSources } };
}
