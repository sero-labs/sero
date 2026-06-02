import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

type BaseProps = {
  tone?: 'default' | 'destructive';
  className?: string;
  children: ReactNode;
};

type ButtonProps = BaseProps & {
  as?: 'button';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

type SpanProps = BaseProps & {
  as: 'span';
} & Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'children'>;

type AnchorProps = BaseProps & {
  as: 'a';
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>;

type IconActionProps = (ButtonProps | SpanProps | AnchorProps) & {
  ref?: Ref<HTMLButtonElement | HTMLSpanElement | HTMLAnchorElement>;
};

export function IconAction({ as = 'button', tone = 'default', className, children, ref, ...props }: IconActionProps) {
  const classes = cn(
    'rounded p-0.5 transition-colors',
    tone === 'destructive'
      ? 'text-status-error hover:bg-status-error/15'
      : 'text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]',
    className,
  );

  if (as === 'span') {
    return (
      <span
        ref={ref as Ref<HTMLSpanElement>}
        className={classes}
        {...(props as Omit<SpanProps, keyof BaseProps | 'as'>)}
      >
        {children}
      </span>
    );
  }

  if (as === 'a') {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        {...(props as Omit<AnchorProps, keyof BaseProps | 'as'>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={classes}
      {...(props as Omit<ButtonProps, keyof BaseProps | 'as'>)}
    >
      {children}
    </button>
  );
}
