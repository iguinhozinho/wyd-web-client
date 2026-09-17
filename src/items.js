// WYD Web Port — Item Database & Equipment System

export const ITEM_DEFS = {
  hp_potion: {
    id: 'hp_potion',
    name: 'Poção de Vida (P)',
    type: 'consumable',
    effect: 'heal_hp',
    value: 60,
    iconX: 3,
    iconY: 2,
    rarity: 'normal',
    price: 15,
    desc: 'Restaura 60 pontos de Vida instantaneamente.',
  },
  mp_potion: {
    id: 'mp_potion',
    name: 'Poção de Mana (P)',
    type: 'consumable',
    effect: 'heal_mp',
    value: 60,
    iconX: 4,
    iconY: 2,
    rarity: 'normal',
    price: 15,
    desc: 'Restaura 60 pontos de Mana instantaneamente.',
  },
  sword_starter: {
    id: 'sword_starter',
    name: 'Espada Curta',
    type: 'weapon',
    slot: 'weapon',
    atk: 14,
    reqLevel: 1,
    iconX: 1,
    iconY: 0,
    rarity: 'normal',
    price: 50,
    desc: 'Uma espada leve forjada para novos guerreiros de Armia.',
  },
  axe_battle: {
    id: 'axe_battle',
    name: 'Machado de Batalha',
    type: 'weapon',
    slot: 'weapon',
    atk: 28,
    reqLevel: 3,
    iconX: 2,
    iconY: 0,
    rarity: 'magic',
    price: 220,
    desc: 'Machado pesado de gume duplo. Causa alto impacto.',
  },
  staff_arcane: {
    id: 'staff_arcane',
    name: 'Cajado Sagrado',
    type: 'weapon',
    slot: 'weapon',
    atk: 22,
    mp: 40,
    reqLevel: 2,
    iconX: 3,
    iconY: 0,
    rarity: 'magic',
    price: 180,
    desc: 'Canaliza a energia mística para amplificar poderes arcanos.',
  },
  sword_vorpal: {
    id: 'sword_vorpal',
    name: 'Espada de Mithril',
    type: 'weapon',
    slot: 'weapon',
    atk: 48,
    reqLevel: 8,
    iconX: 5,
    iconY: 0,
    rarity: 'rare',
    price: 850,
    desc: 'Lâmina nobre temperada em chamas ancestrais.',
  },
  helm_iron: {
    id: 'helm_iron',
    name: 'Elmo de Aço',
    type: 'armor',
    slot: 'helmet',
    def: 8,
    reqLevel: 1,
    iconX: 0,
    iconY: 1,
    rarity: 'normal',
    price: 80,
    desc: 'Proteção básica de aço para a cabeça.',
  },
  chest_plate: {
    id: 'chest_plate',
    name: 'Armadura Peitoral',
    type: 'armor',
    slot: 'armor',
    def: 22,
    reqLevel: 2,
    iconX: 1,
    iconY: 1,
    rarity: 'magic',
    price: 250,
    desc: 'Peitoral de placas reforçadas para combate.',
  },
  legs_plate: {
    id: 'legs_plate',
    name: 'Calça de Malha',
    type: 'armor',
    slot: 'pants',
    def: 14,
    reqLevel: 1,
    iconX: 2,
    iconY: 1,
    rarity: 'normal',
    price: 140,
    desc: 'Cota de malha flexível que resguarda as pernas.',
  },
  boots_leather: {
    id: 'boots_leather',
    name: 'Botas de Ferro',
    type: 'armor',
    slot: 'boots',
    def: 6,
    reqLevel: 1,
    iconX: 3,
    iconY: 1,
    rarity: 'normal',
    price: 60,
    desc: 'Botas reforçadas para longas jornadas em Kersef.',
  },
  shield_kite: {
    id: 'shield_kite',
    name: 'Escudo Guardião',
    type: 'armor',
    slot: 'shield',
    def: 16,
    reqLevel: 2,
    iconX: 4,
    iconY: 1,
    rarity: 'magic',
    price: 190,
    desc: 'Escudo de brasão que bloqueia golpes inimigos.',
  },
  ring_ruby: {
    id: 'ring_ruby',
    name: 'Anel da Destruição',
    type: 'accessory',
    slot: 'ring1',
    atk: 8,
    reqLevel: 1,
    iconX: 0,
    iconY: 2,
    rarity: 'magic',
    price: 300,
    desc: 'Um anel adornado com pedra rubi que inflama o ataque.',
  },
  amulet_life: {
    id: 'amulet_life',
    name: 'Amuleto do Destino',
    type: 'accessory',
    slot: 'amulet',
    hp: 50,
    def: 5,
    reqLevel: 1,
    iconX: 1,
    iconY: 2,
    rarity: 'magic',
    price: 350,
    desc: 'Pingente místico que expande a vitalidade máxima.',
  },
  powder_ori: {
    id: 'powder_ori',
    name: 'Poeira de Ori',
    type: 'material',
    iconX: 4,
    iconY: 4,
    rarity: 'rare',
    price: 500,
    desc: 'Pedra ancestral usada na refinação de equipamentos até +6.',
  },
  powder_lac: {
    id: 'powder_lac',
    name: 'Poeira de Lac',
    type: 'material',
    iconX: 5,
    iconY: 4,
    rarity: 'unique',
    price: 2000,
    desc: 'Minério raríssimo sagrado para refinação avançada até +9.',
  },
};

export function getInitialInventory() {
  return [
    { itemId: 'hp_potion', count: 15 },
    { itemId: 'mp_potion', count: 10 },
    { itemId: 'sword_starter', count: 1, refine: 0 },
    { itemId: 'helm_iron', count: 1, refine: 0 },
    { itemId: 'chest_plate', count: 1, refine: 0 },
    { itemId: 'shield_kite', count: 1, refine: 0 },
    { itemId: 'powder_ori', count: 3 },
  ];
}

export function getInitialEquipment() {
  return {
    helmet: null,
    armor: null,
    pants: null,
    gloves: null,
    boots: null,
    weapon: null,
    shield: null,
    ring1: null,
    ring2: null,
    amulet: null,
  };
}

export function calculateEquipmentBonuses(equipment) {
  let atk = 0;
  let def = 0;
  let hp = 0;
  let mp = 0;

  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const defData = ITEM_DEFS[item.itemId];
    if (!defData) continue;
    const refineMult = 1 + (item.refine || 0) * 0.15;
    if (defData.atk) atk += Math.round(defData.atk * refineMult);
    if (defData.def) def += Math.round(defData.def * refineMult);
    if (defData.hp) hp += defData.hp;
    if (defData.mp) mp += defData.mp;
  }

  return { atk, def, hp, mp };
}
