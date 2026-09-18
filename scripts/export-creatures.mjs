import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnimation, parseBone, parseMesh, restoreWys } from './wyd-character.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../extracted/CLIENTE COM GUILDS 759/Mesh');
const output = path.join(root, 'public/assets/creatures');
const indexFile = path.join(source, 'BoneAni4.txt');
const aniSoundFile = path.resolve(root, '../CLIENTE COM GUILDS 759/AniSound4.txt');
fs.mkdirSync(output, { recursive: true });

const files = new Map(fs.readdirSync(source).map((name) => [name.toLowerCase(), name]));
const realFile = (name) => files.get(name.toLowerCase());
const two = (value) => String(value).padStart(2, '0');

function readMotionTables() {
  const tables = new Map();
  if (!fs.existsSync(aniSoundFile)) return tables;
  let current = null;
  for (const rawLine of fs.readFileSync(aniSoundFile, 'latin1').split(/\r?\n/)) {
    const header = rawLine.match(/^\[[^\]]+\]\s+(\d+)/);
    if (header) {
      current = { entries: [] };
      tables.set(Number(header[1]), current);
      continue;
    }
    if (!current || !rawLine.trim()) continue;
    const values = rawLine.trim().split(/\s+/).slice(1).map(Number);
    if (values.length >= 2 && values.every(Number.isFinite)) {
      current.entries.push({ animation: values[0], fps: values[1] });
    }
  }
  return tables;
}

const motionTables = readMotionTables();
const logicalMotions = { idle: 0, walk: 2, run: 3, attack: 4, strike: 10, death: 11, dead: 12 };

const definitions = fs.readFileSync(indexFile, 'latin1')
  .split(/\r?\n/)
  .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+mesh\\(.+)$/i))
  .filter(Boolean)
  .map((match) => ({
    skinType: Number(match[1]),
    motionCount: Number(match[2]),
    partCount: Number(match[3]),
    prefix: match[4],
  }))
  .filter(({ skinType }) => skinType > 1);

function readAnimation(prefix, index) {
  const name = realFile(`${prefix}01${two(index)}.ani`);
  if (!name) return null;
  try {
    return parseAnimation(fs.readFileSync(path.join(source, name)));
  } catch {
    return null;
  }
}

function findTexture(prefix, partIndex) {
  const candidates = [
    `${prefix}${two(partIndex)}01.wys`,
    `${prefix}0101.wys`,
  ];
  return candidates.map(realFile).find(Boolean) || null;
}

const manifest = [];

for (const definition of definitions) {
  const { skinType, motionCount, partCount, prefix } = definition;
  const boneName = realFile(`${prefix}.bon`);
  if (!boneName) continue;

  const creatureDir = path.join(output, prefix.toLowerCase());
  fs.mkdirSync(creatureDir, { recursive: true });

  let skeleton;
  try {
    skeleton = parseBone(fs.readFileSync(path.join(source, boneName)));
  } catch {
    continue;
  }

  const parts = [];
  const textures = new Map();
  for (let partIndex = 1; partIndex <= partCount; partIndex++) {
    const meshBase = `${prefix}${two(partIndex)}01`;
    const meshName = realFile(`${meshBase}.msh`);
    const textureName = findTexture(prefix, partIndex);
    if (!meshName || !textureName) continue;
    try {
      const part = parseMesh(fs.readFileSync(path.join(source, meshName)), meshBase);
      delete part.header.fvf;
      const textureOutput = `${path.parse(textureName).name.toLowerCase()}.dds`;
      if (!textures.has(textureOutput)) {
        fs.writeFileSync(
          path.join(creatureDir, textureOutput),
          restoreWys(fs.readFileSync(path.join(source, textureName)))
        );
        textures.set(textureOutput, true);
      }
      part.texture = textureOutput;
      parts.push(part);
    } catch {
      // Uma parte inválida não impede o catálogo dos demais modelos.
    }
  }
  if (!parts.length) continue;

  const motions = {};
  for (let index = 1; index <= motionCount; index++) {
    const animation = readAnimation(prefix, index);
    if (animation) motions[`motion${two(index)}`] = animation;
  }
  const table = motionTables.get(skinType);
  const motionMap = {};
  const motionFps = {};
  for (const [name, logicalIndex] of Object.entries(logicalMotions)) {
    const entry = table?.entries[logicalIndex];
    const key = entry && motions[`motion${two(entry.animation + 1)}`]
      ? `motion${two(entry.animation + 1)}`
      : (name === 'idle' ? Object.keys(motions)[0] : motionMap.idle);
    motionMap[name] = key;
    motionFps[name] = entry?.fps || 15;
  }
  const idle = motions[motionMap.idle];

  const id = prefix.toLowerCase();
  const data = {
    id,
    skinType,
    source: 'Cliente WYD 7.59 - Mesh/BoneAni4.txt',
    expectedParts: partCount,
    skeleton,
    animation: idle,
    animations: motions,
    motionMap,
    motionFps,
    parts,
  };
  fs.writeFileSync(path.join(creatureDir, `${id}.json`), JSON.stringify(data));
  manifest.push({
    id,
    skinType,
    parts: parts.length,
    expectedParts: partCount,
    motions: Object.keys(motions).length,
    file: `${id}/${id}.json`,
  });
}

fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ creatures: manifest }, null, 2));
const complete = manifest.filter((entry) => entry.parts === entry.expectedParts).length;
console.log(`${manifest.length} criaturas exportadas; ${complete} com todas as partes.`);
