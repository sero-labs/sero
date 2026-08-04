interface NavigationRailRowProps {
  active: boolean;
  label: string;
  count: number;
  icon?: React.ReactNode;
  onClick(): void;
}

export function NavigationRailRow({
  active,
  label,
  count,
  icon,
  onClick,
}: NavigationRailRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
    </button>
  );
}

export function NavigationRailHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground flex items-center justify-between px-2 pt-4 pb-1 text-xs font-medium tracking-wide uppercase">
      <span>{children}</span>
      {action}
    </div>
  );
}
