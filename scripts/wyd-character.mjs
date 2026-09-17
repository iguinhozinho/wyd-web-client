import fs from 'node:fs';

const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const matrix=(buffer,offset)=>Array.from({length:16},(_,i)=>buffer.readFloatLE(offset+i*4));

export function parseBone(buffer){
  ensure(buffer.length%8===0,'BON deve conter pares uint32 de 8 bytes');
  return Array.from({length:buffer.length/8},(_,i)=>({
    parent:buffer.readInt32LE(i*8),id:buffer.readUInt32LE(i*8+4)
  }));
}

export function parseAnimation(buffer){
  ensure(buffer.length>=8,'ANI sem cabeçalho');
  const ticks=buffer.readUInt32LE(0),bones=buffer.readUInt32LE(4);
  const expected=8+ticks*bones*64;
  ensure(ticks>0&&bones>0&&buffer.length===expected,`ANI inválido: esperado ${expected}, recebido ${buffer.length}`);
  return {ticks,bones,frames:Array.from({length:ticks},(_,tick)=>
    Array.from({length:bones},(_,bone)=>matrix(buffer,8+(tick*bones+bone)*64)))};
}

export function parseMesh(buffer,name='mesh'){
  ensure(buffer.length>=32,`${name}: cabeçalho incompleto`);
  const header={parent:buffer.readInt32LE(0),id:buffer.readUInt32LE(4),fvf:buffer.readUInt32LE(8),stride:buffer.readUInt32LE(12),influences:buffer.readUInt32LE(16),palette:buffer.readUInt32LE(20),vertexCount:buffer.readUInt32LE(24),indexCount:buffer.readUInt32LE(28)};
  ensure(header.influences>=1&&header.influences<=4,`${name}: influências fora do intervalo`);
  ensure(header.stride===32+header.influences*4,`${name}: stride ${header.stride} incompatível com ${header.influences} influências`);
  let offset=32;
  const inverseBind=Array.from({length:header.palette},()=>{const value=matrix(buffer,offset);offset+=64;return value;});
  const palette=Array.from({length:header.palette},()=>{const value=buffer.readUInt32LE(offset);offset+=4;return value;});
  const positions=[],normals=[],uvs=[],skinIndices=[],skinWeights=[];
  for(let vertex=0;vertex<header.vertexCount;vertex++){
    ensure(offset+header.stride<=buffer.length,`${name}: vértices truncados`);
    positions.push(buffer.readFloatLE(offset),buffer.readFloatLE(offset+4),buffer.readFloatLE(offset+8));let cursor=offset+12,sum=0;
    const weights=[];for(let i=0;i<header.influences-1;i++){const weight=buffer.readFloatLE(cursor);cursor+=4;weights.push(weight);sum+=weight;}
    const packed=buffer.readUInt32LE(cursor);cursor+=4;
    const indices=[packed&255,(packed>>>8)&255,(packed>>>16)&255,(packed>>>24)&255];
    normals.push(buffer.readFloatLE(cursor),buffer.readFloatLE(cursor+4),buffer.readFloatLE(cursor+8));cursor+=12;
    uvs.push(buffer.readFloatLE(cursor),buffer.readFloatLE(cursor+4));
    while(weights.length<header.influences)weights.push(Math.max(0,1-sum));
    while(weights.length<4)weights.push(0);skinWeights.push(...weights.slice(0,4));skinIndices.push(...indices);
    offset+=header.stride;
  }
  ensure(offset+header.indexCount*2===buffer.length,`${name}: tamanho final inesperado`);
  const indices=Array.from({length:header.indexCount},()=>{const value=buffer.readUInt16LE(offset);offset+=2;return value;});
  ensure(indices.every(i=>i<header.vertexCount),`${name}: índice de vértice fora do intervalo`);
  ensure(skinIndices.every((i,n)=>skinWeights[n]===0||i<header.palette),`${name}: índice de paleta fora do intervalo`);
  return {name,header,palette,inverseBind,positions,normals,uvs,skinIndices,skinWeights,indices};
}

export function restoreWys(buffer){
  ensure(buffer.length>129,'WYS muito curto');const out=Buffer.from(buffer.subarray(1));
  out.write('DDS',0,'ascii');out.write(out[84]===50?'DXT1':'DXT3',84,'ascii');
  ensure(out.readUInt32LE(4)===124,'Cabeçalho DDS não reconhecido');return out;
}
