import { homeRelative } from "../lib/format";

type HostShell = { showItemInFolder(path: string): Promise<void> };

/**
 * The host's shell bridge, when the page runs inside Sero. Despite its name,
 * `showItemInFolder` opens the folder itself in Finder (the host calls
 * `shell.openPath`), so the project folder opens rather than its parent.
 */
function hostShell(): HostShell | undefined {
  return (window as Window & { sero?: { shell?: HostShell } }).sero?.shell;
}

/** The project folder. It opens in Finder when the host can open it. */
export function FolderLink({ folder }: { folder: string }) {
  const shell = hostShell();
  const label = homeRelative(folder, null);
  if (!shell) return <code>{label}</code>;
  return (
    <button type="button" className="ar-folder" title="Open in Finder" onClick={() => void shell.showItemInFolder(folder)}>
      <code>{label}</code>
    </button>
  );
}
