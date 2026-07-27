/**
 * The guard script injected into every preview document.
 *
 * It runs inside an opaque-origin, `allow-scripts`-only iframe whose CSP
 * already blocks network, workers and framing. The script does not create the
 * boundary — it reports attempts to cross it so the UI can explain what was
 * blocked, and it applies validated tweak values.
 *
 * Kept as source text because it is evaluated inside the frame, not bundled
 * with the plugin UI.
 */

import { PREVIEW_CHANNEL } from './preview-protocol';

export const PREVIEW_HARNESS_SOURCE = `(function () {
  var CHANNEL = ${JSON.stringify(PREVIEW_CHANNEL)};
  var manifest = window.__SERO_TWEAKS__ || { controls: [] };
  var byId = {};
  for (var i = 0; i < manifest.controls.length; i += 1) {
    byId[manifest.controls[i].id] = manifest.controls[i];
  }

  function post(message) {
    message.channel = CHANNEL;
    try { window.parent.postMessage(message, '*'); } catch (error) { /* detached */ }
  }

  function blocked(capability, detail) {
    post({ type: 'blocked', capability: capability, detail: String(detail) });
  }

  // ── Capability reporting ────────────────────────────────────
  // The CSP already refuses these. Replacing them turns a silent console
  // failure into an actionable warning outside the frame.
  function refuseNetwork(name) {
    return function () {
      blocked('network', name + ' was blocked. Previews have no network access.');
      throw new Error(name + ' is not available in a Sero preview.');
    };
  }

  window.fetch = refuseNetwork('fetch()');
  window.XMLHttpRequest = refuseNetwork('XMLHttpRequest');
  window.WebSocket = refuseNetwork('WebSocket');
  window.EventSource = refuseNetwork('EventSource');
  window.Worker = function () {
    blocked('worker', 'Web Workers are not available in a Sero preview.');
    throw new Error('Worker is not available in a Sero preview.');
  };
  if (window.navigator && window.navigator.sendBeacon) {
    window.navigator.sendBeacon = function () {
      blocked('network', 'navigator.sendBeacon() was blocked.');
      return false;
    };
  }
  window.open = function () {
    blocked('popup', 'window.open() was blocked.');
    return null;
  };

  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      // Reading the property already throws on an opaque origin; the probe
      // tells us whether to report proactively.
      void window[name];
    } catch (error) {
      blocked('storage', name + ' is not available on an isolated preview origin.');
    }
  });

  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node.tagName !== 'A') node = node.parentNode;
    if (!node || !node.getAttribute) return;
    var href = node.getAttribute('href') || '';
    if (href && href.charAt(0) !== '#') {
      event.preventDefault();
      blocked('navigation', 'A link to ' + href + ' was blocked.');
    }
  }, true);

  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String((event && event.message) || 'Unknown preview error') });
  });

  // ── Tweak channel ───────────────────────────────────────────
  function cssText(definition, value) {
    if (definition.control.type === 'range') {
      return String(value) + (definition.control.unit || '');
    }
    return String(value);
  }

  function accepts(control, value) {
    if (control.type === 'range') {
      return typeof value === 'number' && isFinite(value)
        && value >= control.min && value <= control.max;
    }
    if (control.type === 'toggle') {
      return value === control.offValue || value === control.onValue;
    }
    if (control.type === 'colour') {
      return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
    }
    if (control.type === 'choice') {
      for (var i = 0; i < control.options.length; i += 1) {
        if (control.options[i].value === value) return true;
      }
    }
    return false;
  }

  function apply(id, value) {
    var definition = byId[id];
    if (!definition) {
      post({ type: 'rejected', id: String(id), reason: 'Unknown control.' });
      return;
    }
    if (!accepts(definition.control, value)) {
      post({ type: 'rejected', id: String(id), reason: 'Value rejected by the control schema.' });
      return;
    }
    document.documentElement.style.setProperty(definition.cssVariable, cssText(definition, value));
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.type === 'tweak-value') {
      apply(data.id, data.value);
      return;
    }
    if (data.type === 'tweak-reset') {
      if (typeof data.id === 'string') {
        var definition = byId[data.id];
        if (definition) document.documentElement.style.removeProperty(definition.cssVariable);
        return;
      }
      for (var key in byId) {
        if (Object.prototype.hasOwnProperty.call(byId, key)) {
          document.documentElement.style.removeProperty(byId[key].cssVariable);
        }
      }
    }
  });

  var ids = [];
  for (var key in byId) {
    if (Object.prototype.hasOwnProperty.call(byId, key)) ids.push(key);
  }
  post({ type: 'ready', controlIds: ids });
})();`;
