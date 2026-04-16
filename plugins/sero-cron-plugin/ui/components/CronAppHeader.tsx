import { Button } from '@sero-ai/ui/components/ui/button';

type CronAppTab = 'jobs' | 'reminders' | 'history';

interface CronAppHeaderProps {
  activeTab: CronAppTab;
  historyCount: number;
  onAddReminder: () => void;
  onAddJob: () => void;
  onClearHistory: () => void;
}

export function CronAppHeader({
  activeTab,
  historyCount,
  onAddReminder,
  onAddJob,
  onClearHistory,
}: CronAppHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">⏰ Scheduler</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cron jobs, reminders, and notifications
        </p>
      </div>
      <div className="flex gap-2">
        {activeTab === 'reminders' && (
          <Button size="sm" onClick={onAddReminder}>
            + Reminder
          </Button>
        )}
        {activeTab === 'jobs' && (
          <Button size="sm" onClick={onAddJob}>
            + Job
          </Button>
        )}
        {activeTab === 'history' && historyCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onClearHistory}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
