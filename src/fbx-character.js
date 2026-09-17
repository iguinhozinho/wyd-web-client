import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';

export async function loadTheodoreCharacter(renderer){
  const base='/assets/characters/theodore/BB_Theodore/',loader=new FBXLoader(),model=await loader.loadAsync(base+'SK_Theodore_V2.fbx');
  const textures=new THREE.TextureLoader(),[color,normal,arm]=await Promise.all([
    textures.loadAsync(base+'T_Theodore.png').catch(()=>null),
    textures.loadAsync(base+'T_Theodore_N.png').catch(()=>null),
    textures.loadAsync(base+'T_Theodore_ARM.png').catch(()=>null)
  ]);
  if(color)color.colorSpace=THREE.SRGBColorSpace;
  if(normal)normal.colorSpace=THREE.NoColorSpace;
  if(arm)arm.colorSpace=THREE.NoColorSpace;

  model.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;
    object.receiveShadow=true;
    object.frustumCulled=false;

    // Three.js aoMap requires uv2 attribute on geometry
    if(object.geometry){
      if(object.geometry.attributes.uv&&!object.geometry.attributes.uv2){
        object.geometry.setAttribute('uv2',object.geometry.attributes.uv);
      }
    }

    object.material=new THREE.MeshStandardMaterial({
      map:color,
      normalMap:normal,
      normalScale:new THREE.Vector2(1,-1), // DirectX/Unreal format
      aoMap:arm,
      aoMapIntensity:1.0,
      roughnessMap:arm,
      roughness:1.0,
      metalnessMap:arm,
      metalness:1.0,
      skinning:object.isSkinnedMesh,
      side:THREE.FrontSide,
      transparent: false,
      alphaTest: 0.5
    });
  });

  model.rotation.x=-Math.PI/2;
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),size=new THREE.Vector3();
  box.getSize(size);
  const scale=1.45/(size.y||1);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center=new THREE.Vector3();
  box.getCenter(center);
  const baseX = -center.x;
  const baseZ = -center.z;
  const baseY = -box.min.y;
  model.position.set(baseX, baseY, baseZ);

  const group=new THREE.Group();
  group.add(model);
  const mixer=model.animations?.length?new THREE.AnimationMixer(model):null;
  if(mixer)mixer.clipAction(model.animations[0]).play();

  // Bone registry
  const bones = {};
  model.traverse(object => {
    if (!object.isBone) return;
    const n = object.name.toLowerCase();
    const tracked = [
      'pelvis', 'spine_01', 'spine_02', 'clavicle_l', 'clavicle_r',
      'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
      'thigh_l', 'thigh_r', 'calf_l', 'calf_r',
      'cc_eye_l', 'cc_eye_r', 'head', 'neck_01'
    ];
    if (tracked.includes(n)) bones[n] = { bone: object, base: object.rotation.clone() };
  });

  // ── Gaze state machine ────────────────────────────────────────────────────────
  // Eyes use true saccades: stay still → jump to new spot → stay → repeat
  // Head damps slowly behind the eyes.
  const gaze = {
    headYaw: 0, headPitch: 0,
    eyeYaw: 0,  eyePitch: 0,
    targetEyeYaw: 0, targetEyePitch: 0,
    nextSaccadeAt: 0,
    focusYaw: 0, focusPitch: 0, hasFocus: false,
  };

  let moving = false, last = 0;
  let combatWeight = 0, attackCombo = 0, wasAttacking = false;

  return {
    group,
    setMotion(value) {
      moving = value === 'run' || value === 'walk';
      if (mixer) mixer.timeScale = moving ? 1 : 0.18;
    },

    update(time, ctx = {}) {
      const dt    = last ? Math.min((time - last) / 1000, 0.1) : 0;
      last = time;
      mixer?.update(dt);

      // Reset bones to bind pose
      for (const k in bones) bones[k].bone.rotation.copy(bones[k].base);

      const isMoving    = ctx.moving ?? moving;
      const attackPhase = ctx.attackPhase || 0;
      const heroPos     = ctx.heroPos;
      const heroRotY    = ctx.heroRotY || 0;
      const targetPos   = ctx.targetPos;
      const inCombat    = Boolean(ctx.inCombat || attackPhase > 0);

      // ── Combat weight ───────────────────────────────────────────────────────
      combatWeight += ((inCombat ? 1 : 0) - combatWeight) * Math.min(1, dt * 4);

      // ── Combo tracking ──────────────────────────────────────────────────────
      if (attackPhase > 0 && !wasAttacking) { attackCombo = (attackCombo + 1) % 2; wasAttacking = true; }
      if (attackPhase === 0) wasAttacking = false;

      // ══════════════════════════════════════════════════════════════════════
      //  GAZE & BLINK SYSTEM
      // ══════════════════════════════════════════════════════════════════════

      // 1. Compute focus target from world enemy position
      gaze.hasFocus = false;
      gaze.focusYaw = 0; gaze.focusPitch = 0;
      if (targetPos && heroPos) {
        const dx = targetPos.x - heroPos.x;
        const dz = targetPos.z - heroPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 15) {
          let angle = Math.atan2(dx, dz) - heroRotY;
          // Normalise to [-π, π]
          angle = ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(angle) < 1.4) {
            gaze.focusYaw   = THREE.MathUtils.clamp(angle * 0.5, -0.38, 0.38);
            gaze.focusPitch = 0.06;
            gaze.hasFocus   = true;
          }
        }
      }

      // 2. Saccade state machine (only when NOT locked onto enemy)
      if (!gaze.hasFocus) {
        if (time > gaze.nextSaccadeAt) {
          // Pick a new gaze target  — small random-ish offset using sine mix
          const seed = Math.floor(time / 3500) * 1.618;
          const rndA = Math.sin(seed * 127.1) * 43758.5453;
          const rndB = Math.sin(seed * 311.7) * 43758.5453;
          gaze.targetEyeYaw   = (rndA - Math.floor(rndA) - 0.5) * 0.16;
          gaze.targetEyePitch = (rndB - Math.floor(rndB) - 0.5) * 0.08;
          // Hold this position 2–5 s
          const hold = 2.0 + (rndA - Math.floor(rndA)) * 3.0;
          gaze.nextSaccadeAt = time + hold * 1000;
        }
      } else {
        // When we have an external focus, override saccade target
        gaze.targetEyeYaw   = gaze.focusYaw;
        gaze.targetEyePitch = gaze.focusPitch;
        // Push next saccade so we don't interrupt the focus
        gaze.nextSaccadeAt = time + 2000;
      }

      // 3. Eyes snap quickly to target (saccade speed ~120 ms)
      const eyeLerp = Math.min(1, dt * 12);
      gaze.eyeYaw   += (gaze.targetEyeYaw   - gaze.eyeYaw)   * eyeLerp;
      gaze.eyePitch += (gaze.targetEyePitch  - gaze.eyePitch) * eyeLerp;

      // 4. Head follows with light, responsive inertia (~250 ms)
      // Keep yaw very small so one ear doesn't pop out more than the other
      const headLerp = Math.min(1, dt * 7.5);
      const targetHY = THREE.MathUtils.clamp(gaze.eyeYaw   * 0.30, -0.08, 0.08);
      const targetHP = THREE.MathUtils.clamp(gaze.eyePitch * 0.40, -0.10, 0.14);
      gaze.headYaw   += (targetHY - gaze.headYaw)   * headLerp;
      gaze.headPitch += (targetHP - gaze.headPitch) * headLerp;

      // 5. Apply gaze to bones
      if (bones.cc_eye_l) {
        bones.cc_eye_l.bone.rotation.z += gaze.eyeYaw;
        bones.cc_eye_l.bone.rotation.x += gaze.eyePitch;
      }
      if (bones.cc_eye_r) {
        bones.cc_eye_r.bone.rotation.z += gaze.eyeYaw;
        bones.cc_eye_r.bone.rotation.x += gaze.eyePitch;
      }
      // Head turns subtly — neck carries most of the weight, avoids exposing asymmetric geometry
      if (bones.head) {
        bones.head.bone.rotation.z  += gaze.headYaw  * 0.5;
        bones.head.bone.rotation.x  += gaze.headPitch;
      }
      if (bones.neck_01) {
        bones.neck_01.bone.rotation.z += gaze.headYaw  * 0.5;
        bones.neck_01.bone.rotation.x += gaze.headPitch * 0.45;
      }



      // ══════════════════════════════════════════════════════════════════════
      //  BODY ANIMATION (Attack / Walk / Battle Stance / Idle)
      // ══════════════════════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════════════════════
      //  BODY ANIMATION (Lower Body & Upper Body decoupled)
      // ══════════════════════════════════════════════════════════════════════

      // ── 1. LOWER BODY (Legs always move naturally when walking) ───────────
      const wave = Math.sin(time * 0.009);
      if (isMoving) {
        // Thighs: alternate forward/backward
        if (bones.thigh_l) bones.thigh_l.bone.rotation.x += wave * 0.48;
        if (bones.thigh_r) bones.thigh_r.bone.rotation.x -= wave * 0.48;

        // Knees: anatomically bend backward on local Z when trailing back
        if (bones.calf_l)  bones.calf_l.bone.rotation.z  += Math.max(0,  wave) * 0.55;
        if (bones.calf_r)  bones.calf_r.bone.rotation.z  -= Math.max(0, -wave) * 0.55;
      } else if (combatWeight > 0.005) {
        // Combat Stance leg base (slight athletic knee bend on Z)
        const battleBounce = Math.sin(time * 0.006);
        if (bones.thigh_l) bones.thigh_l.bone.rotation.x += combatWeight * 0.10 + battleBounce * 0.02 * combatWeight;
        if (bones.thigh_r) bones.thigh_r.bone.rotation.x -= combatWeight * 0.08 + battleBounce * 0.02 * combatWeight;
        if (bones.calf_l)  bones.calf_l.bone.rotation.z  += combatWeight * 0.18;
        if (bones.calf_r)  bones.calf_r.bone.rotation.z  -= combatWeight * 0.22;
      }

      const s = attackPhase > 0 ? Math.sin(attackPhase * Math.PI) : 0;

      if (attackPhase > 0) {
        // Attack Punch combo (Upper body strike)
        const phase = 1.0 - attackPhase; // 0 to 1
        // Create an explosive punch curve (fast out, slower return)
        const coreTwist = Math.sin(Math.pow(phase, 0.7) * Math.PI);
        const punchExt = Math.sin(Math.pow(phase, 0.5) * Math.PI);
        
        if (attackCombo === 0) {
          // RIGHT STRAIGHT (CROSS)
          // 1. Core & Hips twist LEFT (Y axis)
          if (bones.pelvis)   bones.pelvis.bone.rotation.y   += coreTwist * 0.15;
          if (bones.spine_01) bones.spine_01.bone.rotation.y += coreTwist * 0.20;
          if (bones.spine_02) bones.spine_02.bone.rotation.y += coreTwist * 0.20;
          // Lean forward into the punch (X axis)
          if (bones.spine_01) bones.spine_01.bone.rotation.x += coreTwist * 0.10;
          
          // Head counters the twist to keep looking at target
          if (bones.head)    bones.head.bone.rotation.z -= coreTwist * 0.35;
          if (bones.neck_01) bones.neck_01.bone.rotation.z -= coreTwist * 0.15;
          
          // 2. Right Arm Punch (Extends forward)
          if (bones.clavicle_r) bones.clavicle_r.bone.rotation.y += punchExt * 0.15;
          if (bones.upperarm_r) { 
              bones.upperarm_r.bone.rotation.z -= punchExt * 1.35; 
              bones.upperarm_r.bone.rotation.y += punchExt * 0.4; // lift elbow
          }
          if (bones.lowerarm_r) bones.lowerarm_r.bone.rotation.z += punchExt * 0.8;
          if (bones.hand_r)     bones.hand_r.bone.rotation.y     -= punchExt * 1.2; // Pronate fist
          
          // 3. Left Guard (tucked in)
          if (bones.upperarm_l) bones.upperarm_l.bone.rotation.z += coreTwist * 0.2;
          if (bones.lowerarm_l) bones.lowerarm_l.bone.rotation.z -= coreTwist * 0.4;
          
        } else {
          // LEFT JAB
          // 1. Core & Hips twist RIGHT (Y axis)
          if (bones.pelvis)   bones.pelvis.bone.rotation.y   -= coreTwist * 0.10;
          if (bones.spine_01) bones.spine_01.bone.rotation.y -= coreTwist * 0.15;
          if (bones.spine_02) bones.spine_02.bone.rotation.y -= coreTwist * 0.15;
          if (bones.spine_01) bones.spine_01.bone.rotation.x += coreTwist * 0.08;
          
          if (bones.head)    bones.head.bone.rotation.z += coreTwist * 0.25;
          if (bones.neck_01) bones.neck_01.bone.rotation.z += coreTwist * 0.10;

          // 2. Left Arm Punch
          if (bones.clavicle_l) bones.clavicle_l.bone.rotation.y -= punchExt * 0.12;
          if (bones.upperarm_l) {
              bones.upperarm_l.bone.rotation.z -= punchExt * 1.2;
              bones.upperarm_l.bone.rotation.y -= punchExt * 0.3; 
          }
          if (bones.lowerarm_l) bones.lowerarm_l.bone.rotation.z += punchExt * 0.7;
          if (bones.hand_l)     bones.hand_l.bone.rotation.y     += punchExt * 1.2; // Pronate fist

          // 3. Right Guard
          if (bones.upperarm_r) bones.upperarm_r.bone.rotation.z += coreTwist * 0.15;
          if (bones.lowerarm_r) bones.lowerarm_r.bone.rotation.z -= coreTwist * 0.3;
        }
      } else if (isMoving) {
        // Arm swing in locomotion 
        if (bones.upperarm_l) bones.upperarm_l.bone.rotation.z -= wave * 0.45;
        if (bones.upperarm_r) bones.upperarm_r.bone.rotation.z -= wave * 0.45;
        if (bones.lowerarm_l) bones.lowerarm_l.bone.rotation.z += Math.max(0, wave) * 0.18;
        if (bones.lowerarm_r) bones.lowerarm_r.bone.rotation.z += Math.max(0, -wave) * 0.18;
      } else {
        // Idle: Combat guard or relaxed breathing
        const breath = Math.sin(time * 0.003);
        const battleBounce = Math.sin(time * 0.006);
        const calmW = 1 - combatWeight;

        if (combatWeight > 0.005) {
          // Fists up in guard
          if (bones.lowerarm_l) bones.lowerarm_l.bone.rotation.z -= combatWeight * 0.85;
          if (bones.lowerarm_r) bones.lowerarm_r.bone.rotation.z -= combatWeight * 0.75;
          if (bones.upperarm_l) { bones.upperarm_l.bone.rotation.z -= combatWeight * 0.22; bones.upperarm_l.bone.rotation.y += combatWeight * 0.18; }
          if (bones.upperarm_r) { bones.upperarm_r.bone.rotation.z -= combatWeight * 0.14; bones.upperarm_r.bone.rotation.y -= combatWeight * 0.18; }
          // Curl wrists inward slightly
          if (bones.hand_l) bones.hand_l.bone.rotation.y += combatWeight * 0.4;
          if (bones.hand_r) bones.hand_r.bone.rotation.y -= combatWeight * 0.4;
          
          if (bones.spine_01)   bones.spine_01.bone.rotation.x  += combatWeight * 0.07;
          if (bones.upperarm_l) bones.upperarm_l.bone.rotation.z += battleBounce * 0.028 * combatWeight;
          if (bones.upperarm_r) bones.upperarm_r.bone.rotation.z -= battleBounce * 0.028 * combatWeight;
        }

        if (calmW > 0.005) {
          if (bones.upperarm_l) bones.upperarm_l.bone.rotation.z += breath * 0.022 * calmW;
          if (bones.upperarm_r) bones.upperarm_r.bone.rotation.z -= breath * 0.022 * calmW;
          if (bones.spine_01)   bones.spine_01.bone.rotation.x   += breath * 0.015 * calmW;
        }
      }

      // ── 3. ROOT POSITIONING (Always anchored to base coordinates) ─────────
      model.position.x = baseX;
      model.position.z = baseZ + (attackPhase > 0 ? s * 0.03 : 0);
      model.position.y = baseY + (
        isMoving  ? Math.abs(Math.sin(time * 0.018)) * 0.024 :
        inCombat  ? Math.abs(Math.sin(time * 0.006)) * 0.010 :
                    Math.sin(time * 0.003) * 0.003
      );
    },

    data:{ id:'theodore', embeddedAnimations: model.animations?.length || 0 }
  };
}
