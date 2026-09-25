import { startViewerShell } from './viewer-shell';

startViewerShell().catch((error: unknown) => {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = error instanceof Error ? error.message : String(error);
  status.classList.add('error');
  status.hidden = false;
});
