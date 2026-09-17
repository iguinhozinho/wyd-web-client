import { getInitialInventory, getInitialEquipment, calculateEquipmentBonuses } from './items.js';

export const fresh = () => ({
  level: 1,
  xp: 0,
  gold: 0,
  kills: 0,
  weapon: 0,
  hero: 'TransKnight',
  str: 15,
  int: 10,
  dex: 12,
  con: 14,
  statPoints: 0,
  inventory: getInitialInventory(),
  equipment: getInitialEquipment(),
  quest: {
    title: 'Caçada em Armia',
    desc: 'Elimine 10 Javalis selvagens nos arredores de Armia.',
    progress: 0,
    target: 10,
    claimed: false,
    rewardXp: 250,
    rewardGold: 100,
  },
});

export const maxHp = (s) => (s.con || 14) * 15 + s.level * 25 + calculateEquipmentBonuses(s.equipment || {}).hp;
export const maxMp = (s) => (s.int || 10) * 15 + s.level * 15 + calculateEquipmentBonuses(s.equipment || {}).mp;

export const damage = (s) => {
  const equipBonuses = calculateEquipmentBonuses(s.equipment || {});
  const base = 12 + (s.weapon || 0) * 5 + (s.level - 1) * 2;
  const strBonus = (s.str || 15) > 15 ? ((s.str - 15) * 2) : 0;
  return base + strBonus + equipBonuses.atk;
};

export const defense = (s) => {
  const equipBonuses = calculateEquipmentBonuses(s.equipment || {});
  const statBonus = Math.floor(((s.con || 14) - 14) * 1.5 + ((s.dex || 12) - 12) * 1.0);
  return 8 + statBonus + equipBonuses.def;
};

export const price = (s) => 30 * (s.weapon + 1);

export function reward(s) {
  s.kills++;
  s.gold += 10;
  s.xp += 25;

  if (s.quest && !s.quest.claimed && s.quest.progress < s.quest.target) {
    s.quest.progress++;
  }

  while (s.xp >= s.level * 100) {
    s.xp -= s.level * 100;
    s.level++;
    s.statPoints = (s.statPoints || 0) + 5;
  }
  return s;
}

export function upgrade(s) {
  const cost = price(s);
  if (s.gold < cost) return false;
  s.gold -= cost;
  s.weapon++;
  return true;
}

export function allocateStat(s, stat) {
  if (!s.statPoints || s.statPoints <= 0) return false;
  if (!['str', 'int', 'dex', 'con'].includes(stat)) return false;
  s[stat] = (s[stat] || 10) + 1;
  s.statPoints--;
  return true;
}

export function claimQuest(s) {
  if (!s.quest || s.quest.claimed || s.quest.progress < s.quest.target) return false;
  s.quest.claimed = true;
  s.gold += s.quest.rewardGold;
  s.xp += s.quest.rewardXp;
  while (s.xp >= s.level * 100) {
    s.xp -= s.level * 100;
    s.level++;
    s.statPoints = (s.statPoints || 0) + 5;
  }
  return true;
}

export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (
      !s ||
      !['level', 'xp', 'gold', 'kills', 'weapon'].every(
        (k) => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] <= 1e9
      ) ||
      s.level < 1 ||
      s.xp >= s.level * 100 ||
      !['Boss Baby', 'TransKnight', 'Foema', 'BeastMaster', 'Huntress'].includes(s.hero)
    )
      return fresh();

    if (!s.inventory) s.inventory = getInitialInventory();
    if (!s.equipment) s.equipment = getInitialEquipment();
    if (!s.str) s.str = 15;
    if (!s.int) s.int = 10;
    if (!s.dex) s.dex = 12;
    if (!s.con) s.con = 14;
    if (s.statPoints === undefined) s.statPoints = 0;
    if (!s.quest) s.quest = fresh().quest;

    return s;
  } catch {
    return fresh();
  }
}
