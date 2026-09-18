import * as THREE from 'three';import {DDSLoader} from 'three/addons/loaders/DDSLoader.js';
const mat=values=>new THREE.Matrix4().fromArray(values);
const poseMat=values=>values?.length===16&&values.every(value=>Number.isFinite(value)&&Math.abs(value)<10000)?mat(values):new THREE.Matrix4();
const dataCache=new Map(),textureCache=new Map();
export async function loadWydCharacter(url,renderer){
  if(!dataCache.has(url))dataCache.set(url,fetch(url).then(response=>{if(!response.ok)throw new Error(`Personagem: HTTP ${response.status}`);return response.json();}));
  const data=await dataCache.get(url),base=new URL('.',new URL(url,location.href));
  const group=new THREE.Group(),dds=new DDSLoader(),materials=new Map();
  const bones=new Map(data.skeleton.map(entry=>[entry.id,{...entry,world:new THREE.Matrix4()}]));
  const parts=await Promise.all(data.parts.map(async part=>{
    let material=materials.get(part.texture);
    if(!material){
      const textureUrl=new URL(part.texture,base).href;
      if(!textureCache.has(textureUrl))textureCache.set(textureUrl,dds.loadAsync(textureUrl));
      const texture=await textureCache.get(textureUrl);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearFilter;
      texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=false;
      texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      // Os meshes antigos misturam a orientação dos triângulos e alguns WYS
      // possuem um canal alpha residual. FrontSide + alphaTest abria buracos no
      // corpo, fazendo cenário e outras partes aparecerem através do modelo.
      material=new THREE.MeshLambertMaterial({
        map:texture,
        side:THREE.DoubleSide,
        transparent:false,
        opacity:1,
        depthWrite:true,
        depthTest:true,
        alphaTest:0,
      });
      materials.set(part.texture,material);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uvs,2));geometry.setIndex(part.indices);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.frustumCulled=false;
    group.add(mesh);
    return {mesh,part,source:new Float32Array(part.positions),inverseBind:part.inverseBind.map(mat)};
  }));
  // Após o skinning, as malhas do cliente usam Z como eixo vertical; Three.js usa Y.
  group.scale.setScalar(1.05);group.rotation.x=-Math.PI/2;
  const v=new THREE.Vector3(),normal=new THREE.Vector3(),temp=new THREE.Vector3();let lastTick=-1,motionStarted=0;
  const motionAliases={idle:'motion01',walk:'motion03',run:'motion04',attack:'motion05',death:'motion12'};
  let motion='idle',motionName='idle';function setMotion(next){const resolved=data.motionMap?.[next]||((data.animations?.[motionAliases[next]]&&motionAliases[next])||(data.animations?.[next]&&next)||data.motionMap?.idle||'idle');if(resolved!==motion||next!==motionName){motion=resolved;motionName=next;lastTick=-1;motionStarted=0;}const animation=data.animations?.[motion]||data.animation;return animation.ticks*1000/(data.motionFps?.[next]||15);}
  function update(time){const animation=data.animations?.[motion]||data.animation;if(!motionStarted)motionStarted=time;const frameMs=1000/(data.motionFps?.[motionName]||15),rawTick=Math.floor((time-motionStarted)/frameMs),oneShot=motionName==='death'||motionName==='dead',tick=oneShot?Math.min(animation.ticks-1,rawTick):rawTick%animation.ticks;if(tick===lastTick)return;lastTick=tick;const pose=animation.frames[tick];
    for(const entry of data.skeleton){const bone=bones.get(entry.id),local=poseMat(pose[entry.id]);bone.world.copy(local);if(entry.parent>=0&&bones.has(entry.parent))bone.world.premultiply(bones.get(entry.parent).world);}
    for(const {mesh,part,source,inverseBind} of parts){const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal,skins=part.palette.map((boneId,i)=>new THREE.Matrix4().copy(bones.get(boneId)?.world||new THREE.Matrix4()).multiply(inverseBind[i])),normalSkins=skins.map(skin=>new THREE.Matrix3().getNormalMatrix(skin));
      for(let i=0;i<part.header.vertexCount;i++){v.fromArray(source,i*3);normal.fromArray(part.normals,i*3);let x=0,y=0,z=0,nx=0,ny=0,nz=0;
        for(let j=0;j<4;j++){const w=part.skinWeights[i*4+j];if(w<=0)continue;const paletteIndex=part.skinIndices[i*4+j],skin=skins[paletteIndex];if(!skin)continue;temp.copy(v).applyMatrix4(skin);x+=temp.x*w;y+=temp.y*w;z+=temp.z*w;temp.copy(normal).applyMatrix3(normalSkins[paletteIndex]);nx+=temp.x*w;ny+=temp.y*w;nz+=temp.z*w;}
        positions.setXYZ(i,x,y,z);const len=Math.hypot(nx,ny,nz)||1;normals.setXYZ(i,nx/len,ny/len,nz/len);
      }positions.needsUpdate=true;normals.needsUpdate=true;mesh.geometry.computeBoundingSphere();
    }
  }
  return {group,update,setMotion,data};
}
