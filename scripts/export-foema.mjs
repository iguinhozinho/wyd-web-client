import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnimation, parseBone, parseMesh, restoreWys } from './wyd-character.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../extracted/CLIENTE COM GUILDS 759/Mesh');
const out = path.join(root, 'public/assets/character');
fs.mkdirSync(out, { recursive: true });

const partNames = ['ch020101', 'ch020201', 'ch020301', 'ch020401', 'ch020501', 'ch020601'];
const animations = {
  idle: parseAnimation(fs.readFileSync(path.join(source, 'ch020101.ani'))),
  walk: parseAnimation(fs.readFileSync(path.join(source, 'ch020103.ani'))),
  run: parseAnimation(fs.readFileSync(path.join(source, 'ch020104.ani'))),
  attack: parseAnimation(fs.readFileSync(path.join(source, 'ch020105.ani'))),
};

const data = {
  id: 'ch02-basic',
  name: 'Foema',
  source: 'Cliente WYD 7.59 — Mesh',
  skeleton: parseBone(fs.readFileSync(path.join(source, 'ch02.bon'))),
  animation: animations.idle,
  animations,
  parts: [],
};

for (const name of partNames) {
  const mshFile = path.join(source, name + '.msh');
  const wysFile = path.join(source, name + '.wys');
  if (!fs.existsSync(mshFile) || !fs.existsSync(wysFile)) {
    console.warn('Parte ausente:', name);
    continue;
  }
  const part = parseMesh(fs.readFileSync(mshFile), name);
  delete part.header.fvf;
  fs.writeFileSync(path.join(out, name + '.dds'), restoreWys(fs.readFileSync(wysFile)));
  part.texture = name + '.dds';
  data.parts.push(part);
}

fs.writeFileSync(path.join(out, 'ch02-basic.json'), JSON.stringify(data));
console.log(
  `Personagem ${data.id} (Foema): ${data.parts.length} partes, ${data.skeleton.length} ossos, ${data.animation.ticks} poses idle.`
);
