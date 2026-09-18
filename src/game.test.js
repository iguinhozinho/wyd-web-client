import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, reward, upgrade, restore, damage, defense, allocateStat, claimQuest } from './game.js';
import { calculateEquipmentBonuses } from './items.js';

test('quatro abates sobem nível e preservam ouro', () => {
  const s = fresh();
  for (let i = 0; i < 4; i++) reward(s);
  assert.equal(s.level, 2);
  assert.equal(s.xp, 0);
  assert.equal(s.gold, 40);
  assert.equal(s.kills, 4);
  assert.equal(s.statPoints, 5);
});

test('melhoria exige ouro e desconta custo uma vez', () => {
  const s = fresh();
  assert.equal(upgrade(s), false);
  s.gold = 30;
  assert.equal(upgrade(s), true);
  assert.equal(s.gold, 0);
  assert.equal(damage(s), 17);
  assert.equal(upgrade(s), false);
});

test('distribuição de pontos de atributo aumenta dano e consome pontos', () => {
  const s = fresh();
  s.statPoints = 5;
  assert.equal(allocateStat(s, 'str'), true);
  assert.equal(s.str, 16);
  assert.equal(s.statPoints, 4);
  assert.equal(damage(s), 14); // 12 base + 2 de str bonus
});

test('equipamentos aumentam dano e defesa', () => {
  const s = fresh();
  s.equipment.weapon = { itemId: 'axe_battle', refine: 0 };
  s.equipment.shield = { itemId: 'shield_kite', refine: 0 };
  const bonuses = calculateEquipmentBonuses(s.equipment);
  assert.equal(bonuses.atk, 28);
  assert.equal(bonuses.def, 16);
  assert.equal(damage(s), 12 + 28);
  assert.equal(defense(s), 8 + 16);
});

test('conclusão de quest concede ouro e experiência', () => {
  const s = fresh();
  assert.equal(claimQuest(s), false);
  s.quest.progress = 10;
  assert.equal(claimQuest(s), true);
  assert.equal(s.quest.claimed, true);
  assert.equal(s.gold, 100);
  assert.equal(s.level, 2); // 250 XP sobe para lvl 2 (100 gasto, 150/200 restante)
  assert.equal(s.xp, 150);
});

test('missão avança somente com a criatura correta', () => {
  const s = fresh();
  reward(s, 'wf01');
  assert.equal(s.quest.progress, 0);
  reward(s, 'bo01');
  assert.equal(s.quest.progress, 1);
});

test('save inválido não quebra inicialização; save válido restaura', () => {
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...fresh(), gold: -1 })]) {
    assert.deepEqual(restore(raw), fresh());
  }
  const s = reward(fresh());
  assert.deepEqual(restore(JSON.stringify(s)), s);
});

test('Boss Baby preserva progresso e equipamentos ao reabrir o save', () => {
  const state = fresh();
  for (let i = 0; i < 5; i++) reward(state);
  state.hero = 'Boss Baby';
  allocateStat(state, 'str');
  assert.deepEqual(restore(JSON.stringify(state)), state);
});
