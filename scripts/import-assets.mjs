import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(root,'../extracted/CLIENTE COM GUILDS 759/Env');
const out=path.join(root,'public/assets');fs.mkdirSync(out,{recursive:true});
// TMGround::LoadTileMap: length byte, name, position bytes, 4096 padded 12-byte records.
const maps=[];
for(const file of fs.readdirSync(source).filter(f=>/^Field.*\.trn$/i.test(f))){
 const b=fs.readFileSync(path.join(source,file)), offset=b[0]+3;
 if(b.length<offset+4096*12)throw Error(`Terreno truncado: ${file}`);
 const tiles=Array.from({length:4096},(_,i)=>{const o=offset+i*12;return [b.readInt8(o),b[o+1],b[o+2],b[o+3],b[o+4],b.readUInt32LE(o+8)];});
 const id=file.replace(/\.trn$/i,'');
 fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({id,name:b.subarray(1,b[0]+1).toString('latin1'),x:b[offset-2],y:b[offset-1],tiles}));maps.push(id);
}
// TextureManager::LoadEnvTexture restores a disguised DDS header after its prefix byte.
// TMPaths.h points the 7.59 client at EnvTextureList3.bin. Its native struct is
// 264 bytes (255-char path, alpha byte and two aligned uint32 values).
const list=fs.readFileSync(path.join(source,'EnvTextureList3.bin')), textures={};
const textureRecordSize=264;
for(let i=0;i<Math.floor(list.length/textureRecordSize);i++){
 const name=list.subarray(i*textureRecordSize,i*textureRecordSize+255).toString('latin1').split('\0')[0];
 const file=path.join(source,name.replaceAll('\\','/').split('/').pop().replace(/\.wyt$/i,'.wys'));
 if(!/\.wys$/i.test(file)||!fs.existsSync(file))continue;
 const b=Buffer.from(fs.readFileSync(file).subarray(1));if(b.length<128)continue;
 b.write('DDS',0,'ascii');b.write(b[84]===50?'DXT1':'DXT3',84,'ascii');
 if(b.readUInt32LE(4)!==124)continue;
 fs.writeFileSync(path.join(out,`texture-${i}.dds`),b);textures[i]=`texture-${i}.dds`;
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({maps,textures,source:'Cliente WYD 7.59 — Env',recordBytes:12}));
console.log(`${maps.length} terrenos e ${Object.keys(textures).length} texturas importados.`);
