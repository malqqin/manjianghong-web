import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { facingDirection, actorFrame, rasterActorFrame, animationFrame, battleEventState } from '../presentation.js';
import { newGame, createBattle, battleTurn } from '../core.js';
const sprites = JSON.parse(await readFile(new URL('../assets/sprites.json', import.meta.url)));

test('Runtime raster people select back/front/side idle and walking cells independently', () => {
  for (const [row, direction] of ['up','down','left','right'].entries()) {
    assert.equal(rasterActorFrame(direction, false, 100), row * 9);
    for (let i = 0; i < 24; i++) {
      const frame = rasterActorFrame(direction, true, i * 90);
      assert.ok(frame > row * 9 && frame < (row + 1) * 9);
    }
  }
  assert.equal(rasterActorFrame('up', true, 720), rasterActorFrame('up', true, 0));
});

test('Hero and companion show their original back frames when walking or facing north', () => {
  assert.equal(facingDirection(0, -16), 'up');
  assert.equal(facingDirection(0, 16), 'down');
  assert.equal(facingDirection(-16, 0), 'left');
  assert.equal(facingDirection(16, 0), 'right');
  assert.equal(facingDirection(0, 0, 'left'), 'left', 'zero-length path anchors keep the existing facing');
  for (const id of [0, 2]) {
    assert.equal(actorFrame(sprites[id], 'up', false, 0), 0);
    for (const time of [0, 130, 260, 390]) {
      const backFrames = id === 0 ? [0, 2, 3] : [0, 4, 5];
      assert.ok(backFrames.includes(actorFrame(sprites[id], 'up', true, time)));
    }
  }
  assert.equal(actorFrame(sprites[0], 'down', false, 0), 4);
  assert.equal(actorFrame(sprites[2], 'down', false, 0), 1);
});
test('Animation playback honors each original frame duration', () => {
  const steps = [[4, 4], [5, 8]];
  assert.equal(animationFrame(steps, 0), 4);
  assert.equal(animationFrame(steps, 63), 4);
  assert.equal(animationFrame(steps, 64), 5);
  assert.equal(animationFrame(steps, 191), 5);
  assert.equal(animationFrame(steps, 192), 4);
});
test('Hit points and lethal exits advance with each hit instead of jumping at the end of the turn', () => {
  const original = createBattle('patrol', { ...newGame(), party: true });
  original.enemies[0].hp = 50;
  const result = battleTurn(original, 'skill', 0);
  const [heroHit, companionHit] = result.events;
  assert.equal(heroHit.source, 'hero'); assert.equal(companionHit.source, 'lan');
  let view = battleEventState(original, heroHit);
  assert.equal(view.enemies[0].hp, 7, 'enemy survives the first hit');
  assert.equal(heroHit.defeated, false);
  assert.equal(view.hp, original.hp, 'enemy retaliation has not happened yet');
  view = battleEventState(view, companionHit);
  assert.equal(view.enemies[0].hp, 0); assert.equal(companionHit.defeated, true);
  for (const event of result.events.slice(2)) view = battleEventState(view, event);
  assert.equal(view.hp, result.hp); assert.equal(view.mp, result.mp);
  assert.deepEqual(view.enemies.map(e => e.hp), result.enemies.map(e => e.hp));
  assert.equal(original.enemies[0].hp, 50, 'presentation does not change the turn input');
});
test('The last enemy takes its lethal hit before victory and no one attacks a fallen hero', () => {
  const battle = createBattle('patrol', newGame());
  battle.enemies[0].hp = 1; battle.enemies[1].hp = 0;
  const win = battleTurn(battle, 'attack');
  assert.equal(win.outcome, 'victory'); assert.equal(win.events.length, 1);
  assert.equal(win.events[0].defeated, true);
  const loss = battleTurn(createBattle('boss', { ...newGame(), hp: 1, party: false }), 'attack');
  const retaliation = loss.events.filter(e => e.target === 'hero');
  assert.equal(retaliation.length, 1); assert.equal(retaliation[0].defeated, true);
  assert.equal(loss.outcome, 'defeat');
});
