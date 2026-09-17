import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const client=path.resolve(root,'../extracted/CLIENTE COM GUILDS 759');
const meshDir=path.join(client,'Mesh'),envDir=path.join(client,'Env');
const out=path.join(root,'public/assets/world');fs.mkdirSync(out,{recursive:true});
const lowerFiles=new Map(fs.readdirSync(meshDir).map(name=>[name.toLowerCase(),name]));
const meshList=new Map();
for(const line of fs.readFileSync(path.join(meshDir,'MeshList.txt'),'latin1').split(/\r?\n/)){const match=line.trim().match(/^(\d+)\s+(.+)$/);if(match)meshList.set(Number(match[1]),match[2].replace(/^.*\\/,'').trim());}
function restoreWys(name){const real=lowerFiles.get(name.replace(/\.[^.]+$/,'.wys').toLowerCase());if(!real)return null;const b=Buffer.from(fs.readFileSync(path.join(meshDir,real)).subarray(1));if(b.length<128)return null;b.write('DDS',0,'ascii');b.write(b[84]===50?'DXT1':'DXT3',84,'ascii');return b.readUInt32LE(4)===124?b:null;}
function parseMsa(file,type){
 const real=lowerFiles.get(file.toLowerCase());if(!real)return null;const b=fs.readFileSync(path.join(meshDir,real));let o=0;
 const fvf=b.readUInt32LE(o);o+=4;const stride=b.readUInt32LE(o);o+=4;const parts=b.readUInt32LE(o);o+=4;if(!stride||stride>128||!parts||parts>32)return null;
 const ranges=[];for(let i=0;i<parts;i++){if(o+20>b.length)return null;ranges.push({faceStart:b.readUInt32LE(o+4),faceCount:b.readUInt32LE(o+8)});o+=20;}
 const textureNames=[];for(let i=0;i<parts;i++){if(o+11>b.length)return null;textureNames.push(b.subarray(o,o+11).toString('latin1').split('\0')[0].replace(/^.*\\/,''));o+=11;}
 if(o+4>b.length)return null;const indexBytes=b.readUInt32LE(o);o+=4;if(indexBytes<6||o+indexBytes+4>b.length)return null;const indices=Array.from({length:indexBytes/2},(_,i)=>b.readUInt16LE(o+i*2));o+=indexBytes;
 const vertexBytes=b.readUInt32LE(o);o+=4;if(vertexBytes<stride||o+vertexBytes>b.length)return null;const count=Math.floor(vertexBytes/stride),positions=[],normals=[],uv=[];
 // As MSA do cliente usam Z para cima. Three.js usa Y para cima.
 // Rotação equivalente a -90° em X: (x,y,z) -> (x,z,-y).
 for(let i=0;i<count;i++){const p=o+i*stride,x=b.readFloatLE(p),y=b.readFloatLE(p+4),z=b.readFloatLE(p+8);positions.push(x,z,-y);if(stride>=24){const nx=b.readFloatLE(p+12),ny=b.readFloatLE(p+16),nz=b.readFloatLE(p+20);normals.push(nx,nz,-ny);}uv.push(b.readFloatLE(p+stride-8),b.readFloatLE(p+stride-4));}
 const textures=textureNames.map((name,i)=>{const dds=restoreWys(name||real);if(!dds)return null;const output=`mesh-${type}-${i}.dds`;fs.writeFileSync(path.join(out,output),dds);return output;});return {type,fvf,stride,positions,normals,uv,indices,ranges,textures};
}
function parseObjects(id){const b=fs.readFileSync(path.join(envDir,`${id}.dat`)),items=[];let o=0;while(o+28<=b.length&&items.length<4096){const type=b.readUInt32LE(o),x=b.readFloatLE(o+4),z=b.readFloatLE(o+8),height=b.readFloatLE(o+12),angle=b.readFloatLE(o+16);o+=28;items.push({type,x,z,height,angle});if((type>=501&&type<=506)||(type>=511&&type<600))o+=8;}return items.filter(v=>v.type&&v.type<5000&&Number.isFinite(v.x)&&Number.isFinite(v.z));}
const hidden=new Set([2,3,4,5,6,7,12,121,343,344]),modelCache=new Map(),modelDir=path.join(out,'models');fs.mkdirSync(modelDir,{recursive:true});
function expandObjects(placements){const expanded=[];for(const v of placements){if(hidden.has(v.type)||(v.type>=501&&v.type<600))continue;const add=(type,x=v.x/2,y=v.height,z=v.z/2,yaw=v.angle,rx=0,rz=0)=>expanded.push([type,x,y,z,yaw,rx,rz]);add(v.type);
  if(v.type>=251&&v.type<=254)add(v.type+1);
  else if(v.type===474)add(475,v.x/2,v.height+5.22,v.z/2,v.angle-Math.PI/2,0,Math.PI/2);
  else if(v.type===607){add(608,v.x/2,v.height+.45,v.z/2,0);add(608,v.x/2,v.height+2.7,v.z/2,0);add(609,v.x/2,v.height+2,v.z/2,0);}
  else if(v.type===610){const a=-v.angle+.8975979,b=-v.angle-.8975979;add(611,v.x/2+Math.cos(a)*.9,v.height+1.2,v.z/2+Math.sin(a)*.9,v.angle-Math.PI/2,0,Math.PI/2);add(611,v.x/2-Math.cos(b)*.9,v.height+1.2,v.z/2-Math.sin(b)*.9,v.angle-Math.PI/2,0,Math.PI/2);add(612);}
  else if(v.type===614)add(615);
  else if(v.type===1750)add(1770);
  else if(v.type===1739)add(1771);
  else if(v.type===1711)add(1772);
 }return expanded;}
function ensureModel(type){if(modelCache.has(type))return modelCache.get(type);const name=meshList.get(type),model=name&&/\.msa$/i.test(name)?parseMsa(name,type):null;modelCache.set(type,model);if(model)fs.writeFileSync(path.join(modelDir,`${type}.json`),JSON.stringify(model));return model;}
const mapIds=fs.readdirSync(envDir).filter(name=>/^Field\d{4}\.dat$/i.test(name)).map(name=>name.replace(/\.dat$/i,'')).sort();let total=0;
for(const mapId of mapIds){const expanded=expandObjects(parseObjects(mapId)),types=[...new Set(expanded.map(v=>v[0]))].filter(type=>ensureModel(type));const supported=new Set(types),world={id:mapId,modelTypes:types,placements:expanded.filter(v=>supported.has(v[0]))};fs.writeFileSync(path.join(out,`${mapId}.json`),JSON.stringify(world));total+=world.placements.length;}
console.log(`${total} objetos, ${[...modelCache.values()].filter(Boolean).length} malhas e ${mapIds.length} setores exportados.`);
