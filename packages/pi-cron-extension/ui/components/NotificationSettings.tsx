/**
 * NotificationSettings — inline settings for notification sound.
 *
 * Rendered in the SchedulerBar area. Lets users toggle sound
 * on/off and pick a macOS system sound.
 */

import { useState } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { Switch } from '@sero/ui/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero/ui/components/ui/popover';
import type { NotificationSettings as Settings } from '../../shared/types';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUNDS,
} from '../../shared/types';

interface NotificationSettingsProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function NotificationSettings({
  settings,
  onChange,
}: NotificationSettingsProps) {
  const [open, setOpen] = useState(false);
  const effective = { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Notification settings"
        >
          {effective.soundEnabled ? '🔔' : '🔕'}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-56 p-3"
      >
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground">
            Notification Sound
          </p>

          {/* Sound enabled toggle */}
          <label className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Play sound</span>
            <Switch
              checked={effective.soundEnabled}
              onCheckedChange={(enabled) =>
                onChange({ ...effective, soundEnabled: enabled })
              }
              className="scale-75"
            />
          </label>

          {/* Sound picker */}
          {effective.soundEnabled && (
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Sound</span>
              <div className="grid grid-cols-2 gap-1">
                {NOTIFICATION_SOUNDS.map((sound) => (
                  <button
                    key={sound}
                    onClick={() => onChange({ ...effective, soundName: sound })}
                    className={`rounded px-2 py-1 text-left text-xs transition-colors ${
                      effective.soundName === sound
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {sound}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
