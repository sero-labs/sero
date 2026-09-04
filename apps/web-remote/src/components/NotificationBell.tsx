/**
 * Notification bell — unread count, and the feed behind it.
 *
 * A popover at desktop widths, a sheet on a phone, matching how the
 * right-hand panels already behave.
 */

import { useCallback, useState } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@sero-ai/ui/components/ui/sheet';
import { useIsMobile } from '@sero-ai/ui/hooks/use-mobile';
import { cn } from '@sero-ai/ui/lib/utils';
import { NotificationFeed } from './NotificationFeed';
import { useNotificationsStore, selectUnread } from '@/stores/notifications';

/** Above this, the badge stops counting. */
const MAX_BADGE = 99;

export function NotificationBell() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const unreadCount = useNotificationsStore((s) => selectUnread(s).length);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Opening the feed is reading it. Every other client clears too.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) markAllRead();
    },
    [markAllRead],
  );

  const trigger = (
    <button
      type="button"
      data-testid="notification-bell"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      className={cn(
        'relative flex size-7 items-center justify-center rounded-md transition-colors',
        'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
        unreadCount > 0 && 'text-[var(--text-secondary)]',
      )}
    >
      <Bell className="size-4" />
      {unreadCount > 0 && (
        <Badge
          data-testid="notification-badge"
          className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums"
        >
          {unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}
        </Badge>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="right" className="w-80 p-0" showCloseButton={false}>
            <SheetHeader className="border-b border-[var(--border-subtle)] px-3 py-2">
              <SheetTitle className="text-base">Notifications</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <NotificationFeed />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-80 overflow-y-auto p-0">
        <p className="border-b border-[var(--border-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
          Notifications
        </p>
        <NotificationFeed />
      </PopoverContent>
    </Popover>
  );
}
