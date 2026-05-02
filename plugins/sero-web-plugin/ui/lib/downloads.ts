import type { WebDownload } from '../../shared/types';

export function isVisibleDownload(download: WebDownload): boolean {
  return Boolean(download.absolutePath || download.relativePath)
    || download.status === 'queued'
    || download.status === 'downloading';
}
