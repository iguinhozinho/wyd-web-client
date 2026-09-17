import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseAnimation,parseBone,parseMesh,restoreWys} from "./wyd-character.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),
      source=path.resolve(root,"../extracted/CLIENTE COM GUILDS 759/Mesh"),
      out=path.join(root,"public/assets/monster");
fs.mkdirSync(out,{recursive:true});

// TMSkinMesh.cpp: prefixo + parte (01/02) + variante (01).
// bo01 possui duas partes e usa a mesma textura em ambas.
const partNames=["bo010101","bo010201"];
const animMap={idle:"bo010101",walk:"bo010102",run:"bo010102",attack:"bo010103"};
const anims={};
for(const [name,file] of Object.entries(animMap)){
  const fp=path.join(source,file+".ani");
  if(fs.existsSync(fp)){try{anims[name]=parseAnimation(fs.readFileSync(fp));console.log("  anim "+name+": "+anims[name].ticks+" ticks");}catch(e){console.warn("  anim "+name+" skipped:",e.message);}}
}

const skeleton=parseBone(fs.readFileSync(path.join(source,"bo01.bon")));
const parts=[];
for(const name of partNames){
  const textureName="bo010101";
  const mshPath=path.join(source,name+".msh"),wysPath=path.join(source,textureName+".wys");
  if(!fs.existsSync(mshPath)||!fs.existsSync(wysPath)){console.warn("  skip missing: "+name);continue;}
  try{
    const part=parseMesh(fs.readFileSync(mshPath),name);delete part.header.fvf;
    fs.writeFileSync(path.join(out,textureName+".dds"),restoreWys(fs.readFileSync(wysPath)));
    part.texture=textureName+".dds";parts.push(part);
    console.log("  part "+name+": "+part.header.vertexCount+" verts");
  }catch(e){console.warn("  part "+name+" failed:",e.message);}
}

if(parts.length!==2)throw new Error('Javali incompleto: duas partes obrigatórias.');
const data={id:"bo01-boar",source:"Cliente WYD 7.59 - Mesh",skeleton,animation:anims.idle||anims.walk,animations:anims,parts};
fs.writeFileSync(path.join(out,"bo01-boar.json"),JSON.stringify(data));
console.log("Monster "+data.id+": "+parts.length+" partes, "+skeleton.length+" ossos.");
