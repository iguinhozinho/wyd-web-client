import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');
const clientRar = path.resolve(root, '../CLIENTE COM GUILDS 759.rar');
const publicAssets = path.join(root, 'public/assets');

function createPng(w, h, rgbaBuffer) {
  const scanlineLen = 1 + w * 4;
  const raw = Buffer.alloc(h * scanlineLen);
  for (let y = 0; y < h; y++) {
    raw[y * scanlineLen] = 0; // Filter: None
    rgbaBuffer.copy(raw, y * scanlineLen + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idatData = zlib.deflateSync(raw);
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = data ? data.length : 0;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    if (data) data.copy(buf, 8);
    buf.writeUInt32BE(crc32(buf.subarray(4, 8 + len)), 8 + len);
    return buf;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', null),
  ]);
}

function convertWytToPng(inPath, outPath) {
  if (!fs.existsSync(inPath)) return false;
  const b = fs.readFileSync(inPath);
  if (b.length < 22) return false;
  const w = b.readUInt16LE(16);
  const h = b.readUInt16LE(18);
  const bpp = b[20];
  const isTopDown = (b[21] & 0x20) !== 0;
  const bytesPerPixel = bpp / 8;
  const pixels = b.subarray(22, 22 + w * h * bytesPerPixel);
  if (pixels.length < w * h * bytesPerPixel) return false;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcY = isTopDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const srcIdx = (srcY * w + x) * bytesPerPixel;
      const dstIdx = (y * w + x) * 4;
      rgba[dstIdx] = pixels[srcIdx + 2];
      rgba[dstIdx + 1] = pixels[srcIdx + 1];
      rgba[dstIdx + 2] = pixels[srcIdx];
      rgba[dstIdx + 3] = bytesPerPixel === 4 ? pixels[srcIdx + 3] : (pixels[srcIdx+2] < 5 && pixels[srcIdx+1] < 5 && pixels[srcIdx] < 5 ? 0 : 255);
    }
  }
  fs.writeFileSync(outPath, createPng(w, h, rgba));
  return true;
}

const uiFiles = Array.from({length: 16}, (_, i) => {
  const number = (i + 1).toString().padStart(2, '0');
  const extension = i >= 13 ? 'wyt' : 'wyT';
  return `CLIENTE COM GUILDS 759/UI/itemicon${number}.${extension}`;
});
uiFiles.unshift('CLIENTE COM GUILDS 759/UI/itemicon.wyt', 'CLIENTE COM GUILDS 759/itemicon.bin');
try {
  execSync(`tar -xf "${clientRar}" ${uiFiles.map(f => `"${f}"`).join(' ')}`, { cwd: path.resolve(root, '..') });
} catch (e) { console.warn('Tar warning:', e.message); }

for (let i=1; i<=16; i++) {
  const t = i.toString().padStart(2, '0');
  const localFile1 = path.resolve(root, '..', `CLIENTE COM GUILDS 759/UI/itemicon${t}.wyT`);
  const localFile2 = path.resolve(root, '..', `CLIENTE COM GUILDS 759/UI/itemicon${t}.wyt`);
  const actualPath = fs.existsSync(localFile1) ? localFile1 : (fs.existsSync(localFile2) ? localFile2 : null);
  if (actualPath) {
    const outName = path.basename(actualPath).replace(/\.wy[Tt]$/i, '.png');
    convertWytToPng(actualPath, path.join(publicAssets, outName));
    console.log(`Converted ${outName}`);
  } else {
    console.warn(`File not found: itemicon${t}.wyt`);
  }
}

const baseAtlas = path.resolve(root, '..', 'CLIENTE COM GUILDS 759/UI/itemicon.wyt');
if (fs.existsSync(baseAtlas)) convertWytToPng(baseAtlas, path.join(publicAssets, 'itemicon-base.png'));

const iconMapPath = path.resolve(root, '..', 'CLIENTE COM GUILDS 759/itemicon.bin');
if (fs.existsSync(iconMapPath)) {
  const data = fs.readFileSync(iconMapPath);
  const iconMap = Array.from({ length: Math.floor(data.length / 4) }, (_, index) => data.readInt32LE(index * 4) - 1);
  fs.writeFileSync(path.join(publicAssets, 'item-icons.json'), JSON.stringify(iconMap));
  console.log(`Converted itemicon.bin (${iconMap.length} item mappings)`);
}
