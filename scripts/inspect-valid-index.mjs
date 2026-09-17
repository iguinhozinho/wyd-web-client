import fs from 'node:fs';

const buf = fs.readFileSync('../../extracted/CLIENTE COM GUILDS 759/Mesh/ValidIndex.bin');

// m_stValidAniList[MAX_VALID_ANI_LIST][186]
// each is 4 bytes (int)
const nCount = 0; // ch01
const typeCount = 186; // from BoneAni4.txt

console.log("ch01 animations:");
for(let i=0; i<20; i++) {
    const val = buf.readInt32LE((nCount * 186 + i) * 4);
    if (val !== -1 && val !== 0) { // sometimes 0 is valid but let's just dump all
        console.log(`Index ${i}: nI=${val}, file=${val+1}, szTemp=ch01%04d.ani -> ch01${String(val+1).padStart(4, '0')}.ani`);
    }
}
