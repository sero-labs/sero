import type { ProjectRecord } from './record';

/** Clear only the source whose complete cumulative usage is now known. */
export function setAccountingIncomplete(record: ProjectRecord, source: string, incomplete: boolean): ProjectRecord {
  const sources = new Set(record.budget.incompleteSources ?? (record.budget.incomplete === false ? [] : ['historical']));
  if (incomplete) sources.add(source);
  else sources.delete(source);
  return { ...record, budget: { ...record.budget, incomplete: sources.size > 0, incompleteSources: [...sources] } };
}
