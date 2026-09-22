/**
 * The running project's page, in a frame.
 *
 * One component so the preview card and a milestone's capture row show the same
 * thing rather than two iframes that could be sandboxed differently.
 */

export function PreviewFrame({ url, title = 'Project preview' }: { url: string; title?: string }) {
  return (
    <iframe
      title={title}
      src={url}
      sandbox="allow-forms allow-modals allow-popups allow-scripts"
      className="mt-3 h-[600px] w-full rounded-lg border"
    />
  );
}
