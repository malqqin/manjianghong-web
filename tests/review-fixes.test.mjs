import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { newGame, createBattle, battleTurn, encounters, validateSave } from '../core.js';
import { originalState, originalEncounter } from '../journey.js';
import { battleSequence } from '../presentation.js';
import { encounterAvailable, ENCOUNTER_RESPAWN_MS } from '../exploration.js';
import { viewportZoom, cameraPosition } from '../locomotion.js';

function partyBattle(){
  const state=originalState(newGame());state.level=60;state.journey.members=['fei','lan'];state.journey.actorLevels={fei:60,lan:60};
  state.journey.items={0:2,8:2,10:2};
  encounters['review-native']=originalEncounter(1,{title:'规则回归',map:0},state);
  const b=createBattle('review-native',state);
  b.hp=Math.floor(b.maxHP/2);b.mp=b.maxMP;
  for(const a of b.companions){a.hp=Math.floor(a.maxHP/2);a.mp=a.maxMP;}
  return b;
}
function enemySkill(index,callback){
  const before=Math.random;Math.random=()=>0;
  try{
    const b=partyBattle();b.enemies=b.enemies.slice(0,1);b.enemies[0].skills=[index];b.enemies[0].skillRates=[100];
    b.enemies[0].hp=Math.floor(b.enemies[0].maxHP/2);b.spent=['fei','lan'];
    callback(b,battleTurn(b,'guard'));
  }finally{Math.random=before;}
}

test('Enemy multi-target spells produce one cast with real damage to the original number of targets',()=>{
  enemySkill(67,(before,after)=>{
    const hits=after.events.filter(e=>e.source===0&&e.type==='damage');
    assert.equal(hits.length,2);assert.ok(hits.every(e=>e.amount>0&&e.skill.sourceIndex===67));
    const plans=battleSequence(after.events,'guard').filter(p=>p.source===0);
    assert.equal(plans.length,1);assert.equal(plans[0].cast,true);assert.equal(plans[0].pose,'skill');assert.ok(plans[0].windup>=500);
    assert.ok(after.hp<before.hp);assert.ok(after.companions[0].hp<before.companions[0].hp);
  });
});
test('Enemy status spells include the abnormal state in the actual hit snapshot',()=>{
  enemySkill(64,(_,after)=>{
    const hit=after.events.find(e=>e.source===0&&e.type==='damage');
    assert.equal(hit.state.statuses.burn,5);assert.ok(after.statuses.burn>0);
  });
});
test('Enemy skills restore their caster HP as well as damaging the selected ally',()=>{
  enemySkill(24,(before,after)=>{
    const healing=after.events.find(e=>e.source===0&&e.type==='heal'&&e.target===0);
    assert.equal(healing.amount,Math.trunc(before.enemies[0].maxHP*.2));assert.equal(healing.casterEffect,true);
    assert.ok(after.enemies[0].hp>before.enemies[0].hp);assert.ok(after.events.some(e=>e.source===0&&e.type==='damage'));
  });
});
test('Normal medicine spends the acting character, preventing another skill until the next turn',()=>{
  let b=partyBattle();b=battleTurn(b,'item',0,'8','hero','hero');
  assert.equal(b.itemCounts[8],1);assert.ok(b.spent.includes('hero'));assert.equal(b.activeActor,'fei');
  const rejected=battleTurn(b,'skill',0,'rainbow','hero');assert.match(rejected.error,/已行动/);assert.equal(rejected.mp,b.mp);
});
test('Special medicine preserves the same selected actor and allows their next skill',()=>{
  let b=partyBattle();b.activeActor='fei';b=battleTurn(b,'item',0,'0','fei','fei');
  assert.equal(b.itemCounts[0],1);assert.equal(b.activeActor,'fei');assert.equal(b.round,1);assert.deepEqual(b.spent,[]);
  const next=battleTurn(b,'skill',0,'chase','fei');assert.equal(next.error,undefined);assert.ok(next.spent.includes('fei'));
});

test('Temporary armor weakening expires for native and legacy battles',()=>{
  for(const native of [true,false]){
    const b=partyBattle();b.native=native;b.spent=['fei','lan'];
    b.enemies=b.enemies.slice(0,1);Object.assign(b.enemies[0],{skills:[],pierced:1,reductionChange:-50,reductionTurns:1});
    const next=battleTurn(b,'guard');
    assert.equal(next.enemies[0].pierced,0);assert.equal(next.enemies[0].reductionTurns,0);assert.equal(next.enemies[0].reductionChange,0);
  }
});
test('Tornado cooldown depends on map time, including a valid zero timestamp, and persists across saves',()=>{
  const e={id:'wind',respawn:true},cleared={wind:0};
  assert.equal(ENCOUNTER_RESPAWN_MS,16000);assert.equal(encounterAvailable(e,cleared),false);
  assert.equal(encounterAvailable(e,cleared,15999),false);assert.equal(encounterAvailable(e,cleared,16000),true);
  assert.equal(encounterAvailable({...e,respawn:false},cleared,999999),false);
  const s=originalState(newGame());Object.assign(s.journey,{fieldClock:7500,clearedEncounters:cleared});
  const saved=validateSave(JSON.parse(JSON.stringify(s)));assert.equal(saved.journey.fieldClock,7500);assert.deepEqual(saved.journey.clearedEncounters,cleared);
  s.journey.fieldClock=NaN;assert.equal(validateSave(s),null);
});
test('Published resources exist and the story exposes page advancement without a skip control',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/native-skip|dialogue-skip|略过|掠过|fullscreen-toggle/);assert.match(html,/id="dialogue-next"/);
  const files=JSON.parse(await readFile(new URL('../precache.json',import.meta.url)));
  for(const file of files.filter(f=>f!=='./'))assert.ok((await stat(new URL('../'+file,import.meta.url))).isFile(),file);
});
test('Desktop keeps its original map scale while mobile viewports still fill every map',async()=>{
  const maps=JSON.parse(await readFile(new URL('../assets/maps.json',import.meta.url)));
  for(const map of maps){
   const width=map.width*16,height=map.height*16;
   for(const [w,h]of [[1122,704],[1282,1244]])assert.equal(viewportZoom(w,h,width,height),3,'desktop map '+map.id);
   for(const [w,h]of [[390,844],[360,640],[844,390],[1024,768],[768,1024]]){
    const zoom=viewportZoom(w,h,width,height,true),view={w,h,zoom};
    assert.ok(width*zoom>=w-.001&&height*zoom>=h-.001,'map '+map.id);
    for(const player of [{x:0,y:0},{x:width/2,y:height/2},{x:width,y:height}]){
      const camera=cameraPosition(player,map,view);
      assert.ok(camera.x>=-.001&&camera.y>=-.001);assert.ok(camera.x+w/zoom<=width+.001&&camera.y+h/zoom<=height+.001);
    }
   }
  }
});
