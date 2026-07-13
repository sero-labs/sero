type CronAppTab = 'jobs' | 'reminders' | 'loops' | 'history';

interface CronTabsProps {
  activeTab: CronAppTab;
  totalJobs: number;
  totalReminders: number;
  totalLoops: number;
  historyCount: number;
  onSelect: (tab: CronAppTab) => void;
}

const TAB_LABELS: Array<{ key: CronAppTab; label: (counts: Omit<CronTabsProps, 'activeTab' | 'onSelect'>) => string }> = [
  {
    key: 'reminders',
    label: ({ totalReminders }) => `Reminders (${totalReminders})`,
  },
  {
    key: 'jobs',
    label: ({ totalJobs }) => `Jobs (${totalJobs})`,
  },
  {
    key: 'loops',
    label: ({ totalLoops }) => `Loops (${totalLoops})`,
  },
  {
    key: 'history',
    label: ({ historyCount }) => `History (${historyCount})`,
  },
];

export function CronTabs({
  activeTab,
  totalJobs,
  totalReminders,
  totalLoops,
  historyCount,
  onSelect,
}: CronTabsProps) {
  const counts = { totalJobs, totalReminders, totalLoops, historyCount };

  return (
    <div className="mb-3 flex gap-1 border-b border-border">
      {TAB_LABELS.map((tab) => (
        <button type="button"
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === tab.key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label(counts)}
        </button>
      ))}
    </div>
  );
}
