import test from 'node:test';
import { partyActors } from '../tactical.js';
import { nativeSkill } from '../skills.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newGame, validateSave, encounters, createBattle, battleTurn, component, nearestTile, findPath, maxHP, maxMP } from '../core.js';
import { objectives } from '../world.js';
import { STORY_COUNT, originalState, journeyObjective, advanceJourney, equipmentStats, equipItem, purchase, flightPath, journeyEncounter } from '../journey.js';
const data = JSON.parse(await readFile(new URL('../assets/original-story.json', import.meta.url)));
const maps = JSON.parse(await readFile(new URL('../assets/maps.json', import.meta.url)));

test('The old completed save has no NPC guide target, and the original route terminates after all six chapters', () => {
  assert.equal(objectives[7].target, null, 'completed demo must never guide back to Geng');
  const s = originalState(newGame());
  assert.equal(data.steps.length, STORY_COUNT);
  const chapters = new Set();
  for (let i=0; i<STORY_COUNT; i++) {
    assert.equal(journeyObjective(s,data.steps).title,data.steps[i].title);
    assert.equal(journeyObjective(s,data.steps).target,'main-goal');
    chapters.add(journeyObjective(s,data.steps).chapter);
    assert.equal(advanceJourney(s,data.steps),true);
    assert.equal(s.journey.index,i+1);
    assert.equal(s.journey.line,0);
  }
  assert.deepEqual([...chapters],[1,2,3,4,5,6]);
  assert.equal(journeyObjective(s,data.steps).target,null);
  assert.equal(s.journey.completed,true);
  assert.equal(advanceJourney(s,data.steps),false);
  assert.equal(s.journey.index,STORY_COUNT,'repeated continue cannot wrap around');
});
test('Every main objective is reachable on its original scene map', () => {
  for (const step of data.steps) {
    const map = maps[step.map], ground = component(map);
    assert.ok(ground.length>0,step.title);
    const start = ground[0], end = nearestTile(ground,step.x,step.y);
    assert.ok(findPath(map,start,end).length || start.x===end.x && start.y===end.y,step.title);
  }
});
test('Mid-dialogue and completed progress round-trip; malformed quest states are rejected', () => {
  const s=originalState(newGame()); s.journey.index=39;s.journey.line=5;s.level=12;s.map=22;
  s.journey.members=['fei','lan'];s.party=true;s.journey.owned.push('silver');s.journey.equipped.weapon='silver';
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))),s);
  assert.equal(validateSave({...s,journey:{...s.journey,index:STORY_COUNT+1}}),null);
  assert.equal(validateSave({...s,journey:{...s.journey,equipped:{weapon:'liquan'}}}),null);
  assert.equal(validateSave({...s,journey:{...s.journey,members:['boss']}}),null);
  const old=newGame();old.stage=7;assert.deepEqual(validateSave(old),old);
});
test('Equipment changes affect combat, and story weapons are granted at the right scene', () => {
  const s=originalState(newGame());s.coins=300;
  const old=createBattle('patrol',s);
  assert.equal(purchase(s,'iron'),true);assert.equal(s.coins,140);
  assert.equal(purchase(s,'iron'),false);assert.equal(equipItem(s,'iron'),true);
  assert.equal(equipmentStats(s).attack,7);
  const armed=createBattle('patrol',s);
  assert.equal(battleTurn(old,'attack').enemies[0].hp-battleTurn(armed,'attack').enemies[0].hp,7);
  s.journey.index=data.steps.findIndex(x=>x.title==='亮银枪归来');advanceJourney(s,data.steps);
  assert.equal(s.journey.equipped.weapon,'silver');
});
test('Flight crosses blocked tiles while remaining within the map; freeze, burn and cleanse affect turns', () => {
  const map={width:3,height:1,collision:[8,0,8]};
  assert.deepEqual(findPath(map,{x:0,y:0},{x:2,y:0}),[]);
  assert.deepEqual(flightPath(map,{x:0,y:0},{x:7,y:0}),[{x:1,y:0},{x:2,y:0}]);
  const s=originalState(newGame());s.journey.antidotes=2;
  let b=createBattle('patrol',s);b.statuses.freeze=1;
  const frozen=battleTurn(b,'skill');assert.equal(frozen.mp,b.mp);assert.equal(frozen.enemies[0].hp,b.enemies[0].hp);
  b.statuses={freeze:1,burn:3,confuse:2};
  const cleansed=battleTurn(b,'cleanse');assert.deepEqual(cleansed.statuses,{freeze:0,burn:0,confuse:0});assert.equal(cleansed.antidotes,1);
  b.statuses={freeze:0,burn:1,confuse:0};
  assert.ok(battleTurn(b,'guard').events.some(e=>e.source==='burn' && e.amount===12));
});
test('All main story encounters can be won with ordinary supplies and the story equipment', () => {
  const s=originalState(newGame());s.potions=10;
  let fights=0;
  for (const step of data.steps) {
    if (step.kind==='battle') {
      const id='verification';encounters[id]=journeyEncounter(step,s);
      s.hp=maxHP(s);s.mp=maxMP(s);s.journey.antidotes=5;
      let b=createBattle(id,s);
      for(let n=0;n<150 && !b.outcome;n++) {
        const actor=partyActors(b).find(a=>a.id===b.activeActor);
        const status=Object.values(actor.statuses).some(v=>v>0);
        const action=status && b.antidotes?'cleanse':actor.hp<actor.maxHP*.4 && b.potions?'potion':b.round%3===0?'guard':actor.mp>=nativeSkill(actor.id).cost?'skill':'attack';
        b=battleTurn(b,action,b.enemies.find(e=>e.hp>0)?.id);
      }
      assert.equal(b.outcome,'victory',step.title);
      s.xp+=encounters[id].xp;s.level=Math.min(20,1+Math.floor(s.xp/180));fights++;
    }
    advanceJourney(s,data.steps);
  }
  assert.equal(fights,data.steps.filter(step=>step.kind==='battle').length);
  assert.ok(fights>=18);assert.equal(s.journey.completed,true);
});
