/**
 * The phone's share sheet, arriving in the app.
 *
 * A share is a POST, which a single-page app cannot read. The service
 * worker takes the file, puts it in a cache, and sends the browser to
 * `/?share=file`. This reads it back out.
 *
 * The cache entry is removed once read, so a reload does not upload the
 * same file twice.
 */

/** Where the worker leaves a shared file. Must match `sw.js`. */
const SHARE_CACHE = 'sero-share';
const SHARE_ITEM = '/shared-file';

/** The query the worker redirects with. */
const SHARE_FLAG = 'share';

/** True when this load came from a share. */
export function hasSharedFile(search: string): boolean {
  return new URLSearchParams(search).get(SHARE_FLAG) === 'file';
}

/** Drop `?share=file` from the address bar, leaving the rest alone. */
export function clearShareFlag(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_FLAG);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/**
 * The shared file, or null when there is none.
 *
 * The name travels in a header, because a cached `Response` keeps no
 * file name of its own.
 */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_ITEM);
    if (!response) return null;

    await cache.delete(SHARE_ITEM);

    const rawName = response.headers.get('X-Shared-Name');
    const name = rawName ? decodeURIComponent(rawName) : 'shared-file';
    const blob = await response.blob();

    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}
