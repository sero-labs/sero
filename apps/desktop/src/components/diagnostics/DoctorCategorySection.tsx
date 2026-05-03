import type { DoctorCategory, DoctorResult } from '@/types/ipc';
import { DoctorResultRow } from './DoctorResultRow';

const LABELS: Record<DoctorCategory, string> = {
  system: 'System',
  runtime: 'Runtime',
  node: 'Node',
  profile: 'Profile',
  workspace: 'Workspace',
  providers: 'Providers',
  plugins: 'Plugins',
  environment: 'Environment',
};

interface Props {
  category: DoctorCategory;
  results: DoctorResult[];
  onCopyFix?: (fix: string) => void;
}

export function DoctorCategorySection({ category, results, onCopyFix }: Props) {
  if (results.length === 0) return null;
  return (
    <section className="mb-4">
      <h3 className="text-sm font-semibold mb-1">{LABELS[category]}</h3>
      <ul className="rounded border border-border/50 bg-card px-3">
        {results.map((result) => (
          <DoctorResultRow
            key={result.id}
            result={result}
            onCopyFix={onCopyFix}
          />
        ))}
      </ul>
    </section>
  );
}
