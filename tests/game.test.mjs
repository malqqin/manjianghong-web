import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { component, nearestTile, findPath, walkable, newGame, validateSave, createBattle, battleTurn, maxHP, maxMP } from '../core.js';
import { entities, places } from '../world.js';
const maps = JSON.parse(await readFile(new URL('../assets/maps.json', import.meta.url)));

test('Every story actor and exit can be reached through original walkable tiles', () => {
  for (const id of Object.keys(places).map(Number)) {
    const map = maps[id], connected = component(map), spawn = nearestTile(connected, ...places[id].spawn);
    assert.ok(connected.length > 100, `map ${id} has enough ground`);
    for (const entity of entities.filter(e => e.map === id)) {
      const end = nearestTile(connected, entity.x, entity.y), route = findPath(map, spawn, end);
      assert.ok(route.length || spawn.x === end.x && spawn.y === end.y, entity.id);
      let previous = spawn;
      for (const tile of route) {
        assert.ok(walkable(map, tile.x, tile.y));
        assert.equal(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y), 1);
        previous = tile;
      }
    }
  }
});
test('Guard reduces heavy damage and skill interrupts only the selected enemy', () => {
  const state = { ...newGame(), party: false };
  const battle = createBattle('patrol', state); battle.round = 3;
  const guarded = battleTurn(battle, 'guard');
  assert.equal(battle.hp, 120, 'input battle stays unchanged');
  assert.ok(guarded.events.filter(e => e.target === 'hero').reduce((n, e) => n + (e.amount || 0), 0) < 15);
  assert.ok(guarded.focus);
  const interrupted = battleTurn(battle, 'skill', 0);
  assert.ok(interrupted.events.some(e => e.type === 'break' && e.target === 0));
  assert.ok(interrupted.events.some(e => e.target === 'hero' && e.text.includes('持刀游骑')));
});
test('A resource-aware strategy can complete all three encounters without optional loot', () => {
  const state = { ...newGame(), party: true }; let totalTurns = 0;
  for (const id of ['patrol', 'cave', 'boss']) {
    let battle = createBattle(id, state);
    for (let turn = 0; turn < 35 && !battle.outcome; turn++) {
      const target = battle.enemies.find(e => e.hp > 0);
      const action = battle.hp < 48 && battle.potions ? 'potion' : battle.round % 3 === 0 ? 'guard' : battle.mp >= 8 ? 'skill' : 'attack';
      battle = battleTurn(battle, action, target.id); totalTurns++;
    }
    assert.equal(battle.outcome, 'victory', `${id} is completable`);
    state.level++; state.hp = maxHP(state); state.mp = maxMP(state); state.potions = battle.potions;
  }
  assert.ok(totalTurns > 6 && totalTurns < 35);
});
test('Save validation rejects corrupt inputs and round-trips journey flags and choices', () => {
  const state = newGame(); state.stage = 7; state.flags = { rescued: true, intel: true }; state.ending = 'wander'; state.journal.push('江湖有归途。');
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(state))), state);
  assert.equal(validateSave({ ...state, map: 999 }), null);
  assert.equal(validateSave({ ...state, hp: 'wrong' }), null);
  assert.equal(validateSave({ ...state, tile: null }), null);
  assert.equal(validateSave({ ...state, flags: [] }), null);
});
test('Losing a fight returns a defeat outcome without corrupting the exploration save', () => {
  const state = { ...newGame(), hp: 1, mp: 0, potions: 0, party: false };
  const original = structuredClone(state);
  const lost = battleTurn(createBattle('boss', state), 'attack');
  assert.equal(lost.outcome, 'defeat');
  assert.equal(lost.hp, 0);
  assert.deepEqual(state, original);
  const invalid = battleTurn(createBattle('boss', state), 'potion');
  assert.ok(invalid.error);
  assert.equal(invalid.round, 1);
});
