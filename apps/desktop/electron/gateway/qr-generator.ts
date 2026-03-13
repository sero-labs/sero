/**
 * Inline QR code generator script — runs in the browser, not in Node.
 *
 * Exported as a string constant that gets inlined into the QR login page's
 * <script> tag by qr-page.ts. No external dependencies.
 *
 * Minimal QR encoder — byte mode, error correction level M.
 * Based on https://github.com/nicjansma/qr.js (MIT)
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const QR_GENERATOR_SCRIPT = `
function drawQR(canvasId, text, size) {
  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext('2d');
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

function generateQR(text) {
  var data = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) data.push(c);
    else if (c < 2048) { data.push(192|(c>>6)); data.push(128|(c&63)); }
    else { data.push(224|(c>>12)); data.push(128|((c>>6)&63)); data.push(128|(c&63)); }
  }
  var version = 1;
  var capacities = [0,16,28,44,64,86,108,124,154,182,216,254,290,334,365,415,453,507,563,627,669,714,782,860,914,1000,1062,1128,1193,1267,1373,1455,1541,1631,1725,1812,1914,1992,2102,2216,2334];
  while (version <= 40 && data.length > capacities[version]) version++;
  if (version > 40) throw new Error('Data too long');
  var size = version * 4 + 17;
  var modules = [];
  for (var y = 0; y < size; y++) { modules[y] = []; for (var x = 0; x < size; x++) modules[y][x] = null; }

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

  for (var i = 8; i < size - 8; i++) {
    if (modules[6][i] === null) modules[6][i] = i % 2 === 0 ? 1 : 0;
    if (modules[i][6] === null) modules[i][6] = i % 2 === 0 ? 1 : 0;
  }

  var alignPos = getAlignmentPositions(version);
  for (var i = 0; i < alignPos.length; i++) for (var j = 0; j < alignPos.length; j++) {
    var ay = alignPos[i], ax = alignPos[j];
    if (modules[ay][ax] !== null) continue;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      setModule(ay+dy, ax+dx, Math.abs(dy) === 2 || Math.abs(dx) === 2 || (dy === 0 && dx === 0));
    }
  }

  for (var i = 0; i < 8; i++) {
    if (modules[8][i] === null) modules[8][i] = 0;
    if (modules[i][8] === null) modules[i][8] = 0;
    if (modules[8][size-1-i] === null) modules[8][size-1-i] = 0;
    if (modules[size-1-i][8] === null) modules[size-1-i][8] = 0;
  }
  if (modules[8][8] === null) modules[8][8] = 0;
  modules[size - 8][8] = 1;

  if (version >= 7) {
    var vBits = getVersionBits(version);
    for (var i = 0; i < 18; i++) {
      var bit = (vBits >> i) & 1;
      var r = Math.floor(i/3), c = i%3 + size - 11;
      modules[r][c] = bit; modules[c][r] = bit;
    }
  }

  var ecInfo = getECInfo(version);
  var dataBytes = buildDataBytes(data, version, ecInfo.totalDataCodewords);
  var ecBytes = computeEC(dataBytes, ecInfo);
  var allBytes = interleaveBlocks(dataBytes, ecBytes, ecInfo);

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

  var maskFn = function(y,x) { return (y+x)%2===0; };
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    if (isDataModule(modules, y, x, size, version)) {
      if (maskFn(y, x)) modules[y][x] ^= 1;
    }
  }

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
  if (y < 9 && x < 9) return false;
  if (y < 9 && x >= size - 8) return false;
  if (y >= size - 8 && x < 9) return false;
  if (y === 6 || x === 6) return false;
  if (version >= 7 && ((y < 6 && x >= size - 11) || (x < 6 && y >= size - 11))) return false;
  return true;
}

function writeFormatBits(modules, size, bits) {
  for (var i = 0; i < 15; i++) {
    var bit = (bits >> i) & 1;
    if (i < 6) modules[i][8] = bit;
    else if (i === 6) modules[7][8] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;
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

function getECInfo(version) {
  var table = [null,
    {totalCodewords:26,ecPerBlock:10,numBlocks:1},{totalCodewords:44,ecPerBlock:16,numBlocks:1},
    {totalCodewords:70,ecPerBlock:26,numBlocks:1},{totalCodewords:100,ecPerBlock:18,numBlocks:2},
    {totalCodewords:134,ecPerBlock:24,numBlocks:2},{totalCodewords:172,ecPerBlock:16,numBlocks:4},
    {totalCodewords:196,ecPerBlock:18,numBlocks:4},{totalCodewords:242,ecPerBlock:22,numBlocks:4},
    {totalCodewords:292,ecPerBlock:22,numBlocks:5},{totalCodewords:346,ecPerBlock:26,numBlocks:5},
    {totalCodewords:404,ecPerBlock:30,numBlocks:5},{totalCodewords:466,ecPerBlock:22,numBlocks:8},
    {totalCodewords:532,ecPerBlock:22,numBlocks:9},{totalCodewords:581,ecPerBlock:24,numBlocks:9},
    {totalCodewords:655,ecPerBlock:24,numBlocks:10},{totalCodewords:733,ecPerBlock:28,numBlocks:10},
    {totalCodewords:815,ecPerBlock:28,numBlocks:11},{totalCodewords:901,ecPerBlock:26,numBlocks:13},
    {totalCodewords:991,ecPerBlock:26,numBlocks:14},{totalCodewords:1085,ecPerBlock:26,numBlocks:16},
    {totalCodewords:1156,ecPerBlock:26,numBlocks:17},{totalCodewords:1258,ecPerBlock:28,numBlocks:17},
    {totalCodewords:1364,ecPerBlock:28,numBlocks:18},{totalCodewords:1474,ecPerBlock:28,numBlocks:20},
    {totalCodewords:1588,ecPerBlock:28,numBlocks:21},{totalCodewords:1706,ecPerBlock:28,numBlocks:23},
    {totalCodewords:1828,ecPerBlock:28,numBlocks:25},{totalCodewords:1921,ecPerBlock:28,numBlocks:26},
    {totalCodewords:2051,ecPerBlock:28,numBlocks:28},{totalCodewords:2185,ecPerBlock:28,numBlocks:29},
    {totalCodewords:2323,ecPerBlock:28,numBlocks:31},{totalCodewords:2465,ecPerBlock:28,numBlocks:33},
    {totalCodewords:2611,ecPerBlock:28,numBlocks:35},{totalCodewords:2761,ecPerBlock:28,numBlocks:37},
    {totalCodewords:2876,ecPerBlock:28,numBlocks:38},{totalCodewords:3034,ecPerBlock:28,numBlocks:40},
    {totalCodewords:3196,ecPerBlock:28,numBlocks:43},{totalCodewords:3362,ecPerBlock:28,numBlocks:45},
    {totalCodewords:3532,ecPerBlock:28,numBlocks:47},{totalCodewords:3706,ecPerBlock:28,numBlocks:49}
  ];
  var info = table[version];
  var ecTotal = info.numBlocks * info.ecPerBlock;
  info.totalDataCodewords = info.totalCodewords - ecTotal;
  return info;
}

function buildDataBytes(data, version, totalDataCodewords) {
  var bits = [];
  bits.push(0,1,0,0);
  var ccBits = version <= 9 ? 8 : 16;
  for (var i = ccBits - 1; i >= 0; i--) bits.push((data.length >> i) & 1);
  for (var i = 0; i < data.length; i++)
    for (var j = 7; j >= 0; j--) bits.push((data[i] >> j) & 1);
  for (var i = 0; i < 4 && bits.length < totalDataCodewords * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
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
  for (var i = 0; i < blocks.length; i++) ecBlocks.push(rsEncode(blocks[i], ecInfo.ecPerBlock));
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

var GF_EXP = new Array(512), GF_LOG = new Array(256);
(function() {
  var x = 1;
  for (var i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x = x << 1; if (x >= 256) x ^= 0x11D; }
  for (var i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }

function rsEncode(data, ecLen) {
  var gen = [1];
  for (var i = 0; i < ecLen; i++) {
    var newGen = new Array(gen.length + 1).fill(0);
    for (var j = 0; j < gen.length; j++) { newGen[j] ^= gen[j]; newGen[j+1] ^= gfMul(gen[j], GF_EXP[i]); }
    gen = newGen;
  }
  var msg = data.concat(new Array(ecLen).fill(0));
  for (var i = 0; i < data.length; i++) {
    var coef = msg[i];
    if (coef !== 0) { for (var j = 0; j < gen.length; j++) msg[i+j] ^= gfMul(gen[j], coef); }
  }
  return msg.slice(data.length);
}
`;
