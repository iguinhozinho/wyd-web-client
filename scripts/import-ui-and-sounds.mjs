import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');
const clientRar = path.resolve(root, '../CLIENTE COM GUILDS 759.rar');
const publicAssets = path.join(root, 'public/assets');
const publicSounds = path.join(root, 'public/sounds');

fs.mkdirSync(publicAssets, { recursive: true });
fs.mkdirSync(publicSounds, { recursive: true });

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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

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
      const bVal = pixels[srcIdx];
      const gVal = pixels[srcIdx + 1];
      const rVal = pixels[srcIdx + 2];
      rgba[dstIdx] = rVal;
      rgba[dstIdx + 1] = gVal;
      rgba[dstIdx + 2] = bVal;
      // If pure black, make transparent unless alpha channel exists
      rgba[dstIdx + 3] =
        bytesPerPixel === 4 ? pixels[srcIdx + 3] : rVal < 5 && gVal < 5 && bVal < 5 ? 0 : 255;
    }
  }
  const png = createPng(w, h, rgba);
  fs.writeFileSync(outPath, png);
  console.log(`Converted ${path.basename(inPath)} -> ${path.basename(outPath)} (${w}x${h})`);
  return true;
}

console.log('1. Extraindo texturas e sons do arquivo RAR original...');
const uiFiles = [
  'CLIENTE COM GUILDS 759/UI/MainBox2.wyt',
  'CLIENTE COM GUILDS 759/UI/mainparts.wyt',
  'CLIENTE COM GUILDS 759/UI/main.wyt',
  'CLIENTE COM GUILDS 759/UI/nventory2.wyt',
  'CLIENTE COM GUILDS 759/UI/Skill2.wyt',
  'CLIENTE COM GUILDS 759/UI/Shop2.wyt',
  'CLIENTE COM GUILDS 759/UI/minimap.wyt',
  'CLIENTE COM GUILDS 759/UI/PlayerInfo.wyt',
];

const soundFiles = [
  'CLIENTE COM GUILDS 759/sound/menu/menu01.wav',
  'CLIENTE COM GUILDS 759/sound/menu/menu02.wav',
  'CLIENTE COM GUILDS 759/sound/damage/dmg01.wav',
  'CLIENTE COM GUILDS 759/sound/damage/dmg02.wav',
  'CLIENTE COM GUILDS 759/sound/swing/swing01.wav',
  'CLIENTE COM GUILDS 759/sound/swing/swing02.wav',
  'CLIENTE COM GUILDS 759/sound/item/item01.wav',
  'CLIENTE COM GUILDS 759/sound/item/item04.wav',
  'CLIENTE COM GUILDS 759/sound/effect/effect01.wav',
  'CLIENTE COM GUILDS 759/sound/inventory/inven01.wav',
];

const allFiles = [...uiFiles, ...soundFiles];
try {
  const quoted = allFiles.map((f) => `"${f}"`).join(' ');
  execSync(`tar -xf "${clientRar}" ${quoted}`, { cwd: path.resolve(root, '..'), stdio: 'pipe' });
  console.log('Extração concluída com sucesso.');
} catch (e) {
  console.warn('Aviso durante extração do tar:', e.message);
}

console.log('2. Convertendo texturas para PNG...');
for (const file of uiFiles) {
  const localFile = path.resolve(root, '..', file);
  const outName = path.basename(file).replace(/\.wyt$/i, '.png');
  convertWytToPng(localFile, path.join(publicAssets, outName));
}

console.log('3. Copiando arquivos de áudio WAV para public/sounds...');
for (const file of soundFiles) {
  const localFile = path.resolve(root, '..', file);
  if (fs.existsSync(localFile)) {
    const dest = path.join(publicSounds, path.basename(file));
    fs.copyFileSync(localFile, dest);
    console.log(`Copiado: ${path.basename(file)} -> public/sounds/`);
  }
}

console.log('Importação de UI e sons finalizada!');
