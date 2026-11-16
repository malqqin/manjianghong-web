import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFieldEncounters, touchingEncounter } from '../encounters.js';
import { component, nearestTile, findPath, newGame, createBattle, battleTurn } from '../core.js';
import { battlePosition, battleFacingScale, battleSequence } from '../presentation.js';

test('Enemy and ally formations face inward despite different native sprite directions', () => {
  const allies = [0, 1].map(i => battlePosition('ally', i));
  const enemies = [0, 1].map(i => battlePosition('enemy', i));
  assert.ok(Math.min(...allies.map(p => p.x)) > Math.max(...enemies.map(p => p.x)));
  assert.equal(battleFacingScale('linfy', 'ally'), 1);
  assert.equal(battleFacingScale('gengml', 'ally'), 1);
  assert.equal(battleFacingScale('nalan_da', 'ally'), 1);
  assert.equal(battleFacingScale('mon2', 'enemy'), -1, 'left-facing polearm soldier needs its own reflection');
  assert.equal(battleFacingScale('mon4', 'enemy'), 1, 'right-facing spear soldier must retain the original frame');
});

test('Area attacks have one complete native cast and enemy actions retain a readable windup', () => {
  const initial = createBattle('boss', { ...newGame(), level: 2, party: true, hp: 140 });
  const result = battleTurn(initial, 'sweep');
  const plans = battleSequence(result.events, 'sweep');
  assert.deepEqual(plans.map(p => p.source), ['hero', 'lan', 0, 1]);
  assert.equal(plans[0].events.length, 2);
  assert.equal(plans[0].charge, 0, 'the low-HP pose must not be used as an invented charge');
  assert.ok(plans[0].impact > plans[0].duration / 2);
  assert.ok(plans.every(p => p.recovery >= 240), 'each animation has a separate recovery interval');
  assert.ok(plans.filter(p => typeof p.source === 'number').every(p => p.windup >= 500));
  const confused = battleSequence([{ source: 'hero', target: 'hero', type: 'damage', text: '混乱' }], 'skill');
  assert.equal(confused[0].cast, false, 'blocked actions must not display a successful spell');
});

test('Field storms stay reachable, separate from spawn and interactions, and leave cities safe', async () => {
  const maps = JSON.parse(await readFile(new URL('../assets/maps.json', import.meta.url)));
  const story = JSON.parse(await readFile(new URL('../assets/original-story.json', import.meta.url)));
  const playable = new Set(story.steps.map(s => s.map));
  let total = 0;
  for (const map of maps.filter(m => playable.has(m.id))) {
    const ground = component(map), spawn = nearestTile(ground, Math.floor(map.width / 2), map.height - 5);
    const occupied = [nearestTile(ground, spawn.x + 6, spawn.y - 1)];
    const storms = createFieldEncounters(map.id, ground, spawn, occupied);
    if ([0, 2, 4, 19, 20, 21, 26].includes(map.id)) assert.ok(storms.length > 0, `field enemies available on map ${map.id}`);
    assert.deepEqual(storms, createFieldEncounters(map.id, ground, spawn, occupied), 'reloads retain storm identities and positions');
    for (const storm of storms) {
      total++;
      assert.ok(Math.hypot(storm.x - spawn.x, storm.y - spawn.y) >= 4);
      assert.ok(Math.hypot(storm.x - occupied[0].x, storm.y - occupied[0].y) >= 3);
      assert.ok(findPath(map, spawn, storm).length > 0);
    }
    if ([1, 12, 13, 14, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39].includes(map.id)) assert.equal(storms.length, 0);
  }
  assert.ok(total > 0);
});

test('Contact starts a battle without a click; flying, retreat suppression and cleared flags prevent loops', () => {
  const storm = { id: 'wind-0-0', x: 10, y: 10, contact: true };
  const player = { x: 168, y: 168 };
  assert.equal(touchingEncounter(player, [storm]), storm);
  assert.equal(touchingEncounter(player, [storm], { flying: true }), null);
  assert.equal(touchingEncounter(player, [storm], { suppressed: storm.id }), null);
  assert.equal(touchingEncounter({ x: 200, y: 168 }, [storm]), null);
  const side = { [storm.id]: true };
  assert.equal(touchingEncounter(player, [storm].filter(e => !side[e.id])), null);
});
