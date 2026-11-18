import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newGame,validateSave,maxHP,maxMP} from '../core.js';
import {originalRules} from '../original-rules.js';
import {originalState,canFly,advanceJourney,journeyEncounter,encounterLoot,battleRewards,equipment,equipItem,equipmentStats,fieldPools} from '../journey.js';
import {battlePosition} from '../presentation.js';
const {steps}=JSON.parse(await readFile(new URL('../assets/original-story.json',import.meta.url)));
test('Flight unlocks after the original ancient temple lesson and sword gift, including existing saves',()=>{
 const s=originalState(newGame());s.journey.index=7;s.journey.flying=true;
 assert.equal(canFly(s),false);assert.equal(validateSave(s).journey.flying,false);
 advanceJourney(s,steps);assert.equal(canFly(s),true);assert.ok(s.journey.owned.includes('polu'));
 assert.equal(canFly(validateSave(s)),true);
});
test('Geng Jing trial has original lieutenants first and Geng Jing alone second; scripted bosses keep all original guards',()=>{
 const s=originalState(newGame()),q=steps[26];
 assert.deepEqual(q.battleTeams,[40,39]);assert.deepEqual(q.battleParty,['lan']);
 assert.deepEqual(journeyEncounter(q,s,q.enemy,0).enemies.map(e=>e.name),['张副将','李副将']);
 assert.deepEqual(journeyEncounter(q,s,q.enemy,1).enemies.map(e=>[e.name,e.sprite]),[['耿京','gengjing']]);
 for(const step of steps.filter(x=>x.kind==='battle'))for(let wave=0;wave<step.battleTeams.length;wave++)
  assert.deepEqual(journeyEncounter(step,s,step.enemy,wave).enemies.map(e=>e.originalId),originalRules.teams[step.battleTeams[wave]].monsters);
 for(const index of [24,56,62])assert.equal(steps[index].kind,'talk');
 assert.deepEqual(journeyEncounter(steps[43],s).enemies.map(e=>e.sprite),['yuelinda','yuelei']);
});
test('Original equipment drops use the paired rate array rather than mistaking percentages for equipment IDs',()=>{
 const s=originalState(newGame()),q=steps[32],fight=journeyEncounter(q,s);
 const guaranteed=encounterLoot(fight,()=>.999);
 assert.ok(guaranteed.some(x=>x.id==='arm-23'),'weapon-store guard guarantees original 天舞华凌');
 const trial=journeyEncounter(steps[26],s);
 assert.deepEqual(encounterLoot(trial,()=>.99),[]);
 assert.deepEqual(encounterLoot(trial,()=>0).map(x=>x.id),['arm-29','arm-37']);
 const first=battleRewards(s,fight,()=>.999);assert.ok(first.every(x=>x.fresh));
 const second=battleRewards(s,fight,()=>.999);assert.ok(second.every(x=>!x.fresh));
 assert.equal(new Set(s.journey.owned).size,s.journey.owned.length);
});
test('Story relics are shown as actual owned items and companion weapons equip only their original owner',()=>{
 const s=originalState(newGame());s.level=60;s.journey.actorLevels={fei:60,lan:60};s.journey.index=27;advanceJourney(s,steps);
 assert.ok(s.journey.owned.includes('arm-65'));assert.equal(s.journey.companionEquipment.fei.weapon,'arm-65');
 assert.equal(equipment['arm-65'].name,'逐浪');assert.equal(equipItem(s,'arm-65','hero'),false);
 assert.ok(equipmentStats(s,'fei').attack>0);assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))),s);
 s.journey.index=34;advanceJourney(s,steps);assert.ok(s.journey.owned.includes('arm-75'));
 assert.ok(maxHP(s)>1400);assert.ok(maxMP(s)>420);
 const bad=structuredClone(s);bad.journey.companionEquipment.fei.weapon='arm-64';assert.equal(validateSave(bad),null);
});
test('Shared equipment can move between eligible party members, but cannot be duplicated or worn by the wrong sex',()=>{
 const s=originalState(newGame());s.level=60;s.journey.actorLevels={fei:60,lan:60};s.journey.owned.push('arm-37','arm-50');s.journey.members=['fei','lan'];
 assert.equal(equipItem(s,'arm-37','hero'),false);
 assert.equal(equipItem(s,'arm-37','fei'),true);assert.equal(equipItem(s,'arm-37','lan'),true);
 assert.equal(s.journey.companionEquipment.fei.armor,undefined);assert.equal(s.journey.companionEquipment.lan.armor,'arm-37');
 assert.equal(equipItem(s,'arm-50','hero'),true);assert.equal(equipItem(s,'arm-50','lan'),true);
 assert.equal(s.journey.equipped.ring,undefined);assert.equal(s.journey.companionEquipment.lan.ring,'arm-50');
 assert.ok(validateSave(s));
});
test('One through five enemy positions remain distinct on the left and compact allies stay on the right',()=>{
 for(let count=1;count<=5;count++){
  const positions=Array.from({length:count},(_,i)=>battlePosition('enemy',i,count));
  assert.equal(new Set(positions.map(p=>p.x+':'+p.y)).size,count);
  assert.ok(positions.every(p=>p.x<45&&p.y>35&&p.y<90));
 }
 for(let count=1;count<=3;count++)for(let i=0;i<count;i++)assert.ok(battlePosition('ally',i,count).x>65);
});
test('Field storms and unlocked equipment chests match original map records, including revisiting the later military camp',()=>{
 const s=originalState(newGame());
 assert.deepEqual(fieldPools(4,'s18').normal,[14,15,16]);
 assert.deepEqual(fieldPools(19,'s9').rare,[57]);
 assert.deepEqual(fieldPools(19,'ss20').normal,[31,32,33]);
 assert.deepEqual(fieldPools(20,'ss21').normal,[32,33,34,0]);
 assert.equal(fieldPools(12,'s12').normal.length,0);
 for(let i=0;i<10;i++)assert.ok([14,15,16].includes(journeyEncounter({title:'旋风',map:4,scene:'s18'},s,'soldiers').teamId));
 assert.equal(journeyEncounter({title:'异色旋风',map:19,scene:'s9'},s,'golden').teamId,57);
 assert.ok(fieldPools(5,'s19').chests.some(c=>c.arm===23&&!c.locked));
});
