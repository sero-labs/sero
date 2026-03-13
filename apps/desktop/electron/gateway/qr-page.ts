/**
 * QR code login page generator — creates an HTML page with an inline
 * QR code (using a lightweight SVG generator, no external deps).
 *
 * The page includes a manual-copy fallback for accessibility.
 * The QR encoder is in qr-generator.ts (extracted to keep this under 500 LOC).
 */

import { QR_GENERATOR_SCRIPT } from './qr-generator';

/**
 * Build the HTML for the QR code login page.
 */
export function buildQrPage(loginUrl: string, expiresAt: string, expiryDays: number): string {
  const expiresDate = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sero Remote — Mobile Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0b;
      color: #e4e4e7;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: #71717a; margin-bottom: 24px; }
    .qr-container {
      background: white;
      border-radius: 12px;
      padding: 16px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .qr-container canvas { display: block; }
    .expiry {
      font-size: 12px;
      color: #71717a;
      margin-bottom: 16px;
    }
    .url-box {
      background: #0a0a0b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 12px;
      font-size: 11px;
      color: #a1a1aa;
      word-break: break-all;
      margin-bottom: 12px;
      text-align: left;
      max-height: 80px;
      overflow-y: auto;
    }
    .copy-btn {
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    .copy-btn:hover { background: #1d4ed8; }
    .copy-btn.copied { background: #16a34a; }
    .instructions {
      margin-top: 20px;
      font-size: 12px;
      color: #52525b;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>📱 Sero Remote Login</h1>
    <p class="subtitle">Scan with your phone's camera</p>
    <div class="qr-container">
      <canvas id="qr" width="256" height="256"></canvas>
    </div>
    <p class="expiry">Valid for ${expiryDays} day${expiryDays === 1 ? '' : 's'} — expires ${expiresDate}</p>
    <div class="url-box" id="url">${escapeHtml(loginUrl)}</div>
    <button class="copy-btn" id="copy" onclick="copyUrl()">Copy Login URL</button>
    <div class="instructions">
      <p>Or open your phone browser and paste the URL above.</p>
      <p style="margin-top:8px">The token is stored on your device and will auto-login for ${expiryDays} day${expiryDays === 1 ? '' : 's'}.</p>
    </div>
  </div>
  <script>
    // Minimal QR Code generator (MIT — adapted from qrcode-lite)
    // Generates a QR code on a canvas element.
    ${QR_GENERATOR_SCRIPT}

    const url = ${JSON.stringify(loginUrl)};
    try {
      drawQR('qr', url, 256);
    } catch(e) {
      document.getElementById('qr').parentElement.innerHTML =
        '<p style="padding:40px;color:#71717a">QR generation failed.<br>Use the URL below instead.</p>';
    }

    function copyUrl() {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copy');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy Login URL'; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
