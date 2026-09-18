import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import {
  fresh,
  damage,
  defense,
  maxHp,
  maxMp,
  price,
  reward,
  upgrade,
  allocateStat,
  claimQuest,
  restore,
} from './game.js';
import { ITEM_DEFS, loadOfficialItems } from './items.js';
import { sfx, preloadSounds } from './sound.js';
import { loadWydCharacter } from './wyd-character.js';
import { loadWydWorld } from './wyd-world.js';
import './style.css';
import './lobby.css';
import { createLobbyPreview } from './lobby-preview.js';

const $ = (id) => document.getElementById(id);
const key = 'wyd-web-test-v1';
const characterKey = 'wyd-character-model';

let state = restore(localStorage.getItem(key));
let currentHp = maxHp(state);
let currentMp = maxMp(state);
let enemyMaxHp = 60;
let enemyCurrentHp = 60;
let auto = false;
let lastHit = 0;
let terrain, world, terrainData;
let worldReady = false;
let worldColliders = [];
let loadVersion = 0;
let moveTarget = null;
let activeMapId = 'Field1616';

// Backend WebSocket (com fallback gracioso offline)
let ws = null;
try {
  ws = new WebSocket('ws://127.0.0.1:7556');
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'login', username: 'testuser' }));
    log('Conectado ao servidor autoritativo Kersef.');
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'sync') {
      state = { ...state, ...msg.state };
      updateUI();
    }
  };
  ws.onerror = () => log('Servidor offline. Modo local e persistência ativados.');
} catch {
  log('Iniciando em modo offline.');
}

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    log('Armazenamento local indisponível.');
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'save', state }));
  }
}

const log = (text) => {
  const p = document.createElement('p');
  p.textContent = text;
  $('log').prepend(p);
  while ($('log').children.length > 10) $('log').lastChild.remove();
};

// Floating Combat Text
function showFloatingText(text, type = 'damage', screenX, screenY) {
  const container = $('floating-combat');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `floating-num f-${type}`;
  el.textContent = text;

  const left = screenX !== undefined ? screenX : window.innerWidth / 2 + (Math.random() * 80 - 40);
  const top = screenY !== undefined ? screenY : window.innerHeight / 2 - 40 + (Math.random() * 40 - 20);

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// 3D Scene Setup
const host = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#141d24');
scene.fog = new THREE.Fog('#141d24', 45, 115);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
let renderer, labelRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  $('loading').textContent = 'WebGL indisponível neste navegador.';
  throw e;
}
const pixelRatioCap = matchMedia('(pointer: coarse)').matches ? 1.25 : 1.75;
renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap));
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.prepend(renderer.domElement);

labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(host.clientWidth, host.clientHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
host.appendChild(labelRenderer.domElement);

renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Mundo 3D WYD. Use WASD ou clique para andar.');
renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 5;
controls.maxDistance = 80;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

scene.add(new THREE.HemisphereLight(0xe2ecd2, 0x35452c, 2.2));
const sun = new THREE.DirectionalLight(0xffe4af, 2.5);
sun.position.set(20, 40, 10);
scene.add(sun);
const fillLight = new THREE.DirectionalLight(0x8fa3c7, 1.2);
fillLight.position.set(-20, 20, -10);
scene.add(fillLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

new ResizeObserver(() => {
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  labelRenderer.setSize(host.clientWidth, host.clientHeight);
}).observe(host);

// Entity Pawn
function pawn(color, name, isEnemy) {
  const g = new THREE.Group();
  const div = document.createElement('div');
  div.className = 'name-tag' + (isEnemy ? ' enemy' : '');
  div.innerHTML = `${name}<div class="hp-bar"><div class="hp-fill" style="width:100%"></div></div>`;
  const label = new CSS2DObject(div);
  label.position.set(0, 1.8, 0);
  g.add(label);
  g.userData = { name, isEnemy, labelDiv: div };
  scene.add(g);
  return g;
}

let hero = pawn(0x819ec6, 'Personagem', false);
let enemy = null;
let originalHero = null;
let characterRoot = null;
let enemyController = null;
let enemyActors = [];
let activeEnemyActor = null;
let clickAttackTarget = null;
const characterCache = new Map();

const REGION_CREATURES = {
  armia: [
    { id: 'bo01', name: 'Javali Selvagem', hp: 60, scale: 1 },
    { id: 'wf01', name: 'Lobo Cinzento', hp: 72, scale: 0.95 },
    { id: 'be01', name: 'Urso de Armia', hp: 95, scale: 1.05 },
    { id: 'tg01', name: 'Tigre Errante', hp: 110, scale: 0.96 },
  ],
  azran: [
    { id: 'hy01', name: 'Hidra Jovem', hp: 105, scale: 0.48 },
    { id: 'sp01', name: 'Aranha de Azran', hp: 92, scale: 0.5 },
    { id: 'gg01', name: 'Gárgula Antiga', hp: 128, scale: 0.44 },
    { id: 'dr02', name: 'Draconiano', hp: 145, scale: 0.48 },
  ],
  erion: [
    { id: 'bd02', name: 'Ave de Erion', hp: 88, scale: 0.92 },
    { id: 'lb01', name: 'Lobisomem', hp: 120, scale: 0.92 },
    { id: 'lk01', name: 'Cavaleiro Perdido', hp: 142, scale: 0.92 },
    { id: 'bt01', name: 'Morcego Sombrio', hp: 76, scale: 0.85 },
  ],
  kersef: [
    { id: 'cr01', name: 'Criatura de Kersef', hp: 95, scale: 0.92 },
    { id: 'gr01', name: 'Guerreiro Selvagem', hp: 118, scale: 0.92 },
    { id: 'cp01', name: 'Escorpião', hp: 104, scale: 0.88 },
    { id: 'kk01', name: 'Guardião Antigo', hp: 150, scale: 0.92 },
  ],
};

const REGION_QUESTS = {
  armia: { region: 'armia', mobId: 'bo01', targetName: 'Javalis Selvagens', title: 'Caçada em Armia', desc: 'Elimine javalis selvagens nos arredores de Armia.', target: 10, rewardXp: 250, rewardGold: 100 },
  azran: { region: 'azran', mobId: 'sp01', targetName: 'Aranhas de Azran', title: 'Teias nas ruínas', desc: 'Afaste as aranhas que ocupam os arredores de Azran.', target: 8, rewardXp: 320, rewardGold: 140 },
  erion: { region: 'erion', mobId: 'lb01', targetName: 'Lobisomens', title: 'A ameaça de Erion', desc: 'Derrote os lobisomens que rondam os campos de Erion.', target: 8, rewardXp: 400, rewardGold: 180 },
  kersef: { region: 'kersef', mobId: 'cr01', targetName: 'Criaturas de Kersef', title: 'Terras desconhecidas', desc: 'Investigue e elimine criaturas nos setores distantes.', target: 8, rewardXp: 450, rewardGold: 220 },
};

function regionForMap(mapId) {
  const sector = Number(mapId.slice(5, 7));
  if (sector === 16) return 'armia';
  if (sector === 13 || sector === 14) return 'azran';
  if (sector === 15 || sector === 17 || sector === 18) return 'erion';
  return 'kersef';
}

function creaturesForMap(mapId) {
  return REGION_CREATURES[regionForMap(mapId)];
}

function ensureRegionalQuest(mapId) {
  if (state.quest && !state.quest.claimed) return;
  state.quest = { ...REGION_QUESTS[regionForMap(mapId)], progress: 0, claimed: false };
  save();
  updateUI();
}

function setActiveEnemy(actor) {
  if (!actor?.alive) return;
  activeEnemyActor = actor;
  enemy = actor.root;
  enemyController = actor.controller;
  enemyMaxHp = actor.maxHp;
  enemyCurrentHp = actor.hp;
  $('enemy-name').textContent = actor.name;
  $('enemy-level-tag').textContent = `Nv. ${actor.level}`;
  updateUI();
}

function nearestLivingEnemy(maxDistance = Infinity) {
  let nearest = null;
  let distance = maxDistance;
  for (const actor of enemyActors) {
    if (!actor.alive || !actor.root.visible) continue;
    const current = hero.position.distanceTo(actor.root.position);
    if (current < distance) {
      nearest = actor;
      distance = current;
    }
  }
  return nearest;
}

async function createEnemyActor(spec, position, index) {
  const root = pawn(0xa76543, spec.name, true);
  root.position.copy(position);
  const actor = {
    ...spec,
    root,
    controller: null,
    maxHp: spec.hp,
    hp: spec.hp,
    level: 2 + index,
    alive: true,
    dyingUntil: 0,
    respawnAt: 0,
    hitUntil: 0,
    attackUntil: 0,
    nextAttackAt: 0,
    home: position.clone(),
    wanderAngle: index * 1.7,
    wanderTarget: new THREE.Vector3(),
    wanderStep: new THREE.Vector3(),
  };
  try {
    const controller = await loadWydCharacter(`/assets/creatures/${spec.id}/${spec.id}.json`, renderer);
    controller.group.scale.setScalar(spec.scale);
    const label = root.children.find((child) => child instanceof CSS2DObject);
    while (root.children.length) root.remove(root.children[0]);
    if (label) root.add(label);
    root.add(controller.group);
    controller.group.traverse((object) => {
      if (object.isMesh) object.userData.enemyActor = actor;
    });
    actor.controller = controller;
  } catch (error) {
    console.warn(`Criatura ${spec.id} indisponível:`, error);
  }
  return actor;
}

function openPositionNear(origin, offsetX = 0, offsetZ = 0) {
  const desired = new THREE.Vector3(origin.x + offsetX, 0, origin.z + offsetZ);
  if (!isBlocked(desired)) {
    desired.y = height(desired.x, desired.z);
    return desired;
  }
  for (let radius = 2; radius <= 10; radius += 1.5) {
    for (let step = 0; step < 12; step++) {
      const angle = (step / 12) * Math.PI * 2;
      desired.set(origin.x + Math.cos(angle) * radius, 0, origin.z + Math.sin(angle) * radius);
      if (!isBlocked(desired)) {
        desired.y = height(desired.x, desired.z);
        return desired;
      }
    }
  }
  desired.copy(origin);
  desired.y = height(desired.x, desired.z);
  return desired;
}

function safestMapSpawn(preferred = new THREE.Vector3(32, 0, 32)) {
  const candidate = preferred.clone();
  for (let radius = 0; radius <= 28; radius += 2) {
    const steps = radius === 0 ? 1 : Math.max(12, Math.ceil(radius * 2.4));
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      candidate.set(preferred.x + Math.cos(angle) * radius, 0, preferred.z + Math.sin(angle) * radius);
      if (candidate.x < 5 || candidate.x > 59 || candidate.z < 5 || candidate.z > 59) continue;
      if (isBlocked(candidate, 2.2)) continue;
      const slope = Math.max(
        Math.abs(height(candidate.x + 0.8, candidate.z) - height(candidate.x - 0.8, candidate.z)),
        Math.abs(height(candidate.x, candidate.z + 0.8) - height(candidate.x, candidate.z - 0.8))
      );
      if (slope > 0.65) continue;
      candidate.y = height(candidate.x, candidate.z);
      return candidate.clone();
    }
  }
  candidate.copy(preferred);
  candidate.y = height(candidate.x, candidate.z);
  return candidate;
}

async function populateEnemies(mapId, spawn, version) {
  enemyActors.forEach((actor) => {
    actor.root.userData.labelDiv?.remove();
    scene.remove(actor.root);
  });
  enemyActors = [];
  activeEnemyActor = null;
  enemy = null;
  enemyController = null;
  const offsets = [[3, 1], [-4, 3], [5, -4], [-5, -4]];
  const specs = creaturesForMap(mapId);
  const actors = await Promise.all(specs.map((spec, index) => {
    const [dx, dz] = offsets[index];
    const position = openPositionNear(spawn, dx, dz);
    return createEnemyActor(spec, position, index);
  }));
  if (version !== loadVersion) {
    actors.forEach((actor) => {
      actor.root.userData.labelDiv?.remove();
      scene.remove(actor.root);
    });
    return;
  }
  enemyActors = actors;
  setActiveEnemy(nearestLivingEnemy());
  log(`${actors.length} criaturas originais apareceram na região.`);
}

async function selectCharacter(kind) {
  const charDisplayName =
    kind === 'theodore' ? 'Boss Baby' : kind === 'foema' ? 'Foema' : 'TransKnight';

  if (!characterCache.has(kind)) {
    log(`Carregando ${charDisplayName}…`);
    if (kind === 'theodore') {
      const { loadTheodoreCharacter } = await import('./fbx-character.js');
      characterCache.set(kind, await loadTheodoreCharacter(renderer));
    } else if (kind === 'foema') {
      characterCache.set(kind, await loadWydCharacter('/assets/character/ch02-basic.json', renderer));
    } else {
      characterCache.set(kind, await loadWydCharacter('/assets/character/ch01-basic.json', renderer));
    }
  }

  const controller = characterCache.get(kind);
  if (!characterRoot) {
    const old = hero;
    characterRoot = new THREE.Group();
    characterRoot.position.copy(old.position);
    hero = characterRoot;
    scene.remove(old);
    scene.add(hero);
  }

  if (originalHero?.group) characterRoot.remove(originalHero.group);
  originalHero = controller;
  characterRoot.add(controller.group);
  localStorage.setItem(characterKey, kind);
  state.hero = charDisplayName;
  save();
  updateUI();
  log(`Personagem ativo: ${charDisplayName}.`);
}

// Terreno e Alturas
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.65, 0.72, 48),
  new THREE.MeshBasicMaterial({ color: 0xdac27c, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
scene.add(ring);

const destinationRing = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.32, 32),
  new THREE.MeshBasicMaterial({ color: 0xd9bd72, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
);
destinationRing.rotation.x = -Math.PI / 2;
destinationRing.visible = false;
scene.add(destinationRing);

function height(x, z) {
  if (!terrainData) return 0;
  const x0 = Math.max(0, Math.min(62, Math.floor(x)));
  const z0 = Math.max(0, Math.min(62, Math.floor(z)));
  const fx = x - x0;
  const fz = z - z0;
  const h = (ix, iz) => terrainData.tiles[iz * 64 + ix][0] * 0.1;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(h(x0, z0), h(x0 + 1, z0), fx),
    THREE.MathUtils.lerp(h(x0, z0 + 1), h(x0 + 1, z0 + 1), fx),
    fz
  );
}

function canMove(from, to) {
  return !worldColliders.some((c) => {
    const will = Math.hypot(to.x - c.x, to.z - c.z) < c.radius + 0.28;
    const was = Math.hypot(from.x - c.x, from.z - c.z) < c.radius + 0.28;
    return will && !was;
  });
}

function isBlocked(position, padding = 0.35) {
  return worldColliders.some((c) => Math.hypot(position.x - c.x, position.z - c.z) < c.radius + padding);
}

function centerCamera() {
  const { x, y, z } = hero.position;
  const offset = activeMapId === 'Field1314' ? [-10, 9, -8] : [10, 8.5, 12];
  controls.target.set(x, y + 0.7, z);
  camera.position.set(x + offset[0], y + offset[1], z + offset[2]);
  controls.update();
  sfx.click();
}
$('btn-center').onclick = centerCamera;

// Movimentação por teclado
const held = new Set();
addEventListener('keydown', (event) => {
  if ($('lobby').style.display !== 'none') return;
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
  if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(event.code)) {
    held.add(event.code);
    event.preventDefault();
  }
});
addEventListener('keyup', (event) => held.delete(event.code));
addEventListener('blur', () => held.clear());

// Movimentação por clique
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerStart = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!terrain || !pointerStart || Math.hypot(e.clientX - pointerStart[0], e.clientY - pointerStart[1]) > 5)
    return;
  const box = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const enemyHit = raycaster.intersectObjects(enemyActors.filter((actor) => actor.alive).map((actor) => actor.root), true)
    .find((entry) => entry.object.userData.enemyActor);
  if (enemyHit) {
    const actor = enemyHit.object.userData.enemyActor;
    setActiveEnemy(actor);
    clickAttackTarget = actor;
    $('target-card').classList.remove('is-hidden');
    if (hero.position.distanceTo(actor.root.position) > 4) moveTarget = actor.root.position.clone();
    return;
  }
  clickAttackTarget = null;
  const hit = raycaster.intersectObject(terrain, true)[0];
  if (hit) {
    moveTarget = hit.point.clone();
    moveTarget.y = height(moveTarget.x, moveTarget.z);
    destinationRing.position.set(moveTarget.x, moveTarget.y + 0.05, moveTarget.z);
    destinationRing.visible = true;
  }
});

const minimapCanvas = $('minimap-canvas');
const minimapContext = minimapCanvas.getContext('2d');
const minimapBase = document.createElement('canvas');
minimapBase.width = minimapBase.height = 64;
const minimapBaseContext = minimapBase.getContext('2d');

function rebuildMinimap() {
  if (!terrainData) return;
  const pixels = minimapBaseContext.createImageData(64, 64);
  for (let z = 0; z < 64; z++) {
    for (let x = 0; x < 64; x++) {
      const tile = terrainData.tiles[z * 64 + x];
      const offset = (z * 64 + x) * 4;
      const h = THREE.MathUtils.clamp(tile[0] + 110, 45, 180);
      pixels.data[offset] = h * 0.52;
      pixels.data[offset + 1] = h * 0.66;
      pixels.data[offset + 2] = h * 0.43;
      pixels.data[offset + 3] = 255;
    }
  }
  minimapBaseContext.putImageData(pixels, 0, 0);
}

function drawMinimap() {
  if (!terrainData || $('minimap').classList.contains('is-hidden')) return;
  const size = minimapCanvas.width;
  minimapContext.clearRect(0, 0, size, size);
  minimapContext.imageSmoothingEnabled = false;
  minimapContext.drawImage(minimapBase, 0, 0, size, size);
  minimapContext.fillStyle = 'rgba(8, 12, 16, .42)';
  for (const collider of worldColliders) {
    minimapContext.beginPath();
    minimapContext.arc(collider.x / 64 * size, collider.z / 64 * size, Math.max(1, collider.radius / 64 * size), 0, Math.PI * 2);
    minimapContext.fill();
  }
  for (const actor of enemyActors) {
    if (!actor.alive) continue;
    minimapContext.fillStyle = actor === activeEnemyActor ? '#ffdf72' : '#d15c4d';
    minimapContext.beginPath();
    minimapContext.arc(actor.root.position.x / 64 * size, actor.root.position.z / 64 * size, actor === activeEnemyActor ? 3.5 : 2.3, 0, Math.PI * 2);
    minimapContext.fill();
  }
  minimapContext.fillStyle = '#f7f1d2';
  minimapContext.beginPath();
  minimapContext.arc(hero.position.x / 64 * size, hero.position.z / 64 * size, 3.5, 0, Math.PI * 2);
  minimapContext.fill();
  minimapContext.strokeStyle = '#151a1d';
  minimapContext.stroke();
}

minimapCanvas.addEventListener('click', (event) => {
  if (!terrainData) return;
  const box = minimapCanvas.getBoundingClientRect();
  moveTarget = new THREE.Vector3(
    THREE.MathUtils.clamp((event.clientX - box.left) / box.width * 64, .5, 62.5),
    0,
    THREE.MathUtils.clamp((event.clientY - box.top) / box.height * 64, .5, 62.5)
  );
  moveTarget.y = height(moveTarget.x, moveTarget.z);
  destinationRing.position.set(moveTarget.x, moveTarget.y + .05, moveTarget.z);
  destinationRing.visible = true;
});

// Sound toggle
$('btn-sound').onclick = () => {
  const muted = sfx.toggleMute();
  $('svg-sound-on').classList.toggle('is-hidden', muted);
  $('svg-sound-off').classList.toggle('is-hidden', !muted);
  log(muted ? 'Áudio desativado.' : 'Áudio ativado.');
};

// Switch Hero
$('btn-switch-hero').onclick = () => {
  $('lobby').style.display = 'flex';
  setLobbyInert(true);
  held.clear();
  chooseLobbyCharacter(localStorage.getItem(characterKey) || 'theodore');
  $('enter-world').focus();
  closeAllWindows();
  sfx.click();
};

// Tooltip de itens
const tooltip = $('item-tooltip');
function showTooltip(item, e) {
  const def = ITEM_DEFS[item.itemId];
  if (!def) return;
  $('tt-title').textContent = `${def.name} ${item.refine ? `+${item.refine}` : ''}`;
  $('tt-title').style.color =
    def.rarity === 'unique'
      ? '#d154ff'
      : def.rarity === 'rare'
      ? '#ffd700'
      : def.rarity === 'magic'
      ? '#60a5fa'
      : '#fff';
  $('tt-type').textContent = `${def.type.toUpperCase()} · ${def.slot ? def.slot.toUpperCase() : 'CONSUMÍVEL'}`;

  let statsHtml = '';
  if (def.atk) statsHtml += `<span style="color: #ef4444; font-weight: bold;">Ataque: +${def.atk + (item.refine || 0) * 4}</span>`;
  if (def.def) statsHtml += `<span style="color: #3b82f6; font-weight: bold;">Defesa: +${def.def + (item.refine || 0) * 3}</span>`;
  if (def.hp) statsHtml += `<span style="color: #10b981;">HP: +${def.hp}</span>`;
  if (def.mp) statsHtml += `<span style="color: #6366f1;">MP: +${def.mp}</span>`;
  if (def.value && def.type === 'consumable') statsHtml += `<span style="color: #34d399;">Efeito: +${def.value}</span>`;

  // Requisitos de atributos (estilo clássico WYD)
  if (def.reqLevel) statsHtml += `<span style="color: ${state.level >= def.reqLevel ? '#4ade80' : '#f87171'};">Nível: ${def.reqLevel}</span>`;
  if (def.reqStr) statsHtml += `<span style="color: ${(state.str || 15) >= def.reqStr ? '#4ade80' : '#f87171'};">Força: ${def.reqStr}</span>`;
  if (def.reqInt) statsHtml += `<span style="color: ${(state.int || 10) >= def.reqInt ? '#4ade80' : '#f87171'};">Inteligência: ${def.reqInt}</span>`;
  if (def.reqDex) statsHtml += `<span style="color: ${(state.dex || 12) >= def.reqDex ? '#4ade80' : '#f87171'};">Destreza: ${def.reqDex}</span>`;
  if (def.reqCon) statsHtml += `<span style="color: ${(state.con || 14) >= def.reqCon ? '#4ade80' : '#f87171'};">Constituição: ${def.reqCon}</span>`;

  statsHtml += `<span style="color: #fbbf24;">Preço: ${Number(def.price || 0).toLocaleString('pt-BR')} Ouro</span>`;

  $('tt-stats').innerHTML = statsHtml;
  $('tt-desc').textContent = def.desc;
  tooltip.classList.remove('is-hidden');

  const x = Math.min(e.clientX + 14, window.innerWidth - 240);
  const y = Math.min(e.clientY + 14, window.innerHeight - 160);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
function hideTooltip() {
  tooltip.classList.add('is-hidden');
}

function itemIconStyle(def) {
  if (def.usesBaseAtlas) {
    return `background-image:url('/assets/itemicon-base.png');background-size:400px 3550px;background-position:${-(def.iconX + 1) * 35}px ${-(def.iconY + 1) * 35}px`;
  }
  const sheet = String(def.sheetNum || 1).padStart(2, '0');
  return `background-image:url('/assets/itemicon${sheet}.png');background-size:350px 350px;background-position:${-def.iconX * 35}px ${-def.iconY * 35}px`;
}

// Renderização do Inventário
function renderInventory() {
  const grid = $('inv-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 20; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    const item = state.inventory[i];
    if (item) {
      const def = ITEM_DEFS[item.itemId];
      if (def) {
        slot.innerHTML = `<i class="item-icon" style="${itemIconStyle(def)}"></i>`;
        if (item.count > 1) {
          slot.innerHTML += `<span class="item-count">${item.count}</span>`;
        }
        slot.onmouseenter = (e) => showTooltip(item, e);
        slot.onmouseleave = hideTooltip;
        slot.onclick = () => {
          sfx.item();
          useOrEquipItem(i);
        };
      }
    }
    grid.appendChild(slot);
  }

  // Equipment slots
  document.querySelectorAll('.equip-slot').forEach((slotEl) => {
    const slotType = slotEl.dataset.slot;
    const equipped = state.equipment[slotType];
    slotEl.innerHTML = '';
    if (equipped) {
      const def = ITEM_DEFS[equipped.itemId];
      if (def) {
        slotEl.innerHTML = `<i class="item-icon" style="${itemIconStyle(def)}"></i>`;
        slotEl.onmouseenter = (e) => showTooltip(equipped, e);
        slotEl.onmouseleave = hideTooltip;
        slotEl.onclick = () => {
          sfx.item();
          unequipItem(slotType);
        };
      }
    }
  });

  $('inventory-gold-val').textContent = `${state.gold.toLocaleString('pt-BR')} Ouro`;
  const totalItems = state.inventory.reduce((acc, it) => acc + (it ? 1 : 0), 0);
  $('dock-inv-count').textContent = totalItems;
}

// Uso e Equipamento de Itens
function useOrEquipItem(invIndex) {
  const item = state.inventory[invIndex];
  if (!item) return;
  const def = ITEM_DEFS[item.itemId];
  if (!def) return;

  if (def.type === 'consumable') {
    if (def.effect === 'heal_hp') {
      currentHp = Math.min(maxHp(state), currentHp + def.value);
      showFloatingText(`+${def.value} HP`, 'heal');
      sfx.potion();
    } else if (def.effect === 'heal_mp') {
      currentMp = Math.min(maxMp(state), currentMp + def.value);
      showFloatingText(`+${def.value} MP`, 'xp');
      sfx.potion();
    }
    item.count--;
    if (item.count <= 0) state.inventory.splice(invIndex, 1);
    save();
    updateUI();
    return;
  }

  if (def.slot) {
    const currentEquip = state.equipment[def.slot];
    state.equipment[def.slot] = item;
    if (currentEquip) {
      state.inventory[invIndex] = currentEquip;
    } else {
      state.inventory.splice(invIndex, 1);
    }
    sfx.inventory();
    log(`Equipado: ${def.name}.`);
    save();
    updateUI();
  }
}

function unequipItem(slotType) {
  const item = state.equipment[slotType];
  if (!item) return;
  if (state.inventory.length >= 20) {
    log('Inventário cheio!');
    return;
  }
  state.equipment[slotType] = null;
  state.inventory.push(item);
  sfx.inventory();
  save();
  updateUI();
}

// Uso de Poções via Hotbar (Atalhos 1 e 2)
function useQuickPotion(type) {
  const idx = state.inventory.findIndex((it) => {
    const d = ITEM_DEFS[it.itemId];
    return d && (d.effect === (type === 'hp' ? 'heal_hp' : 'heal_mp') || (type === 'hp' ? it.itemId === 400 : it.itemId === 403));
  });
  if (idx !== -1) {
    useOrEquipItem(idx);
  } else {
    log(`Sem poção de ${type.toUpperCase()} no inventário!`);
  }
}

// Habilidades
function castSkill(skillId) {
  if (skillId === 'bash') {
    if (currentMp < 15) {
      log('Mana insuficiente para Golpe Poderoso!');
      return;
    }
    currentMp -= 15;
    sfx.swing();
    const dmg = Math.round(damage(state) * 2.2);
    activeEnemyActor.hp = Math.max(0, activeEnemyActor.hp - dmg);
    enemyCurrentHp = activeEnemyActor.hp;
    showFloatingText(`CRÍTICO! ${dmg}`, 'damage');
    log(`Golpe Poderoso causou ${dmg} de dano!`);
    sfx.hit();
    checkEnemyStatus();
    updateUI();
  } else if (skillId === 'heal') {
    if (currentMp < 25) {
      log('Mana insuficiente para Cura Sagrada!');
      return;
    }
    currentMp -= 25;
    currentHp = Math.min(maxHp(state), currentHp + 80);
    sfx.potion();
    showFloatingText('+80 HP', 'heal');
    log('Cura Sagrada restaurou 80 HP.');
    updateUI();
  }
}

// Atualização Geral de UI
function updateUI() {
  $('lobby-level').textContent = `Nível ${state.level}`;
  const curMaxHp = maxHp(state);
  const curMaxMp = maxMp(state);
  currentHp = Math.min(curMaxHp, currentHp);
  currentMp = Math.min(curMaxMp, currentMp);

  // Top bar
  $('top-char-name').textContent = state.hero;
  $('top-char-lvl').textContent = `Nv. ${state.level}`;
  $('gold').textContent = state.gold.toLocaleString('pt-BR');

  // Orbes
  $('hp-liquid').style.height = `${Math.max(4, (currentHp / curMaxHp) * 100)}%`;
  $('hp-text').textContent = `${currentHp} / ${curMaxHp}`;
  $('mp-liquid').style.height = `${Math.max(4, (currentMp / curMaxMp) * 100)}%`;
  $('mp-text').textContent = `${currentMp} / ${curMaxMp}`;

  // EXP bar
  const maxExp = state.level * 100;
  const expPercent = ((state.xp / maxExp) * 100).toFixed(1);
  $('exp-fill').style.width = `${expPercent}%`;
  $('exp-text').textContent = `EXP ${state.xp} / ${maxExp} (${expPercent}%)`;

  // Janela de Personagem
  $('char-class-name').textContent = state.hero;
  $('char-level').textContent = state.level;
  $('char-xp-label').textContent = `${state.xp} / ${maxExp}`;
  $('stat-points-val').textContent = state.statPoints || 0;
  $('stat-str').textContent = state.str || 15;
  $('stat-int').textContent = state.int || 10;
  $('stat-dex').textContent = state.dex || 12;
  $('stat-con').textContent = state.con || 14;
  $('char-attack-val').textContent = damage(state);
  $('char-defense-val').textContent = defense(state);
  $('char-kills-val').textContent = state.kills;
  $('upgrade').textContent = `Melhorar Arma (+${state.weapon || 0}) [${price(state)}g]`;
  $('upgrade').disabled = state.gold < price(state);

  // Pote de Poções na Hotbar
  const hpTotal = state.inventory.reduce((acc, it) => {
    const d = ITEM_DEFS[it.itemId];
    return acc + (d && (d.effect === 'heal_hp' || it.itemId === 400) ? (it.count || 1) : 0);
  }, 0);
  const mpTotal = state.inventory.reduce((acc, it) => {
    const d = ITEM_DEFS[it.itemId];
    return acc + (d && (d.effect === 'heal_mp' || it.itemId === 403) ? (it.count || 1) : 0);
  }, 0);
  $('slot-hp-count').textContent = hpTotal;
  $('slot-mp-count').textContent = mpTotal;
  const hpVisual = document.querySelector('.hp-potion-visual');
  const mpVisual = document.querySelector('.mp-potion-visual');
  if (hpVisual && ITEM_DEFS[400]) hpVisual.style.cssText = itemIconStyle(ITEM_DEFS[400]);
  if (mpVisual && ITEM_DEFS[403]) mpVisual.style.cssText = itemIconStyle(ITEM_DEFS[403]);

  // Janela de Quests
  if (state.quest) {
    $('quest-title').textContent = state.quest.title;
    $('quest-desc').textContent = state.quest.desc;
    const qPct = Math.min(100, (state.quest.progress / state.quest.target) * 100);
    $('quest-progress-bar').style.width = `${qPct}%`;
    $('quest-progress-text').textContent = `${state.quest.progress} / ${state.quest.target} ${state.quest.targetName || 'alvos'}`;
    $('quest-reward-text').textContent = `+${state.quest.rewardXp} EXP · +${state.quest.rewardGold} Ouro`;
    const claimBtn = $('claim-quest-btn');
    claimBtn.disabled = state.quest.claimed || state.quest.progress < state.quest.target;
    claimBtn.textContent = state.quest.claimed ? 'Missão Concluída!' : 'Resgatar Recompensa';
  }

  // Alvo
  $('enemy-hp-fill').style.width = `${(enemyCurrentHp / enemyMaxHp) * 100}%`;
  $('enemy-hp-text').textContent = `${enemyCurrentHp} / ${enemyMaxHp}`;

  renderInventory();
}

// Botões de Atributos [+]
document.querySelectorAll('.btn-add-point').forEach((btn) => {
  btn.onclick = () => {
    const stat = btn.dataset.stat;
    if (allocateStat(state, stat)) {
      sfx.click();
      save();
      updateUI();
      log(`+1 ponto distribuído em ${stat.toUpperCase()}.`);
    } else {
      log('Sem pontos disponíveis.');
    }
  };
});

// Recompensa de Quest
$('claim-quest-btn').onclick = () => {
  if (claimQuest(state)) {
    sfx.levelUp();
    showFloatingText('+250 EXP', 'xp');
    showFloatingText('+100 Ouro', 'gold');
    log('Missão "Caçada em Armia" concluída!');
    save();
    updateUI();
  }
};

// Refinação de arma
$('upgrade').onclick = () => {
  if (upgrade(state)) {
    sfx.levelUp();
    showFloatingText('ARMA +1!', 'gold');
    log('Arma melhorada! Dano aumentado.');
    save();
    updateUI();
  }
};

// Controle de Janelas
function closeAllWindows() {
  document.querySelectorAll('.modal-window').forEach((w) => w.classList.add('is-hidden'));
  document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('active'));
}

function toggleWindow(id, dockBtnId) {
  const win = $(id);
  if (!win) return;
  const isHidden = win.classList.contains('is-hidden');
  closeAllWindows();
  if (isHidden) {
    win.classList.remove('is-hidden');
    if (dockBtnId) $(dockBtnId)?.classList.add('active');
    sfx.toggle();
  } else {
    sfx.toggle();
  }
}

$('btn-dock-status').onclick = () => toggleWindow('character-window', 'btn-dock-status');
$('btn-dock-inv').onclick = () => toggleWindow('inventory-window', 'btn-dock-inv');
$('btn-dock-skills').onclick = () => toggleWindow('skills-window', 'btn-dock-skills');
$('btn-dock-quests').onclick = () => toggleWindow('quests-window', 'btn-dock-quests');
$('btn-help').onclick = () => toggleWindow('help-window');
document.querySelectorAll('.window-close-btn').forEach((btn) => {
  btn.onclick = () => {
    const winId = btn.dataset.close;
    if (winId) $(winId).classList.add('is-hidden');
    else btn.closest('section')?.classList.add('is-hidden');
    document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('active'));
    sfx.toggle();
  };
});

// Chat toggle
$('toggle-chat').onclick = () => {
  $('chat-box').classList.toggle('chat-collapsed');
};

// Hotbar Clicks
$('slot-1').onclick = () => useQuickPotion('hp');
$('slot-2').onclick = () => useQuickPotion('mp');
$('slot-3').onclick = () => castSkill('bash');
$('slot-4').onclick = () => castSkill('heal');
$('slot-5').onclick = () => {
  auto = !auto;
  $('slot-5').classList.toggle('active', auto);
  $('target-card').classList.remove('is-hidden');
  sfx.click();
  log(auto ? 'Caça automática ATIVADA.' : 'Caça automática PAUSADA.');
};

document.querySelectorAll('.btn-use-skill').forEach((btn) => {
  btn.onclick = () => castSkill(btn.dataset.skill);
});

// Teclas de Atalho Globais
addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if (typing || e.repeat || $('lobby').style.display !== 'none') return;
  const handled = /^(KeyC|KeyV|KeyI|KeyK|KeyQ|KeyH|KeyM|Digit[1-5]|Space|Escape)$/.test(e.code);
  if (handled) e.preventDefault();
  if (e.code === 'KeyC') toggleWindow('character-window', 'btn-dock-status');
  if (e.code === 'KeyV' || e.code === 'KeyI') toggleWindow('inventory-window', 'btn-dock-inv');
  if (e.code === 'KeyK') toggleWindow('skills-window', 'btn-dock-skills');
  if (e.code === 'KeyQ') toggleWindow('quests-window', 'btn-dock-quests');
  if (e.code === 'KeyH') toggleWindow('help-window');
  if (e.code === 'KeyM') $('minimap').classList.toggle('is-hidden');
  if (e.code === 'Digit1') useQuickPotion('hp');
  if (e.code === 'Digit2') useQuickPotion('mp');
  if (e.code === 'Digit3') castSkill('bash');
  if (e.code === 'Digit4') castSkill('heal');
  if (e.code === 'Digit5') $('slot-5').click();
  if (e.code === 'Space') hit();
  if (e.code === 'Escape') {
    closeAllWindows();
    clickAttackTarget = null;
    $('target-card').classList.add('is-hidden');
  }
});

// Combate e Ataque
function hit() {
  const now = performance.now();
  if (now - lastHit < 400 || !terrainData) return;

  const nearby = nearestLivingEnemy(4.5);
  if (!nearby) return;
  if (nearby !== activeEnemyActor) setActiveEnemy(nearby);

  $('target-card').classList.remove('is-hidden');
  lastHit = now;
  sfx.swing();

  const dmg = damage(state) + Math.floor(Math.random() * 4 - 2);
  activeEnemyActor.hp = Math.max(0, activeEnemyActor.hp - dmg);
  activeEnemyActor.hitUntil = now + 320;
  enemyCurrentHp = activeEnemyActor.hp;
  const actorHpFill = activeEnemyActor.root.userData.labelDiv?.querySelector('.hp-fill');
  if (actorHpFill) actorHpFill.style.width = `${(activeEnemyActor.hp / activeEnemyActor.maxHp) * 100}%`;
  sfx.hit();
  showFloatingText(`-${dmg}`, 'damage');

  enemy.traverse((c) => {
    if (c.isMesh && c.material && c.material.emissive) {
      c.material.emissive.setHex(0x662211);
      setTimeout(() => c.material.emissive.setHex(0), 150);
    }
  });

  checkEnemyStatus();
  updateUI();
}

function checkEnemyStatus() {
  if (enemyCurrentHp <= 0 && activeEnemyActor?.alive) {
    const defeated = activeEnemyActor;
    defeated.alive = false;
    const deathDuration = defeated.controller?.setMotion('death') || 900;
    defeated.dyingUntil = performance.now() + Math.max(700, deathDuration);
    defeated.respawnAt = performance.now() + 8000;
    const prevLvl = state.level;
    reward(state, defeated.id);
    sfx.item();
    showFloatingText('+25 EXP', 'xp');
    showFloatingText('+10 Ouro', 'gold');

    if (state.level > prevLvl) {
      sfx.levelUp();
      showFloatingText(`NÍVEL ${state.level}!`, 'gold');
      log(`Parabéns! Nível ${state.level}! (+5 Pontos de Atributo)`);
    }

    // Drops oficiais de itens do ItemList.bin
    const roll = Math.random();
    let dropItem = null;
    if (roll < 0.05) {
      dropItem = { itemId: 420, count: 1 }; // Pedaço de Lactolerium
    } else if (roll < 0.18) {
      dropItem = { itemId: 3000, count: 1 }; // Poeira de Órion
    } else if (roll < 0.35) {
      // Equipamentos clássicos
      const equipPool = [951, 952, 953, 956, 1110, 1140, 1170, 1710, 501];
      const chosen = equipPool[Math.floor(Math.random() * equipPool.length)];
      dropItem = { itemId: chosen, count: 1, refine: 0 };
    } else if (roll < 0.65) {
      // Poções oficiais
      const potId = Math.random() < 0.5 ? 400 : 403;
      dropItem = { itemId: potId, count: Math.floor(Math.random() * 3) + 1 };
    }

    if (dropItem) {
      const def = ITEM_DEFS[dropItem.itemId];
      if (def) {
        if (state.inventory.length < 20) {
          const existing = state.inventory.find((it) => it.itemId === dropItem.itemId && it.count !== undefined && !dropItem.refine);
          if (existing) {
            existing.count += dropItem.count;
          } else {
            state.inventory.push(dropItem);
          }
          sfx.inventory();
          showFloatingText(`+${def.name}`, 'gold');
          log(`Drop: [${def.name}] obtido!`);
        } else {
          log(`Drop [${def.name}] caiu no chão (Inventário Cheio).`);
        }
      }
    }

    log(`${defeated.name} derrotado · +25 XP · +10 Ouro.`);
    const next = nearestLivingEnemy();
    if (next) setActiveEnemy(next);
    else {
      enemyCurrentHp = 0;
      $('target-card').classList.add('is-hidden');
    }
    save();
  }
}

$('hit').onclick = hit;
$('btn-close-target').onclick = () => {
  clickAttackTarget = null;
  $('target-card').classList.add('is-hidden');
};

// The lobby previews appearances without changing progression or saving a choice.
function setLobbyInert(open) {
  for (const element of $('game').children) {
    if (element.id !== 'lobby') element.inert = open;
  }
}
setLobbyInert(true);
const lobbyCharacters = {
  theodore: ['Boss Baby', 'Terno alinhado e atitude de chefe. Theodore está pronto para conhecer Kersef.'],
  transknight: ['TransKnight', 'A presença clássica de um guerreiro de Armia. Siga sua jornada pelos campos e cidades de Kersef.'],
  foema: ['Foema', 'A magia faz parte da história de Kersef. Explore esse mundo com o visual clássico da Foema.'],
};
let previewCharacter;
try { previewCharacter = createLobbyPreview(); }
catch { $('preview-status').textContent = 'Prévia indisponível. Você ainda pode entrar no mundo.'; }
function chooseLobbyCharacter(kind) {
  if (!lobbyCharacters[kind]) kind = 'theodore';
  document.querySelectorAll('#lobby .char-select-card').forEach(card => {
    const selected = card.dataset.character === kind;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  $('lobby-character-name').textContent = lobbyCharacters[kind][0];
  $('lobby-character-description').textContent = lobbyCharacters[kind][1];
  $('lobby-level').textContent = `Nível ${state.level}`;
  previewCharacter?.(kind);
}
document.querySelectorAll('#lobby .char-select-card').forEach(card => {
  card.onclick = () => { chooseLobbyCharacter(card.dataset.character); sfx.click(); };
});
chooseLobbyCharacter(localStorage.getItem(characterKey) || 'theodore');
$('enter-world').onclick = async () => {
  const button = $('enter-world');
  button.disabled = true;
  document.querySelectorAll('#lobby .char-select-card').forEach(card => card.disabled = true);
  $('lobby-entry-status').textContent = 'Preparando sua entrada…';
  preloadSounds(); sfx.click();
  const kind = document.querySelector('#lobby .char-select-card.selected').dataset.character;
  try {
    if (!worldReady) throw new Error('O mapa ainda não está pronto. Aguarde e tente novamente.');
    await selectCharacter(kind);
    $('lobby').style.display = 'none';
    setLobbyInert(false);
    renderer.domElement.focus();
    $('lobby-entry-status').textContent = 'Explore, enfrente monstros e evolua.';
  } catch (error) {
    $('lobby-entry-status').textContent = worldReady ? 'Não foi possível carregar o personagem. Tente novamente.' : error.message;
  } finally {
    button.disabled = false;
    document.querySelectorAll('#lobby .char-select-card').forEach(card => card.disabled = false);
  }
};

// Carregamento de Terrenos do WYD
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

const uvPatterns = [
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[1, 0], [0, 0], [1, 1], [0, 1]],
  [[1, 1], [1, 0], [0, 1], [0, 0]],
  [[0, 1], [1, 1], [0, 0], [1, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 1], [0, 0], [1, 1], [1, 0]],
  [[1, 1], [0, 1], [1, 0], [0, 0]],
  [[1, 0], [1, 1], [0, 0], [0, 1]],
];
const backUv = (index) => {
  const q = index % 4;
  const x = q === 1 || q === 2 ? 0.5 : 0;
  const y = q >= 2 ? 0.5 : 0;
  return [[x, y], [x, y + 0.5], [x + 0.5, y], [x + 0.5, y + 0.5]];
};

try {
  const manifest = await getJSON('/assets/manifest.json');
  const mapNames = {
    Field1616: 'Armia (Cidade)',
    Field1313: 'Azran (Cidade)',
    Field1413: 'Erion (Cidade)',
    Field1612: 'Nippleheim',
    Field1615: 'Campos de Armia',
    Field1314: 'Arredores de Azran',
    Field1513: 'Campos de Erion',
  };

  for (const name of manifest.maps) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = mapNames[name] || name.replace('Field', 'Setor ');
    $('map').append(o);
  }

  const textureCache = new Map();
  const dds = new DDSLoader();

  async function material(index, overlay = false) {
    const k = `${index}:${overlay}`;
    if (!textureCache.has(k)) {
      textureCache.set(
        k,
        (async () => {
          let map = null;
          if (manifest.textures[index]) {
            map = await dds.loadAsync('/assets/' + manifest.textures[index]);
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          }
          return new THREE.MeshStandardMaterial({
            map,
            color: map ? 0xffffff : 0x48583a,
            roughness: 1,
            side: THREE.DoubleSide,
            transparent: overlay,
            alphaTest: overlay ? 0.08 : 0,
            depthWrite: !overlay,
          });
        })()
      );
    }
    return textureCache.get(k);
  }

  async function loadMap(id) {
    activeMapId = id;
    const version = ++loadVersion;
    $('loading').classList.toggle('loading-compact', Boolean(terrain));
    $('loading').style.display = 'flex';
    $('loading').textContent = 'Carregando terreno de Kersef…';

    try {
      const data = await getJSON(`/assets/${id}.json`);
      const groups = new Map();
      const backgrounds = new Map();

      const add = (collection, index, x, z, uv, yOffset = 0) => {
        if (!collection.has(index)) collection.set(index, { p: [], uv: [] });
        const g = collection.get(index);
        const corners = [[x, z], [x, z + 1], [x + 1, z], [x + 1, z + 1]];
        for (const k of [0, 1, 2, 2, 1, 3]) {
          const [cx, cz] = corners[k];
          g.p.push(cx, data.tiles[cz * 64 + cx][0] * 0.1 + yOffset, cz);
          g.uv.push(...uv[k]);
        }
      };

      for (let z = 0; z < 63; z++) {
        for (let x = 0; x < 63; x++) {
          const tile = data.tiles[z * 64 + x];
          const index = tile[1] + 10;
          const back = tile[3] + 256;
          add(backgrounds, back, x, z, backUv(tile[4]), -0.015);
          if (manifest.textures[index]) add(groups, index, x, z, uvPatterns[tile[2] % 8]);
        }
      }

      const create = async (index, g, overlay) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, await material(index, overlay));
      };

      const meshes = await Promise.all(
        [...backgrounds]
          .map(([i, g]) => create(i, g, false))
          .concat([...groups].map(([i, g]) => create(i, g, true)))
      );

      if (version !== loadVersion) {
        meshes.forEach((m) => m.geometry.dispose());
        return;
      }

      if (terrain) {
        scene.remove(terrain);
        terrain.traverse((o) => o.geometry?.dispose());
      }
      if (world) scene.remove(world);
      world = null;

      terrain = new THREE.Group();
      terrain.add(...meshes);
      scene.add(terrain);
      terrainData = data;
      rebuildMinimap();

      $('loading').textContent = 'Posicionando objetos do mundo…';
      try {
        const loaded = await loadWydWorld(`/assets/world/${id}.json`, renderer);
        if (version === loadVersion) {
          world = loaded.group;
          worldColliders = loaded.colliders;
          scene.add(world);
        }
      } catch {
        worldColliders = [];
      }

      const verifiedSpawns = {
        Field1616: new THREE.Vector3(26.5, 0, 23),
        Field1314: new THREE.Vector3(25, 0, 45),
      };
      const requestedSpawn = verifiedSpawns[id] || new THREE.Vector3(32, 0, 32);
      const spawn = verifiedSpawns[id] && !isBlocked(requestedSpawn, 1.2)
        ? openPositionNear(requestedSpawn)
        : safestMapSpawn(requestedSpawn);
      hero.position.copy(spawn);
      $('loading').textContent = 'Acordando criaturas da região…';
      await populateEnemies(id, spawn, version);
      ensureRegionalQuest(id);
      ring.position.set(spawn.x, spawn.y + 0.04, spawn.z);
      centerCamera();

      $('current-zone-name').textContent = mapNames[id] || id.replace('Field', 'Setor ');
      $('loading').style.display = 'none';
      $('loading').classList.remove('loading-compact');
      log(`${mapNames[id] || id} carregado.`);
    } catch (e) {
      if (version === loadVersion) {
        $('loading').classList.remove('loading-compact');
        $('loading').textContent = 'Erro ao carregar mapa.';
      }
      console.error(e);
    }
  }

  const initialMap = manifest.maps.includes('Field1616') ? 'Field1616' : manifest.maps[0];
  $('map').value = initialMap;
  $('map').onchange = (e) => loadMap(e.target.value);
  await loadMap(initialMap);

  const initialHero = localStorage.getItem(characterKey) || 'theodore';
  try {
    await selectCharacter(initialHero);
  } catch {
    await selectCharacter('theodore');
  }
  worldReady = true;
} catch (e) {
  $('loading').textContent = 'Erro ao inicializar assets. Execute npm run import.';
  console.error(e);
}

// Loop Principal de Animação
updateUI();
loadOfficialItems().then(updateUI).catch((error) => console.warn('Itens oficiais indisponíveis:', error));
let previous = 0;
let elapsed = 0;
let lastCoords = '';
let lastMinimapDraw = 0;
const keyboard = new THREE.Vector3();
const nextPosition = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - previous) / 1000, 0.1);
  previous = time;
  elapsed += dt;
  if (time - lastMinimapDraw > 180) {
    drawMinimap();
    lastMinimapDraw = time;
  }

  // Auto hunt loop
  if (auto && elapsed >= 1.0) {
    if (!activeEnemyActor?.alive) {
      const next = nearestLivingEnemy();
      if (next) setActiveEnemy(next);
    }
    const dist = hero && enemy ? hero.position.distanceTo(enemy.position) : Infinity;
    if (dist > 4.0) {
      if (enemy) moveTarget = enemy.position.clone();
      elapsed = 0.5; // check more frequently when running to target
    } else if (enemy) {
      hit();
      elapsed = 0;
    }
    // Auto potion quando HP < 40%
    if (currentHp < maxHp(state) * 0.4) {
      useQuickPotion('hp');
    }
  }

  // Teclado
  keyboard.set(
    (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0),
    0,
    (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
  );

  let moving = false;
  if (keyboard.lengthSq()) {
    clickAttackTarget = null;
    moveTarget = null;
    destinationRing.visible = false;
    keyboard.normalize();
    const angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const x = keyboard.x * Math.cos(angle) + keyboard.z * Math.sin(angle);
    const z = -keyboard.x * Math.sin(angle) + keyboard.z * Math.cos(angle);
    keyboard.set(x, 0, z);
    const next = nextPosition.copy(hero.position).addScaledVector(keyboard, dt * 4);
    next.x = THREE.MathUtils.clamp(next.x, 0.5, 62.5);
    next.z = THREE.MathUtils.clamp(next.z, 0.5, 62.5);
    if (canMove(hero.position, next)) {
      hero.position.copy(next);
      moving = true;
    }
    hero.position.y = height(hero.position.x, hero.position.z);
    hero.rotation.y = Math.atan2(keyboard.x, keyboard.z);
  } else if (moveTarget) {
    const direction = moveDirection.copy(moveTarget).sub(hero.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance < 0.15) {
      moveTarget = null;
      destinationRing.visible = false;
    } else {
      direction.normalize();
      const next = nextPosition.copy(hero.position).addScaledVector(direction, Math.min(distance, dt * 3.5));
      if (canMove(hero.position, next)) {
        hero.position.copy(next);
        moving = true;
      } else {
        moveTarget = null;
        destinationRing.visible = false;
      }
      hero.position.y = height(hero.position.x, hero.position.z);
      hero.rotation.y = Math.atan2(direction.x, direction.z);
    }
  }

  if (clickAttackTarget?.alive && hero.position.distanceTo(clickAttackTarget.root.position) <= 4.2) hit();

  // Atualizar coordenadas na barra superior
  const coordX = Math.round(2100 + hero.position.x);
  const coordY = Math.round(2090 + hero.position.z);
  const coords = `${coordX}, ${coordY}`;
  if (coords !== lastCoords) {
    $('player-coords').textContent = coords;
    lastCoords = coords;
  }

  cameraTarget.set(hero.position.x, hero.position.y + 0.7, hero.position.z);
  controls.target.lerp(cameraTarget, Math.min(1, dt * 4));
  const attackPhase = Math.max(0, 1 - (performance.now() - lastHit) / 350);
  const inCombat = performance.now() - lastHit < 3500 || auto;

  // Atualização com contexto para Boss Baby (gaze, tracking, física) e WYD models
  originalHero?.setMotion(attackPhase > 0 ? 'attack' : moving ? 'run' : inCombat ? 'idle' : 'idle');
  originalHero?.update(time, {
    moving,
    attackPhase,
    inCombat,
    heroPos: hero.position,
    heroRotY: hero.rotation.y,
    targetPos: enemy?.position,
  });

  for (const actor of enemyActors) {
    if (!actor.alive) {
      if (time < actor.dyingUntil) {
        actor.controller?.update(time);
        continue;
      }
      actor.root.visible = false;
      if (time >= actor.respawnAt) {
        actor.alive = true;
        actor.hp = actor.maxHp;
        actor.root.position.copy(actor.home);
        actor.root.rotation.z = 0;
        actor.root.visible = true;
        actor.hitUntil = 0;
        actor.attackUntil = 0;
        actor.nextAttackAt = time + 1000;
        actor.controller?.setMotion('idle');
        const hpFill = actor.root.userData.labelDiv?.querySelector('.hp-fill');
        if (hpFill) hpFill.style.width = '100%';
        if (!activeEnemyActor?.alive) setActiveEnemy(actor);
      }
      continue;
    }
    const isBeingHit = time < actor.hitUntil;
    const distanceToHero = actor.root.position.distanceTo(hero.position);
    const canFight = $('lobby').style.display === 'none';
    if (canFight && !isBeingHit && distanceToHero <= 2.1 && time >= actor.nextAttackAt) {
      actor.attackUntil = time + 650;
      actor.nextAttackAt = time + 1700 + Math.random() * 450;
      const incoming = Math.max(2, Math.round(2 + actor.level * 0.8 - defense(state) * 0.08));
      currentHp = Math.max(1, currentHp - incoming);
      showFloatingText(`-${incoming} HP`, 'damage');
      sfx.hit();
      updateUI();
    }
    const isAttacking = time < actor.attackUntil;
    actor.wanderAngle += dt * (0.18 + actor.level * 0.008);
    actor.wanderTarget.set(
      actor.home.x + Math.cos(actor.wanderAngle) * 1.4,
      0,
      actor.home.z + Math.sin(actor.wanderAngle) * 1.4
    );
    const dx = actor.wanderTarget.x - actor.root.position.x;
    const dz = actor.wanderTarget.z - actor.root.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const chasing = canFight && !isBeingHit && !isAttacking && distanceToHero > 2.0 && distanceToHero < 5.5;
    const roaming = !isBeingHit && !isAttacking && !chasing && length > 0.05;
    if (chasing || roaming) {
      const target = chasing ? hero.position : actor.wanderTarget;
      const moveX = target.x - actor.root.position.x;
      const moveZ = target.z - actor.root.position.z;
      const moveLength = Math.hypot(moveX, moveZ) || 1;
      actor.wanderStep.copy(actor.root.position);
      const speed = chasing ? 1.25 : 0.42;
      actor.wanderStep.x += (moveX / moveLength) * dt * speed;
      actor.wanderStep.z += (moveZ / moveLength) * dt * speed;
      if (canMove(actor.root.position, actor.wanderStep)) {
        actor.root.position.copy(actor.wanderStep);
        actor.root.position.y = height(actor.root.position.x, actor.root.position.z);
      } else {
        actor.wanderAngle += Math.PI * 0.65;
      }
      actor.root.rotation.y = Math.atan2(moveX, moveZ);
    }
    actor.controller?.setMotion(isBeingHit ? 'strike' : isAttacking ? 'attack' : chasing ? 'run' : roaming ? 'walk' : 'idle');
    actor.controller?.update(time);
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
