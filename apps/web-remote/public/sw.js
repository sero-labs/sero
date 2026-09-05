/**
 * Sero Remote service worker.
 *
 * Two jobs, and no more:
 *
 * 1. Keep the app shell, so the app opens on a bad connection. Nothing
 *    else is cached: every screen needs the gateway, so a cached page
 *    with no gateway would only show stale work.
 * 2. Show a push, and open the right place when it is tapped.
 * 3. Take a file from the phone's share sheet and hand it to the app.
 *
 * A push payload never carries message text. It travels through the
 * browser vendor's push service, which is outside your tailnet.
 */

/** Bumped whenever the shell changes shape. Old caches are dropped. */
const CACHE = 'sero-shell-v1';

/** The shell: enough to paint something before the gateway answers. */
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing file must not stop the worker from installing.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.flatMap((name) => (name === CACHE ? [] : [caches.delete(name)])),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Where a shared file waits until the app picks it up. */
const SHARE_CACHE = 'sero-share';

/** The one request the app fetches a shared file back from. */
const SHARE_ITEM = '/shared-file';

/**
 * Take a share, keep the file, and send the browser to the app.
 *
 * The share arrives as a POST, which a single-page app cannot read. So
 * the file is put in a cache under a fixed URL and the app fetches it
 * from there on the next load.
 */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (file && typeof file !== 'string') {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARE_ITEM,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Shared-Name': encodeURIComponent(file.name || 'shared-file'),
          },
        }),
      );
      return Response.redirect('/?share=file', 303);
    }
  } catch {
    /* fall through to the plain open */
  }
  return Response.redirect('/', 303);
}

/**
 * Network first, cache second, and only for the page itself.
 *
 * Everything else — the gateway socket above all — is left alone.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }

  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() => caches.match('/index.html').then(
      (cached) => cached ?? new Response('Sero Remote is offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    )),
  );
});

/** Read a push payload. An unreadable one still shows a line. */
function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === 'object') return data;
  } catch {
    /* not JSON — fall through */
  }
  return { title: 'Sero', kind: 'notification', path: '/' };
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Sero', {
      body: 'Open Sero Remote to see it.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One notification per kind, so a busy agent does not fill the
      // lock screen with the same line.
      tag: payload.kind || 'notification',
      data: { path: payload.path || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        // An open tab is focused and moved, rather than a second opened.
        if ('focus' in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
