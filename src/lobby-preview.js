import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadWydCharacter } from './wyd-character.js';

// Isolated preview: choosing an appearance never mutates the saved game.
export function createLobbyPreview() {
  const host = document.getElementById('character-preview');
  const status = document.getElementById('preview-status');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI / 2.8;
  controls.maxPolarAngle = Math.PI / 2;
  scene.add(new THREE.HemisphereLight(0xdbe9ff, 0x494334, 2.5));
  const key = new THREE.DirectionalLight(0xffe2b5, 3);
  key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xadcaff, 2);
  rim.position.set(-3, 3, -2); scene.add(rim);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.22, .09, 80), new THREE.MeshStandardMaterial({ color: 0x303b3e, roughness: .85, metalness: .3 }));
  pedestal.position.y = -.075; scene.add(pedestal);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.03, 1.045, 80), new THREE.MeshBasicMaterial({color:0xb69a61,side:THREE.DoubleSide}));
  ring.rotation.x = -Math.PI/2; ring.position.y = -.025; scene.add(ring);
  const cache = new Map();
  let current, container, version = 0;
  new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }).observe(host);
  renderer.setAnimationLoop(time => {
    if (document.getElementById('lobby').style.display === 'none' || document.hidden) return;
    current?.update(time, { moving:false, attackPhase:0, inCombat:false });
    renderer.render(scene, camera);
  });
  return async kind => {
    const request = ++version;
    status.hidden = false; status.textContent = 'Carregando personagem…';
    if (container) { scene.remove(container); container = null; current = null; }
    try {
      if (!cache.has(kind)) cache.set(kind, kind === 'theodore'
        ? import('./fbx-character.js').then(m => m.loadTheodoreCharacter(renderer))
        : loadWydCharacter(`/assets/character/${kind === 'foema' ? 'ch02' : 'ch01'}-basic.json`, renderer));
      const model = await cache.get(kind);
      if (request !== version) return;
      current = model;
      current.update(0, { moving:false, attackPhase:0, inCombat:false });
      container = new THREE.Group(); container.add(model.group);
      container.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.4 / (size.y || 1);
      container.scale.setScalar(scale);
      container.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      scene.add(container);
      controls.target.set(0, 1.15, 0);
      camera.position.set(0, 1.8, 6.8);
      controls.update(); status.hidden = true;
    } catch (error) {
      cache.delete(kind);
      if (request === version) status.textContent = 'Prévia indisponível. Você ainda pode entrar no mundo.';
      console.warn('Prévia do personagem:', error);
    }
  };
}
