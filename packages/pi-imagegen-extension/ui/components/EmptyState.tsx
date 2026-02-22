/**
 * EmptyState — shown when the gallery has no images yet.
 */

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 animate-fade-in-up">
      <div className="text-4xl">🎨</div>
      <p className="text-sm text-muted-foreground">
        No images yet — describe something to get started
      </p>
    </div>
  );
}
