import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { skillSets } from '../skills.js';
import { originalState } from '../journey.js';
import { newGame, createBattle, battleTurn, validateSave } from '../core.js';
const story = JSON.parse(await readFile(new URL('../assets/original-story.json', import.meta.url)));

test('Story text preserves original identities and source references; exploration does not invent merchant battles', () => {
  const sources = new Map(story.scenes.map(s => [s.key, s]));
  for (const step of story.steps) for (const line of [...step.lines, ...(step.afterLines || [])]) {
    assert.ok(sources.get(line.source.scene).strings[line.source.string], step.title);
  }
  assert.ok(story.steps[7].lines.some(l => l.speaker === '青年剑客' && l.who === 'li'));
  assert.ok(story.steps[13].lines.some(l => l.speaker === '少女' && l.who === 'lan'));
  assert.ok(story.steps[61].afterLines.some(l => l.source?.scene==='s6'&&l.source.group === 2 && l.text.includes('芷萱')));
  assert.ok(story.steps[1].afterLines.some(l => l.text.includes('两个箱子')));
  for (const index of [14, 15, 57]) { assert.equal(story.steps[index].kind, 'travel'); assert.equal(story.steps[index].lines.length, 0); }
});

test('Selectable skills use original names and descriptions instead of invented sword abilities', async () => {
  const source = JSON.parse(await readFile(new URL('../assets/skills-source.json', import.meta.url)));
  const text = new Set(source.strings.map(s => s.text));
  for (const skill of Object.values(skillSets).flat()) {
    assert.ok(text.has(skill.name), skill.name);
    assert.ok(text.has(skill.description), skill.description);
  }
});

function fullParty() {
  const state = originalState({ ...newGame(), level: 2, hp: 140, mp: 36 });
  state.journey.members = ['fei', 'lan']; state.party = true;
  const b = createBattle('boss', state);
  b.enemies.forEach(e => { e.hp = e.maxHP = 1000; e.attack = 1; });
  return b;
}
test('Each command belongs only to the chosen actor; uncommanded allies and enemies wait', () => {
  const initial=fullParty();
  const first=battleTurn(initial,'attack',1,'rainbow','lan');
  assert.deepEqual(first.events.map(e=>e.source),['lan']);
  assert.equal(first.events[0].target,1); assert.equal(first.round,1);
  assert.equal(first.activeActor,'hero'); assert.deepEqual(first.spent,['lan']);
  assert.equal(first.companions[0].mp,initial.companions[0].mp);
  assert.ok(battleTurn(first,'attack',0,'rainbow','lan').error,'cannot command the same person twice');
  const second=battleTurn(first,'attack',0,'rainbow','fei');
  assert.deepEqual(second.events.map(e=>e.source),['fei']);
  assert.equal(second.events[0].target,0); assert.equal(second.round,1);
  const third=battleTurn(second,'attack',0,'rainbow','hero');
  assert.deepEqual(third.events.map(e=>e.source),['hero',0,1]);
  assert.equal(third.round,2); assert.deepEqual(third.spent,[]);
  assert.equal(initial.enemies[0].hp,1000,'command resolution does not mutate input');
});

test('Each person pays their own MP and controls enemy statuses and ally healing targets', () => {
  const initial=fullParty();
  const frozen=battleTurn(initial,'skill',1,'moon','fei');
  assert.deepEqual(frozen.events.map(e=>e.source),['fei','fei']);
  assert.equal(frozen.mp,initial.mp); assert.equal(frozen.companions[0].mp,initial.companions[0].mp-30);
  assert.ok(frozen.enemies.every(e=>e.freeze===1));
  const second=battleTurn(frozen,'guard',0,'rainbow','hero');
  const third=battleTurn(second,'guard',0,'rainbow','lan');
  assert.equal(third.hp,initial.hp); assert.ok(!third.events.some(e=>typeof e.source==='number' && e.type==='damage'));
  const hurt=fullParty();hurt.hp=40;hurt.companions[0].hp=20;
  const heal=battleTurn(hurt,'skill',0,'spring','lan','fei');
  const recovered=Math.round(hurt.companions[0].maxHP*.3);
  assert.equal(heal.hp,40); assert.equal(heal.companions[0].hp,20+recovered);
  assert.equal(heal.events[0].target,'fei'); assert.equal(heal.events[0].amount,recovered);
});

test('A fallen hero does not end the party fight; revival targets a fallen party member', () => {
  const initial=fullParty();initial.hp=0;initial.companions[1].mp=initial.companions[1].maxMP=60;
  const revived=battleTurn(initial,'skill',0,'revive','lan','hero');
  assert.equal(revived.hp,Math.round(initial.maxHP*.3)); assert.equal(revived.events[0].target,'hero'); assert.equal(revived.outcome,null);
  const skip=fullParty();skip.companions[0].hp=0;skip.hp=0;
  const last=battleTurn(skip,'guard',0,'rainbow','lan');
  assert.equal(last.round,2,'dead party members do not block the enemy phase');
  assert.ok(last.events.filter(e=>typeof e.source==='number' && e.type==='damage').every(e=>e.target==='lan'));
  const dead=fullParty();dead.hp=dead.companions[0].hp=0;dead.companions[1].hp=1;
  dead.enemies.forEach(e=>e.attack=100);
  assert.equal(battleTurn(dead,'attack',0,'rainbow','lan').outcome,'defeat');
});

test('Party vitals and post-battle checkpoints survive reload; old auto tactics are no longer executed', () => {
  const state=originalState(newGame());state.journey.members=['fei','lan'];
  state.journey.tactics={fei:'moon',lan:'spring'};state.journey.afterBattle=0;
  state.journey.partyVitals={fei:{hp:41,mp:9},lan:{hp:0,mp:0}};
  const restored=validateSave(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.journey.partyVitals,state.journey.partyVitals);
  assert.equal(restored.journey.afterBattle,0);
  const b=createBattle('patrol',restored);
  assert.equal(b.companions[0].hp,41);assert.equal(b.companions[0].mp,9);
  assert.equal(b.companions[1].hp,0);
  assert.deepEqual(battleTurn(b,'attack').events.map(e=>e.source),['hero']);
  state.journey.partyVitals={fei:{hp:-1,mp:4}};assert.equal(validateSave(state),null);
  delete state.journey.partyVitals;state.journey.afterBattle=1;assert.equal(validateSave(state),null);
});
