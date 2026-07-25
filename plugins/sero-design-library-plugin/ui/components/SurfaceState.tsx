import { Button } from '@sero-ai/ui/components/ui/button.js';
import { AlertTriangle, CircleX, ImageOff, LoaderCircle } from 'lucide-react';

type SurfaceStateKind = 'empty' | 'loading' | 'warning' | 'error';

interface SurfaceStateProps {
  kind: SurfaceStateKind;
  title: string;
  detail: string;
  actionLabel?: string;
}

const ICONS = {
  empty: ImageOff,
  loading: LoaderCircle,
  warning: AlertTriangle,
  error: CircleX,
} satisfies Record<SurfaceStateKind, typeof ImageOff>;

export function SurfaceState({ kind, title, detail, actionLabel }: SurfaceStateProps) {
  const Icon = ICONS[kind];
  return (
    <div className={`dl-state dl-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="dl-state__icon">
        <Icon className={kind === 'loading' ? 'dl-spin' : undefined} size={18} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {actionLabel ? <Button size="sm" variant="outline">{actionLabel}</Button> : null}
    </div>
  );
}
