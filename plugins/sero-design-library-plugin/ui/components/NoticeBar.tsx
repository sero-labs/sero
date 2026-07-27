import { AlertTriangle, CircleX, Info, X } from 'lucide-react';
import type { Notice } from '../../shared/state';

const ICONS = { info: Info, warning: AlertTriangle, error: CircleX } as const;

export function NoticeBar({
  notices,
  onDismiss,
}: {
  notices: Notice[];
  onDismiss: (noticeId: string) => void;
}) {
  if (notices.length === 0) return null;

  return (
    <div className="dl-notices" role="status">
      {notices.slice(-3).map((notice) => {
        const Icon = ICONS[notice.level];
        return (
          <div className={`dl-inline-notice dl-inline-notice--${notice.level}`} key={notice.id}>
            <Icon aria-hidden="true" size={15} />
            <div>
              <strong>{notice.message}</strong>
              {notice.details && notice.details.length > 0 ? (
                <ul>{notice.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              ) : null}
            </div>
            <button aria-label="Dismiss" onClick={() => onDismiss(notice.id)} type="button">
              <X aria-hidden="true" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
