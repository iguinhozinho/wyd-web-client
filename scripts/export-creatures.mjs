import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnimation, parseBone, parseMesh, restoreWys } from './wyd-character.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../extracted/CLIENTE COM GUILDS 759/Mesh');
const output = path.join(root, 'public/assets/creatures');
const indexFile = path.join(source, 'BoneAni4.txt');
fs.mkdirSync(output, { recursive: true });

const files = new Map(fs.readdirSync(source).map((name) => [name.toLowerCase(), name]));
const realFile = (name) => files.get(name.toLowerCase());
const two = (value) => String(value).padStart(2, '0');

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
  const motion = (index, fallback) => motions[`motion${two(Math.min(index, motionCount))}`] || fallback;
  const idle = motion(1, Object.values(motions)[0]);
  const animations = {
    ...motions,
    idle,
    walk: motion(2, idle),
    run: motion(3, motion(2, idle)),
    attack: motion(5, motion(4, motion(3, idle))),
    death: motion(motionCount, idle),
  };

  const id = prefix.toLowerCase();
  const data = {
    id,
    skinType,
    source: 'Cliente WYD 7.59 - Mesh/BoneAni4.txt',
    expectedParts: partCount,
    skeleton,
    animation: idle,
    animations,
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
