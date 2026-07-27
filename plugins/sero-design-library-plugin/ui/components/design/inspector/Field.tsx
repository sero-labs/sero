/**
 * The inspector's field: an uppercase label with the value beneath it.
 *
 * Shared by every tab of the variant inspector and written to the reference
 * inspector's pattern, because they are the same kind of thing — the panel
 * beside the work, saying what the work is. Two panels in one plugin that read
 * differently is just a bug the user has to look at.
 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </h4>
      {children}
    </section>
  );
}

/** One bordered block, as every section of the reference inspector is drawn. */
export function Block({ children }: { children: React.ReactNode }) {
  return <div className="border-border border-b px-4 py-3 last:border-b-0">{children}</div>;
}
