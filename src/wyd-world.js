import * as THREE from 'three';
import {DDSLoader} from 'three/addons/loaders/DDSLoader.js';

const modelDataCache=new Map();
const assetCache=new Map();
const textureCache=new Map();
const loader=new DDSLoader();

async function getModel(type){
 if(!modelDataCache.has(type))modelDataCache.set(type,fetch(`/assets/world/models/${type}.json`).then(r=>r.ok?r.json():null));
 return modelDataCache.get(type);
}

async function getTexture(file,renderer){
 if(!file)return null;
 if(!textureCache.has(file))textureCache.set(file,loader.loadAsync(`/assets/world/${file}`).then(map=>{map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return map;}).catch(()=>null));
 return textureCache.get(file);
}

async function getAsset(model,renderer){
 if(!assetCache.has(model.type))assetCache.set(model.type,(async()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(model.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(model.uv,2));
  if(model.normals.length===model.positions.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(model.normals,3));else geometry.computeVertexNormals();geometry.setIndex(model.indices);geometry.computeBoundingBox();
  const materials=await Promise.all(model.textures.map(async file=>{const map=await getTexture(file,renderer);return new THREE.MeshStandardMaterial({map,color:map?0xffffff:0x87916c,roughness:.92,side:THREE.DoubleSide,alphaTest:.15});}));
  if(!materials.length)materials.push(new THREE.MeshStandardMaterial({color:0x87916c,roughness:1}));
  geometry.clearGroups();for(let i=0;i<model.ranges.length;i++){const range=model.ranges[i];geometry.addGroup(range.faceStart*3,range.faceCount*3,Math.min(i,materials.length-1));}
  const size=new THREE.Vector3();geometry.boundingBox.getSize(size);return {geometry,materials,size};
 })());
 return assetCache.get(model.type);
}

export async function loadWydWorld(url,renderer){
 const response=await fetch(url);if(!response.ok)throw Error(`Mundo indisponível: ${url}`);const data=await response.json();if(!data.models&&data.modelTypes)data.models=await Promise.all(data.modelTypes.map(getModel));data.models=(data.models||[]).filter(Boolean);
 const root=new THREE.Group(),colliders=[];
 const placementsByType=new Map();for(const item of data.placements){if(!placementsByType.has(item[0]))placementsByType.set(item[0],[]);placementsByType.get(item[0]).push(item);}
 for(const model of data.models){
  const placements=placementsByType.get(model.type)||[];if(!placements.length)continue;
  const {geometry,materials,size}=await getAsset(model,renderer);
  const mesh=new THREE.InstancedMesh(geometry,materials,placements.length),dummy=new THREE.Object3D();mesh.name=`WYD object ${model.type}`;mesh.frustumCulled=true;
  placements.forEach((item,index)=>{dummy.position.set(item[1],item[2],item[3]);dummy.rotation.set(item[5]||0,-item[4],item[6]||0,'YXZ');dummy.scale.set(.5,1,.5);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);if(model.type!==511&&size.y>.35&&size.x>.35&&size.z>.35&&size.x<30&&size.z<30)colliders.push({x:item[1],z:item[3],radius:Math.max(.28,Math.min(4,Math.min(size.x,size.z)*.22))});});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
 }
 return {group:root,count:data.placements.length,models:data.models.length,colliders};
}
