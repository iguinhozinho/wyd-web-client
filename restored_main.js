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
import { ITEM_DEFS } from './items.js';
import { sfx, preloadSounds } from './sound.js';
import { loadWydCharacter } from './wyd-character.js';
import { loadTheodoreCharacter } from './fbx-character.js';
import { loadWydWorld } from './wyd-world.js';
import './style.css';
import './lobby.css';

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
let worldColliders = [];
let loadVersion = 0;
let moveTarget = null;

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
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Sincronização direta
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      log('Armazenamento local indisponível.');
    }
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

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
let renderer, labelRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  $('loading').textContent = 'WebGL indisponível neste navegador.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
let enemy = pawn(0xa76543, 'Javali Selvagem', true);
let originalHero = null;
let characterRoot = null;
let enemyController = null;
const characterCache = new Map();

// Carregar modelo 3D do Javali
loadWydCharacter('/assets/monster/mo01-boar.json', renderer)
  .then((ctrl) => {
    enemyController = ctrl;
    ctrl.group.scale.setScalar(1.0);
    ctrl.group.rotation.x = -Math.PI / 2;
    const label = enemy.children.find((c) => c instanceof CSS2DObject);
    while (enemy.children.length > 0) enemy.remove(enemy.children[0]);
    if (label) enemy.add(label);
    enemy.add(ctrl.group);
    log('Javali 3D original carregado.');
  })
  .catch((e) => console.warn('Javali placeholder mantido:', e));

async function selectCharacter(kind) {
  const charDisplayName =
    kind === 'theodore' ? 'Boss Baby' : kind === 'foema' ? 'Foema' : 'TransKnight';

  if (!characterCache.has(kind)) {
    log(`Carregando ${charDisplayName}…`);
    if (kind === 'theodore') {
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

function centerCamera() {
  const { x, y, z } = hero.position;
  controls.target.set(x, y + 0.7, z);
  camera.position.set(x + 8, y + 11, z + 10);
  controls.update();
  sfx.click();
}
$('btn-center').onclick = centerCamera;

// Movimentação por teclado
const held = new Set();
addEventListener('keydown', (event) => {
  if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(event.code)) {
    held.add(event.code);
    event.preventDefault();
  }
});
addEventListener('keyup', (event) => held.delete(event.code));

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
  const hit = raycaster.intersectObject(terrain, true)[0];
  if (hit) {
    moveTarget = hit.point.clone();
    moveTarget.y = height(moveTarget.x, moveTarget.z);
    destinationRing.position.set(moveTarget.x, moveTarget.y + 0.05, moveTarget.z);
    destinationRing.visible = true;
  }
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
  if (def.atk) statsHtml += `<span>Ataque: +${def.atk + (item.refine || 0) * 4}</span>`;
  if (def.def) statsHtml += `<span>Defesa: +${def.def + (item.refine || 0) * 3}</span>`;
  if (def.hp) statsHtml += `<span>HP Máx: +${def.hp}</span>`;
  if (def.mp) statsHtml += `<span>MP Máx: +${def.mp}</span>`;
  if (def.value) statsHtml += `<span>Cura: +${def.value}</span>`;
  if (def.reqLevel) statsHtml += `<span>Nível Necessário: ${def.reqLevel}</span>`;
  statsHtml += `<span>Preço: ${def.price}g</span>`;

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
        slot.innerHTML = `<i class="item-icon" style="background-position: ${-def.iconX * 35}px ${-def.iconY * 35}px;"></i>`;
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
        slotEl.innerHTML = `<i class="item-icon" style="background-position: ${-def.iconX * 35}px ${-def.iconY * 35}px;"></i>`;
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
  const idx = state.inventory.findIndex((it) => it.itemId === (type === 'hp' ? 'hp_potion' : 'mp_potion'));
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
    enemyCurrentHp = Math.max(0, enemyCurrentHp - dmg);
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
  const hpPotItem = state.inventory.find((it) => it.itemId === 'hp_potion');
  const mpPotItem = state.inventory.find((it) => it.itemId === 'mp_potion');
  $('slot-hp-count').textContent = hpPotItem ? hpPotItem.count : 0;
  $('slot-mp-count').textContent = mpPotItem ? mpPotItem.count : 0;

  // Janela de Quests
  if (state.quest) {
    $('quest-title').textContent = state.quest.title;
    $('quest-desc').textContent = state.quest.desc;
    const qPct = Math.min(100, (state.quest.progress / state.quest.target) * 100);
    $('quest-progress-bar').style.width = `${qPct}%`;
    $('quest-progress-text').textContent = `${state.quest.progress} / ${state.quest.target} Javalis`;
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
$('btn-dock-auto').onclick = () => $('slot-5').click();

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
  $('btn-dock-auto').classList.toggle('active', auto);
  $('target-card').classList.remove('is-hidden');
  sfx.click();
  log(auto ? 'Caça automática ATIVADA.' : 'Caça automática PAUSADA.');
};
$('slot-6').onclick = () => {
  centerCamera();
  log('Retornando ao centro de Armia.');
};

document.querySelectorAll('.btn-use-skill').forEach((btn) => {
  btn.onclick = () => castSkill(btn.dataset.skill);
});

// Teclas de Atalho Globais
addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') toggleWindow('character-window', 'btn-dock-status');
  if (e.code === 'KeyV' || e.code === 'KeyI') toggleWindow('inventory-window', 'btn-dock-inv');
  if (e.code === 'KeyK') toggleWindow('skills-window', 'btn-dock-skills');
  if (e.code === 'KeyQ') toggleWindow('quests-window', 'btn-dock-quests');
  if (e.code === 'KeyA') $('slot-5').click();
  if (e.code === 'Digit1') useQuickPotion('hp');
  if (e.code === 'Digit2') useQuickPotion('mp');
  if (e.code === 'Digit3') castSkill('bash');
  if (e.code === 'Digit4') castSkill('heal');
  if (e.code === 'Digit5') $('slot-5').click();
  if (e.code === 'Digit6') centerCamera();
  if (e.code === 'Space') hit();
  if (e.code === 'Escape') closeAllWindows();
});

// Combate e Ataque
function hit() {
  const now = performance.now();
  if (now - lastHit < 400 || !terrainData) return;
  $('target-card').classList.remove('is-hidden');
  lastHit = now;
  sfx.swing();

  const dmg = damage(state) + Math.floor(Math.random() * 4 - 2);
  enemyCurrentHp = Math.max(0, enemyCurrentHp - dmg);
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
  if (enemyCurrentHp <= 0) {
    const prevLvl = state.level;
    reward(state);
    sfx.item();
    showFloatingText('+25 EXP', 'xp');
    showFloatingText('+10 Ouro', 'gold');

    if (state.level > prevLvl) {
      sfx.levelUp();
      showFloatingText(`NÍVEL ${state.level}!`, 'gold');
      log(`Parabéns! Nível ${state.level}! (+5 Pontos de Atributo)`);
    }

    enemyCurrentHp = enemyMaxHp;
    log('Javali derrotado · +25 XP · +10 Ouro.');
    save();
  }
}

$('hit').onclick = hit;
$('btn-close-target').onclick = () => $('target-card').classList.add('is-hidden');

// Lobby Selection
document.querySelectorAll('#lobby .char-select-card').forEach((card) => {
  card.onclick = () => {
    document.querySelectorAll('#lobby .char-select-card').forEach((c) => {
      c.classList.remove('selected');
      const pill = c.querySelector('.card-status-pill');
      if (pill) pill.textContent = 'DISPONÍVEL';
    });
    card.classList.add('selected');
    const pill = card.querySelector('.card-status-pill');
    if (pill) pill.textContent = 'SELECIONADO';
    sfx.click();
  };
});

$('enter-world').onclick = async () => {
  preloadSounds();
  sfx.click();
  const selectedCard = document.querySelector('#lobby .char-select-card.selected');
  const chosenCharacter = selectedCard ? selectedCard.dataset.character : 'theodore';
  $('lobby').style.display = 'none';
  await selectCharacter(chosenCharacter);
  renderer?.domElement.focus();
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
    const version = ++loadVersion;
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
      if (world) {
        scene.remove(world);
        world.traverse((o) => {
          o.geometry?.dispose();
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => m?.dispose());
        });
        world = null;
      }

      terrain = new THREE.Group();
      terrain.add(...meshes);
      scene.add(terrain);
      terrainData = data;

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

      const spawn = id === 'Field1616' ? new THREE.Vector3(26.5, 0, 23) : new THREE.Vector3(32, 0, 32);
      spawn.y = height(spawn.x, spawn.z);
      hero.position.copy(spawn);
      enemy.position.set(spawn.x + 2, height(spawn.x + 2, spawn.z), spawn.z);
      ring.position.set(spawn.x, spawn.y + 0.04, spawn.z);
      centerCamera();

      $('current-zone-name').textContent = mapNames[id] || id.replace('Field', 'Setor ');
      $('loading').style.display = 'none';
      log(`${mapNames[id] || id} carregado.`);
    } catch (e) {
      if (version === loadVersion) $('loading').textContent = 'Erro ao carregar mapa.';
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
} catch (e) {
  $('loading').textContent = 'Erro ao inicializar assets. Execute npm run import.';
  console.error(e);
}

// Loop Principal de Animação
updateUI();
let previous = 0;
let elapsed = 0;

renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - previous) / 1000, 0.1);
  previous = time;
  elapsed += dt;

  // Auto hunt loop
  if (auto && elapsed >= 1.0) {
    hit();
    elapsed = 0;
    // Auto potion quando HP < 40%
    if (currentHp < maxHp(state) * 0.4) {
      useQuickPotion('hp');
    }
  }

  // Teclado
  const keyboard = new THREE.Vector3(
    (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0),
    0,
    (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
  );

  let moving = false;
  if (keyboard.lengthSq()) {
    moveTarget = null;
    destinationRing.visible = false;
    keyboard.normalize();
    const angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const x = keyboard.x * Math.cos(angle) + keyboard.z * Math.sin(angle);
    const z = -keyboard.x * Math.sin(angle) + keyboard.z * Math.cos(angle);
    keyboard.set(x, 0, z);
    const next = hero.position.clone().addScaledVector(keyboard, dt * 4);
    next.x = THREE.MathUtils.clamp(next.x, 0.5, 62.5);
    next.z = THREE.MathUtils.clamp(next.z, 0.5, 62.5);
    if (canMove(hero.position, next)) {
      hero.position.copy(next);
      moving = true;
    }
    hero.position.y = height(hero.position.x, hero.position.z);
    hero.rotation.y = Math.atan2(keyboard.x, keyboard.z);
  } else if (moveTarget) {
    const direction = moveTarget.clone().sub(hero.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance < 0.15) {
      moveTarget = null;
      destinationRing.visible = false;
    } else {
      direction.normalize();
      const next = hero.position.clone().addScaledVector(direction, Math.min(distance, dt * 3.5));
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

  // Atualizar coordenadas na barra superior
  const coordX = Math.round(2100 + hero.position.x);
  const coordY = Math.round(2090 + hero.position.z);
  $('player-coords').textContent = `${coordX}, ${coordY}`;

  controls.target.lerp(new THREE.Vector3(hero.position.x, hero.position.y + 0.7, hero.position.z), Math.min(1, dt * 4));
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

  enemyController?.setMotion(attackPhase > 0 ? 'idle' : 'idle');
  enemyController?.update(time);

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
