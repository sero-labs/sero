import { Button } from '@sero-ai/ui/components/ui/button';

import type { CronJob } from '../../shared/types';
import { JobCard } from './JobCard';

interface JobsTabProps {
  jobs: CronJob[];
  schedulerActive: boolean;
  onEdit: (name: string) => void;
  onToggleEnabled: (name: string) => void;
  onRemove: (name: string) => void;
  onRun: (name: string) => void;
  onAdd: () => void;
}

export function JobsTab({
  jobs,
  schedulerActive,
  onEdit,
  onToggleEnabled,
  onRemove,
  onRun,
  onAdd,
}: JobsTabProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-cron-fade-in">
        <div className="mb-4 text-4xl">⏰</div>
        <h2 className="text-base font-medium text-foreground">No cron jobs yet</h2>
        <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
          Create a job to schedule recurring agent prompts.
        </p>
        <Button size="sm" className="mt-4" onClick={onAdd}>
          + New Job
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-cron-fade-in">
      {jobs.map((job) => (
        <JobCard
          key={job.name}
          job={job}
          onEdit={onEdit}
          onToggleEnabled={onToggleEnabled}
          onRemove={onRemove}
          onRun={onRun}
          schedulerActive={schedulerActive}
        />
      ))}
    </div>
  );
}
