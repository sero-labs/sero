/**
 * QR code login page generator — creates an HTML page with an inline
 * QR code (using a lightweight SVG generator, no external deps).
 *
 * The page includes a manual-copy fallback for accessibility.
 */

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

/**
 * Inline QR code generator script (runs in the browser).
 * Generates QR codes as canvas drawings. No external dependencies.
 * Supports alphanumeric mode for URLs.
 */
const QR_GENERATOR_SCRIPT = `
// Minimal QR encoder — byte mode, error correction level M
// Based on https://github.com/nicjansma/qr.js (MIT)
function drawQR(canvasId, text, size) {
  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext('2d');
  // Use the QR library below
  var qr = generateQR(text);
  var cellSize = size / qr.length;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (var y = 0; y < qr.length; y++) {
    for (var x = 0; x < qr[y].length; x++) {
      if (qr[y][x]) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
      }
    }
  }
}

// QR code matrix generator
function generateQR(text) {
  // Encode as UTF-8 bytes
  var data = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) data.push(c);
    else if (c < 2048) { data.push(192|(c>>6)); data.push(128|(c&63)); }
    else { data.push(224|(c>>12)); data.push(128|((c>>6)&63)); data.push(128|(c&63)); }
  }
  // Determine version (1-40) for byte mode, EC level M
  var version = 1;
  var capacities = [0,16,28,44,64,86,108,124,154,182,216,254,290,334,365,415,453,507,563,627,669,714,782,860,914,1000,1062,1128,1193,1267,1373,1455,1541,1631,1725,1812,1914,1992,2102,2216,2334];
  while (version <= 40 && data.length > capacities[version]) version++;
  if (version > 40) throw new Error('Data too long');
  var size = version * 4 + 17;
  var modules = [];
  for (var y = 0; y < size; y++) { modules[y] = []; for (var x = 0; x < size; x++) modules[y][x] = null; }

  // Place finder patterns
  function setModule(y, x, val) { if (y >= 0 && y < size && x >= 0 && x < size) modules[y][x] = val ? 1 : 0; }
  function placeFinderPattern(cy, cx) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var d = Math.max(Math.abs(dy), Math.abs(dx));
      setModule(cy+dy, cx+dx, d !== 2 && d !== 4);
    }
  }
  placeFinderPattern(3, 3);
  placeFinderPattern(3, size - 4);
  placeFinderPattern(size - 4, 3);

  // Timing patterns
  for (var i = 8; i < size - 8; i++) {
    if (modules[6][i] === null) modules[6][i] = i % 2 === 0 ? 1 : 0;
    if (modules[i][6] === null) modules[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment patterns
  var alignPos = getAlignmentPositions(version);
  for (var i = 0; i < alignPos.length; i++) for (var j = 0; j < alignPos.length; j++) {
    var ay = alignPos[i], ax = alignPos[j];
    if (modules[ay][ax] !== null) continue;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      setModule(ay+dy, ax+dx, Math.abs(dy) === 2 || Math.abs(dx) === 2 || (dy === 0 && dx === 0));
    }
  }

  // Reserve format info areas
  for (var i = 0; i < 8; i++) {
    if (modules[8][i] === null) modules[8][i] = 0;
    if (modules[i][8] === null) modules[i][8] = 0;
    if (modules[8][size-1-i] === null) modules[8][size-1-i] = 0;
    if (modules[size-1-i][8] === null) modules[size-1-i][8] = 0;
  }
  if (modules[8][8] === null) modules[8][8] = 0;
  modules[size - 8][8] = 1; // dark module

  // Version info (version >= 7)
  if (version >= 7) {
    var vBits = getVersionBits(version);
    for (var i = 0; i < 18; i++) {
      var bit = (vBits >> i) & 1;
      var r = Math.floor(i/3), c = i%3 + size - 11;
      modules[r][c] = bit; modules[c][r] = bit;
    }
  }

  // Build data codewords with error correction
  var ecInfo = getECInfo(version);
  var dataBytes = buildDataBytes(data, version, ecInfo.totalDataCodewords);
  var ecBytes = computeEC(dataBytes, ecInfo);
  var allBytes = interleaveBlocks(dataBytes, ecBytes, ecInfo);

  // Place data
  var bitIndex = 0;
  var totalBits = allBytes.length * 8;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        var x = right - j;
        var upward = ((right + 1) & 2) === 0;
        var y = upward ? size - 1 - vert : vert;
        if (modules[y][x] !== null) continue;
        var bit = 0;
        if (bitIndex < totalBits) bit = (allBytes[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
        modules[y][x] = bit;
        bitIndex++;
      }
    }
  }

  // Apply mask (pattern 0: (y+x)%2 === 0) and format info
  var maskFn = function(y,x) { return (y+x)%2===0; };
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    if (isDataModule(modules, y, x, size, version)) {
      if (maskFn(y, x)) modules[y][x] ^= 1;
    }
  }

  // Write format info (EC level M = 00, mask 0 = 000) = 0b101010000010010
  var formatBits = 0x5412;
  writeFormatBits(modules, size, formatBits);

  return modules;
}

function getAlignmentPositions(version) {
  if (version === 1) return [];
  var n = Math.floor(version / 7) + 2;
  var first = 6, last = version * 4 + 10;
  var positions = [first];
  if (n > 2) {
    var step = Math.ceil((last - first) / (n - 1));
    if (step % 2 !== 0) step++;
    for (var i = 1; i < n - 1; i++) positions.push(last - (n - 1 - i) * step);
  }
  positions.push(last);
  return positions;
}

function isDataModule(modules, y, x, size, version) {
  // Check if (y,x) is a data module (not function pattern)
  if (y < 9 && x < 9) return false; // top-left finder + format
  if (y < 9 && x >= size - 8) return false; // top-right finder + format
  if (y >= size - 8 && x < 9) return false; // bottom-left finder + format
  if (y === 6 || x === 6) return false; // timing
  if (version >= 7 && ((y < 6 && x >= size - 11) || (x < 6 && y >= size - 11))) return false;
  return true;
}

function writeFormatBits(modules, size, bits) {
  for (var i = 0; i < 15; i++) {
    var bit = (bits >> i) & 1;
    // Around top-left
    if (i < 6) modules[i][8] = bit;
    else if (i === 6) modules[7][8] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;
    // Around top-right and bottom-left
    if (i < 8) modules[8][size - 1 - i] = bit;
    else modules[size - 15 + i][8] = bit;
  }
}

function getVersionBits(version) {
  var versionBitsTable = [null,null,null,null,null,null,null,
    0x07C94,0x085BC,0x09A99,0x0A4D3,0x0BBF6,0x0C762,0x0D847,0x0E60D,
    0x0F928,0x10B78,0x1145D,0x12A17,0x13532,0x149A6,0x15683,0x168C9,
    0x177EC,0x18EC4,0x191E1,0x1AFAB,0x1B08E,0x1CC1A,0x1D33F,0x1ED75,
    0x1F250,0x209D5,0x216F0,0x228BA,0x2379F,0x24B0B,0x2542E,0x26A64,
    0x27541,0x28C69];
  return versionBitsTable[version] || 0;
}

// Error correction tables (level M)
function getECInfo(version) {
  var table = [null,
    {totalCodewords:26,ecPerBlock:10,numBlocks:1},
    {totalCodewords:44,ecPerBlock:16,numBlocks:1},
    {totalCodewords:70,ecPerBlock:26,numBlocks:1},
    {totalCodewords:100,ecPerBlock:18,numBlocks:2},
    {totalCodewords:134,ecPerBlock:24,numBlocks:2},
    {totalCodewords:172,ecPerBlock:16,numBlocks:4},
    {totalCodewords:196,ecPerBlock:18,numBlocks:4},
    {totalCodewords:242,ecPerBlock:22,numBlocks:4},
    {totalCodewords:292,ecPerBlock:22,numBlocks:5},
    {totalCodewords:346,ecPerBlock:26,numBlocks:5},
    {totalCodewords:404,ecPerBlock:30,numBlocks:5},
    {totalCodewords:466,ecPerBlock:22,numBlocks:8},
    {totalCodewords:532,ecPerBlock:22,numBlocks:9},
    {totalCodewords:581,ecPerBlock:24,numBlocks:9},
    {totalCodewords:655,ecPerBlock:24,numBlocks:10},
    {totalCodewords:733,ecPerBlock:28,numBlocks:10},
    {totalCodewords:815,ecPerBlock:28,numBlocks:11},
    {totalCodewords:901,ecPerBlock:26,numBlocks:13},
    {totalCodewords:991,ecPerBlock:26,numBlocks:14},
    {totalCodewords:1085,ecPerBlock:26,numBlocks:16},
    {totalCodewords:1156,ecPerBlock:26,numBlocks:17},
    {totalCodewords:1258,ecPerBlock:28,numBlocks:17},
    {totalCodewords:1364,ecPerBlock:28,numBlocks:18},
    {totalCodewords:1474,ecPerBlock:28,numBlocks:20},
    {totalCodewords:1588,ecPerBlock:28,numBlocks:21},
    {totalCodewords:1706,ecPerBlock:28,numBlocks:23},
    {totalCodewords:1828,ecPerBlock:28,numBlocks:25},
    {totalCodewords:1921,ecPerBlock:28,numBlocks:26},
    {totalCodewords:2051,ecPerBlock:28,numBlocks:28},
    {totalCodewords:2185,ecPerBlock:28,numBlocks:29},
    {totalCodewords:2323,ecPerBlock:28,numBlocks:31},
    {totalCodewords:2465,ecPerBlock:28,numBlocks:33},
    {totalCodewords:2611,ecPerBlock:28,numBlocks:35},
    {totalCodewords:2761,ecPerBlock:28,numBlocks:37},
    {totalCodewords:2876,ecPerBlock:28,numBlocks:38},
    {totalCodewords:3034,ecPerBlock:28,numBlocks:40},
    {totalCodewords:3196,ecPerBlock:28,numBlocks:43},
    {totalCodewords:3362,ecPerBlock:28,numBlocks:45},
    {totalCodewords:3532,ecPerBlock:28,numBlocks:47},
    {totalCodewords:3706,ecPerBlock:28,numBlocks:49}
  ];
  var info = table[version];
  var ecTotal = info.numBlocks * info.ecPerBlock;
  info.totalDataCodewords = info.totalCodewords - ecTotal;
  return info;
}

function buildDataBytes(data, version, totalDataCodewords) {
  var bits = [];
  // Mode indicator: 0100 (byte mode)
  bits.push(0,1,0,0);
  // Character count (8 bits for v1-9, 16 bits for v10+)
  var ccBits = version <= 9 ? 8 : 16;
  for (var i = ccBits - 1; i >= 0; i--) bits.push((data.length >> i) & 1);
  // Data
  for (var i = 0; i < data.length; i++)
    for (var j = 7; j >= 0; j--) bits.push((data[i] >> j) & 1);
  // Terminator
  for (var i = 0; i < 4 && bits.length < totalDataCodewords * 8; i++) bits.push(0);
  // Byte-align
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad bytes
  var padBytes = [0xEC, 0x11]; var padIdx = 0;
  while (bits.length < totalDataCodewords * 8) {
    for (var j = 7; j >= 0; j--) bits.push((padBytes[padIdx] >> j) & 1);
    padIdx = (padIdx + 1) % 2;
  }
  var bytes = [];
  for (var i = 0; i < bits.length; i += 8)
    bytes.push((bits[i]<<7)|(bits[i+1]<<6)|(bits[i+2]<<5)|(bits[i+3]<<4)|(bits[i+4]<<3)|(bits[i+5]<<2)|(bits[i+6]<<1)|bits[i+7]);
  return bytes;
}

function computeEC(dataBytes, ecInfo) {
  var blocks = [];
  var dataPerBlock = Math.floor(ecInfo.totalDataCodewords / ecInfo.numBlocks);
  var remainder = ecInfo.totalDataCodewords % ecInfo.numBlocks;
  var offset = 0;
  for (var i = 0; i < ecInfo.numBlocks; i++) {
    var blockSize = dataPerBlock + (i >= ecInfo.numBlocks - remainder ? 1 : 0);
    blocks.push(dataBytes.slice(offset, offset + blockSize));
    offset += blockSize;
  }
  var ecBlocks = [];
  for (var i = 0; i < blocks.length; i++) {
    ecBlocks.push(rsEncode(blocks[i], ecInfo.ecPerBlock));
  }
  return { dataBlocks: blocks, ecBlocks: ecBlocks };
}

function interleaveBlocks(dataBytes, ecResult, ecInfo) {
  var result = [];
  var maxDataLen = 0;
  for (var i = 0; i < ecResult.dataBlocks.length; i++)
    maxDataLen = Math.max(maxDataLen, ecResult.dataBlocks[i].length);
  for (var j = 0; j < maxDataLen; j++)
    for (var i = 0; i < ecResult.dataBlocks.length; i++)
      if (j < ecResult.dataBlocks[i].length) result.push(ecResult.dataBlocks[i][j]);
  for (var j = 0; j < ecInfo.ecPerBlock; j++)
    for (var i = 0; i < ecResult.ecBlocks.length; i++)
      if (j < ecResult.ecBlocks[i].length) result.push(ecResult.ecBlocks[i][j]);
  return result;
}

// Reed-Solomon encoding over GF(256)
var GF_EXP = new Array(512), GF_LOG = new Array(256);
(function() {
  var x = 1;
  for (var i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x = x << 1; if (x >= 256) x ^= 0x11D; }
  for (var i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }

function rsEncode(data, ecLen) {
  // Build generator polynomial
  var gen = [1];
  for (var i = 0; i < ecLen; i++) {
    var newGen = new Array(gen.length + 1).fill(0);
    for (var j = 0; j < gen.length; j++) {
      newGen[j] ^= gen[j];
      newGen[j+1] ^= gfMul(gen[j], GF_EXP[i]);
    }
    gen = newGen;
  }
  var msg = data.concat(new Array(ecLen).fill(0));
  for (var i = 0; i < data.length; i++) {
    var coef = msg[i];
    if (coef !== 0) {
      for (var j = 0; j < gen.length; j++) msg[i+j] ^= gfMul(gen[j], coef);
    }
  }
  return msg.slice(data.length);
}
`;
