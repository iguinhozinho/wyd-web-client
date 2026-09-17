import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseAnimation,parseBone,parseMesh,restoreWys} from './wyd-character.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.resolve(root,'../extracted/CLIENTE COM GUILDS 759/Mesh'),out=path.join(root,'public/assets/character');
fs.mkdirSync(out,{recursive:true});
const partNames=Array.from({length:6},(_,i)=>`ch01${String(i+1).padStart(2,'0')}01`);
const animations={idle:parseAnimation(fs.readFileSync(path.join(source,'ch010101.ani'))),walk:parseAnimation(fs.readFileSync(path.join(source,'ch010103.ani'))),run:parseAnimation(fs.readFileSync(path.join(source,'ch010104.ani'))),attack:parseAnimation(fs.readFileSync(path.join(source,'ch010105.ani')))};
const data={id:'ch01-basic',source:'Cliente WYD 7.59 — Mesh',skeleton:parseBone(fs.readFileSync(path.join(source,'ch01.bon'))),animation:animations.idle,animations,parts:[]};
for(const name of partNames){
  const part=parseMesh(fs.readFileSync(path.join(source,name+'.msh')),name);delete part.header.fvf;
  fs.writeFileSync(path.join(out,name+'.dds'),restoreWys(fs.readFileSync(path.join(source,name+'.wys'))));part.texture=name+'.dds';data.parts.push(part);
}
fs.writeFileSync(path.join(out,'ch01-basic.json'),JSON.stringify(data));
console.log(`Personagem ${data.id}: ${data.parts.length} partes, ${data.skeleton.length} ossos, ${data.animation.ticks} poses.`);
