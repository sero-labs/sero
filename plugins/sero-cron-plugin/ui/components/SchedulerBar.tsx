/**
 * SchedulerBar — status indicator, autostart toggle, notification settings,
 * and start/stop button.
 */

import { Bell, Pause, Play } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { cn } from '@sero-ai/ui/lib/utils';
import type { NotificationSettings as NotifSettings } from '../../shared/types';
import { NotificationSettings } from './NotificationSettings';

interface SchedulerBarProps {
  active: boolean;
  autostart: boolean;
  jobCount: number;
  activeCount: number;
  disabledCount: number;
  reminderCount?: number;
  notificationSettings?: NotifSettings;
  onToggle: () => void;
  onAutostartChange: (enabled: boolean) => void;
  onNotificationSettingsChange?: (settings: NotifSettings) => void;
}

export function SchedulerBar({
  active,
  autostart,
  jobCount,
  activeCount,
  disabledCount,
  reminderCount,
  notificationSettings,
  onToggle,
  onAutostartChange,
  onNotificationSettingsChange,
}: SchedulerBarProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
      {/* Status dot + label */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            active
              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
              : 'bg-muted-foreground/40',
          )}
        />
        <span className="text-sm font-medium text-foreground">
          {active ? 'Scheduler Active' : 'Scheduler Inactive'}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {jobCount} {jobCount === 1 ? 'job' : 'jobs'}
        </Badge>
        {activeCount > 0 && (
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-xs text-emerald-500"
          >
            {activeCount} active
          </Badge>
        )}
        {disabledCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground"
          >
            {disabledCount} paused
          </Badge>
        )}
        {(reminderCount ?? 0) > 0 && (
          <Badge
            variant="outline"
            className="inline-flex items-center gap-1 border-amber-500/30 text-xs text-amber-500"
          >
            <Bell className="size-3" />
            {reminderCount} reminder{reminderCount === 1 ? '' : 's'}
          </Badge>
        )}
      </div>

      <div className="flex-1" />

      {/* Notification sound settings */}
      {onNotificationSettingsChange && notificationSettings && (
        <NotificationSettings
          settings={notificationSettings}
          onChange={onNotificationSettingsChange}
        />
      )}

      {/* Autostart toggle */}
      <label className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Autostart</span>
        <Switch
          checked={autostart}
          onCheckedChange={onAutostartChange}
          className="scale-75"
        />
      </label>

      {/* Start / Stop button */}
      <Button
        variant={active ? 'destructive' : 'default'}
        size="sm"
        onClick={onToggle}
        className={cn(
          'text-xs',
          !active &&
            'bg-emerald-600 text-white hover:bg-emerald-700',
        )}
      >
        {active ? (
          <>
            <Pause className="size-3.5" />
            Stop
          </>
        ) : (
          <>
            <Play className="size-3.5" />
            Start
          </>
        )}
      </Button>
    </div>
  );
}
