/**
 * The guard harness that runs inside a preview document (spec §7).
 *
 * The frame is already opaque-origin — `sandbox="allow-scripts"` without
 * `allow-same-origin` — so cookies, storage, the parent DOM and same-origin
 * requests are gone before any of this runs, and a `default-src 'none'` policy
 * stops the network at the platform level. This harness exists for what those two
 * leave: telling the *user* what the page tried to do.
 *
 * One rule governs every guard here. A blocked capability must fail the way it
 * fails when it is genuinely unavailable — `fetch` rejects, `open` returns null,
 * a constructor throws. Returning a plausible empty success would let generated
 * code carry on as though it had data, and the page would then render something
 * that looks fine and is wrong. A warning must never mean the capability was
 * allowed, and it must never mean the page was allowed to *believe* it was.
 *
 * The harness is a string rather than a module because it is inlined into a
 * document that has no module graph and no network to fetch one over.
 */

export const PREVIEW_MESSAGE_SOURCE = 'sero-design-preview';

/** Messages the frame sends out. Nothing is ever sent back except a tweak value. */
export interface PreviewMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  kind: 'ready' | 'blocked' | 'error';
  /** What was attempted: `fetch`, `window.open`, `navigation`, `script`. */
  capability: string;
  /** The argument or message, truncated. Empty for `ready`. */
  detail: string;
}

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.source === PREVIEW_MESSAGE_SOURCE &&
    (candidate.kind === 'ready' || candidate.kind === 'blocked' || candidate.kind === 'error') &&
    typeof candidate.capability === 'string' &&
    typeof candidate.detail === 'string'
  );
}

/**
 * `default-src 'none'` with the two exceptions a self-contained document cannot
 * do without: its own inlined script and its own inlined styles. Every fetching
 * directive stays closed, so there is nothing for a blocked call to fall back to.
 *
 * `img-src data:` is deliberate — inline SVG and CSS gradients are how a preview
 * is allowed to have imagery at all (spec §6.3), and a data URI cannot reach the
 * network. `connect-src 'none'` is stated explicitly even though `default-src`
 * covers it, because it is the one people reach for first.
 */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "media-src data:",
  "form-action 'none'",
  "base-uri 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
].join('; ');

/**
 * Written as a single string on purpose: it is inlined verbatim, so it must not
 * depend on a bundler, a module system, or anything the document does not carry.
 */
export const PREVIEW_HARNESS = `(function () {
  var SOURCE = ${JSON.stringify(PREVIEW_MESSAGE_SOURCE)};
  var reported = Object.create(null);

  function report(kind, capability, detail) {
    // One report per capability per load. A render loop calling fetch on every
    // frame would otherwise flood the parent and bury the first, real warning.
    var key = kind + ':' + capability + ':' + detail;
    if (reported[key]) return;
    reported[key] = true;
    try {
      parent.postMessage(
        { source: SOURCE, kind: kind, capability: capability, detail: detail },
        '*'
      );
    } catch (ignored) {}
  }

  function blocked(capability, detail) {
    report('blocked', capability, detail);
    // The message is a side effect. The refusal is the return value, and it has
    // to be a real refusal: an empty success is worse than a failure, because
    // the page carries on and renders something untrue.
    return new Error(
      capability + ' is not available in a Sero design preview. There is no network and no host access.'
    );
  }

  function describe(value) {
    try {
      return String(value).slice(0, 200);
    } catch (ignored) {
      return '(unprintable)';
    }
  }

  function denyAsync(capability) {
    return function () {
      var error = blocked(capability, describe(arguments[0]));
      return Promise.reject(new TypeError(error.message));
    };
  }

  function denyConstructor(capability) {
    return function () {
      throw new TypeError(blocked(capability, describe(arguments[0])).message);
    };
  }

  function replace(target, name, value) {
    try {
      Object.defineProperty(target, name, {
        configurable: false,
        writable: false,
        value: value,
      });
    } catch (ignored) {
      try {
        target[name] = value;
      } catch (alsoIgnored) {}
    }
  }

  replace(window, 'fetch', denyAsync('fetch'));
  replace(window, 'XMLHttpRequest', denyConstructor('XMLHttpRequest'));
  replace(window, 'WebSocket', denyConstructor('WebSocket'));
  replace(window, 'EventSource', denyConstructor('EventSource'));
  replace(window, 'Worker', denyConstructor('Worker'));
  replace(window, 'SharedWorker', denyConstructor('SharedWorker'));
  replace(window, 'RTCPeerConnection', denyConstructor('RTCPeerConnection'));
  replace(window, 'importScripts', denyConstructor('importScripts'));

  replace(window, 'open', function (url) {
    blocked('window.open', describe(url));
    // What a blocked popup returns natively, so feature detection still works.
    return null;
  });

  if (window.navigator) {
    try {
      replace(window.navigator, 'sendBeacon', function (url) {
        blocked('navigator.sendBeacon', describe(url));
        return false;
      });
    } catch (ignored) {}
    try {
      replace(window.navigator, 'serviceWorker', undefined);
    } catch (ignored) {}
  }

  // Navigating the frame is how generated code most often tries to leave, and
  // it looks like an ordinary link. The frame cannot reach the top window, but
  // it can still replace itself and take the preview with it.
  document.addEventListener(
    'click',
    function (event) {
      var node = event.target;
      while (node && node !== document) {
        if (node.tagName === 'A' && node.getAttribute('href')) {
          var href = node.getAttribute('href');
          if (href.charAt(0) !== '#') {
            event.preventDefault();
            blocked('navigation', describe(href));
            return;
          }
        }
        node = node.parentNode;
      }
    },
    true
  );

  document.addEventListener(
    'submit',
    function (event) {
      event.preventDefault();
      blocked('form submission', describe(event.target && event.target.action));
    },
    true
  );

  window.addEventListener('error', function (event) {
    report('error', 'script', describe(event.message || event.error));
  });
  window.addEventListener('unhandledrejection', function (event) {
    report('error', 'script', describe(event.reason));
  });

  // The one thing the frame accepts from outside: a value for a control this
  // revision's own manifest declared. Nothing here evaluates a selector, a
  // stylesheet or code — it sets one custom property to one string.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== SOURCE || data.kind !== 'tweak') return;
    if (typeof data.cssVariable !== 'string' || !/^--[A-Za-z0-9_-]+$/.test(data.cssVariable)) return;
    if (typeof data.value !== 'string' || data.value.length > 128) return;
    if (/[;{}()<>"'\\\\]/.test(data.value)) return;
    document.documentElement.style.setProperty(data.cssVariable, data.value);
  });

  function announce() {
    report('ready', 'document', '');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce);
  } else {
    announce();
  }
})();`;
