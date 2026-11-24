import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newGame,createBattle,battleTurn,encounters,maxHP,validateSave}from'../core.js';
import {originalState,equipItem,originalEncounter,clampPartyVitals}from'../journey.js';
import {originalAttack,chooseMonsterSkill,originalBattleOutcome}from'../combat-rules.js';
import {originalRules}from'../original-rules.js';
import {characterRules}from'../character-rules.js';
import {learnedSkills}from'../skills.js';
import {actorLevel,characterStats,learnManual,gainExperience}from'../progression.js';
import {addItem,applyItem}from'../items.js';
import {equipmentCount,equipmentAvailable,addEquipment,removeEquipment}from'../inventory.js';
import {scenePortals,routeExit,evaluateCondition,sceneEncounters,encounterAvailable}from'../exploration.js';
import {scenePrograms,executeNative,storyStage,sceneActorLayout,mainCheckpoint,nativeContactRects}from'../native-events.js';
import {touchingEncounter}from'../encounters.js';
import {advanceFieldActor}from'../field-motion.js';
import {compileGroup,programInstructions}from'../story-presentation.js';
const native=JSON.parse(await readFile(new URL('../assets/native-story.json',import.meta.url))),story=JSON.parse(await readFile(new URL('../assets/original-story.json',import.meta.url)));
test('Original initial levels, actual attributes and gradual skill learning survive saves',()=>{
 const s=originalState(newGame());assert.equal(actorLevel(s,'fei'),5);assert.equal(actorLevel(s,'lan'),10);
 const stats=characterStats(s);assert.deepEqual([stats.attackMin,stats.attackMax,stats.maxHP,stats.maxMP,stats.defense],[15,28,220,66,20]);
 assert.equal(s.coins,200);assert.deepEqual(s.journey.items,{0:10,10:10});assert.equal(s.journey.equipped.weapon,null);
 assert.deepEqual(learnedSkills(s).map(k=>k.id),['rainbow']);assert.deepEqual(learnedSkills(s,'fei').map(k=>k.id),['chase','moon']);
 s.level=5;assert.deepEqual(learnedSkills(s).map(k=>k.id),['rainbow','wildfire']);s.level=7;assert.ok(learnedSkills(s).some(k=>k.id==='surge'));
 s.level=11;assert.ok(learnedSkills(s).some(k=>k.passive));assert.equal(maxHP(s),462);assert.ok(validateSave(s));
});
test('Manuals require the correct actor, original level and preceding rank; consume only on success',()=>{
 const s=originalState(newGame());addItem(s,18);assert.equal(learnManual(s,'hero',18).ok,false);assert.equal(s.journey.items[18],1);
 s.level=11;assert.equal(learnManual(s,'fei',18).ok,false);assert.equal(learnManual(s,'hero',18).ok,true);assert.equal(s.journey.items[18],0);assert.equal(learnedSkills(s)[0].rank,2);
 s.level=40;addItem(s,20);assert.equal(learnManual(s,'hero',20).ok,false);assert.equal(s.journey.items[20],1);
});
test('Experience uses original per-level table and announces learned moves, without leveling an absent actor',()=>{
 const s=originalState(newGame());s.level=4;s.journey.members=['fei'];const result=gainExperience(s,characterRules.experience[4]+1);
 assert.equal(s.level,5);assert.ok(result.learned.some(k=>k.index===4));assert.equal(actorLevel(s,'fei'),5);assert.equal(actorLevel(s,'lan'),10);
});
test('Unlearned commands are rejected by battle logic; special medicines preserve the acting turn',()=>{
 const s=originalState(newGame());addItem(s,1);const b=createBattle('patrol',s);
 assert.match(battleTurn(b,'skill',0,'wildfire').error,/尚未习得/);
 const after=battleTurn(b,'item',0,'1','hero','hero');assert.equal(after.round,1);assert.equal(after.activeActor,'hero');assert.equal(after.itemCounts[1],0);assert.deepEqual(after.spent,[]);
 const target={hp:20,maxHP:200,mp:0,maxMP:100,statuses:{burn:2}};applyItem(target,1);assert.equal(target.mp,100);assert.equal(target.hp,20);assert.equal(target.statuses.burn,2,'清平丸 restores MP rather than cleansing');
});
test('Original equipment level restrictions apply independently to each actor',()=>{
 const s=originalState(newGame());s.journey.owned.push('arm-65');assert.equal(equipItem(s,'arm-65','fei'),false);
 s.journey.actorLevels.fei=60;assert.equal(equipItem(s,'arm-65','fei'),true);assert.equal(equipItem(s,'arm-65','hero'),false);
});
test('Several exits retain their original destinations and distinct coordinates, with conditions',()=>{
 const graph=Object.fromEntries(Object.keys(native.scenes).map(k=>[k,scenePortals(native,k)])),exits=graph.s19;
 assert.deepEqual(exits.map(e=>e.toScene),['s18','s20']);assert.notEqual(exits[0].x,exits[1].x);
 assert.equal(routeExit(graph,'s19','ss0').toScene,'s20');assert.equal(graph.s1[0].to,1);
 assert.ok(evaluateCondition(graph.s1[0].condition,{0:3},{2:0}));
 for(const list of Object.values(graph))for(const e of list)assert.ok(native.scenes[e.toScene]);
});
test('Original tornado positions and team pools are preserved, with original respawn delay',()=>{
 const list=Object.keys(native.scenes).flatMap(key=>sceneEncounters(native,key));assert.ok(list.length>20);
 for(const e of list){const actor=native.scenes[e.scene].actors[Number(e.id.split('-').at(-1))];assert.deepEqual(e.teams,actor.extra.slice(1));assert.equal(e.x*16+8,actor.x);assert.equal(e.y*16+8,actor.y);}
 const e=list.find(e=>e.respawn);assert.ok(e);assert.equal(encounterAvailable(e,{[e.id]:1000},16999),false);assert.equal(encounterAvailable(e,{[e.id]:1000},17000),true);
 assert.equal(encounterAvailable({...e,respawn:false},{[e.id]:1000},999999),false);
});

test('An original NPC experience award can target one companion without awarding the hero',()=>{
 const s=originalState(newGame()),amount=characterRules.experience[5]+1;gainExperience(s,amount,['fei']);
 assert.equal(s.level,1);assert.equal(s.xp,0);assert.equal(actorLevel(s,'fei'),6);assert.equal(actorLevel(s,'lan'),10);
});

test('Repeated equipment rewards retain quantities, while shops cannot sell a worn copy',()=>{
 const s=originalState(newGame());addEquipment(s,'arm-34',2);assert.equal(equipmentCount(s,'arm-34'),2);
 assert.ok(equipItem(s,'arm-34'));assert.equal(equipmentAvailable(s,'arm-34'),1);assert.ok(removeEquipment(s,'arm-34'));assert.equal(equipmentCount(s,'arm-34'),1);assert.equal(removeEquipment(s,'arm-34'),false);
 assert.ok(validateSave(s));
});

test('Older journey saves keep their chapter and inventory when medicine rules migrate once',()=>{
 const s=originalState(newGame());s.journey.index=18;s.journey.rulesVersion=undefined;s.potions=3;s.journey.antidotes=2;delete s.journey.items;delete s.journey.actorLevels;
 const migrated=validateSave(s);assert.equal(migrated.journey.index,18);assert.equal(migrated.journey.items[8],3);assert.equal(migrated.journey.items[3],2);assert.equal(migrated.potions,0);
 assert.deepEqual(validateSave(migrated).journey.items,migrated.journey.items);
});

test('All-party medicine, special status remedies and escape use actual item flags',()=>{
 const s=originalState(newGame());s.journey.members=['fei','lan'];s.hp=10;s.journey.partyVitals={fei:{hp:10,mp:0},lan:{hp:10,mp:0}};addItem(s,73);addItem(s,6);
 let b=createBattle('patrol',s);b=battleTurn(b,'item',0,'73','hero','hero');assert.equal(b.hp,b.maxHP);assert.ok(b.companions.every(a=>a.hp===a.maxHP));assert.equal(b.activeActor,'hero');
 b=battleTurn(b,'item',0,'6','hero','hero');assert.equal(b.outcome,'escaped');assert.equal(b.itemCounts[6],0);
 const actor={hp:10,mp:0,maxHP:220,maxMP:66,statuses:{freeze:1,burn:1,confuse:0}};assert.equal(applyItem(actor,3).free,true);assert.equal(actor.statuses.burn,0);assert.equal(applyItem(actor,4).free,true);assert.equal(actor.statuses.freeze,0);
});

test('Real original side dialogue and reward scripts use persistent original variables',async()=>{
 const variables={0:17,25:0},calls=[],program=scenePrograms(native,'s12',41,variables,story.steps).find(p=>p.index===34);
 assert.ok(program);await executeNative(program.items,{variables,handlers:{dialogue:async n=>calls.push(['talk',n]),grant:async(...a)=>calls.push(['grant',...a])}});
 assert.ok(calls.some(c=>c[0]==='grant'&&c[1]===1&&c[2]===70));assert.equal(variables[25],1);
 assert.ok(!scenePrograms(native,'s12',41,variables,story.steps).some(p=>p.index===34));
 assert.equal(storyStage(native,story.steps,17),13);
});

test('Original entry scripts hide completed quest actors and retain explicit actor overrides',()=>{
 const before=sceneActorLayout(native,'s19',{0:25,3:5}),after=sceneActorLayout(native,'s19',{0:25,3:6});
 assert.ok(before[39].flags&4);assert.equal(after[39].flags&4,0);
 const overridden=sceneActorLayout(native,'s19',{0:25,3:6},{39:{flags:12,x:100}});assert.equal(overridden[39].x,100);assert.ok(overridden[39].flags&4);
});

test('Main cutscenes obey original stage18 and49 rather than playing in the early interrogation',()=>{
 assert.equal(story.steps[11].superseded,true);assert.deepEqual(story.steps[11].lines,[]);
 assert.ok(story.steps[23].afterLines.some(l=>l.source?.scene==='s6'&&l.source.group===1));
 assert.ok(story.steps[61].afterLines.some(l=>l.source?.scene==='s6'&&l.source.group===2));
 const events=compileGroup(native,'s17',2);assert.ok(events.some(e=>e.kind==='dialogue'));assert.equal(events.at(-1).kind,'tail');
});

test('A nested native transition stops the enclosing program before later rewards',async()=>{
 const calls=[];
 // A real branch from the original Geng Jing event, followed by a sentinel reward.
 const program=programInstructions(native.scenes.s17.programs[0].code).filter(i=>i.action===4).at(-1);
 await executeNative([program,{action:36,args:[0,1,0,0,0,1]}],{variables:{6:1},handlers:{travel:async()=>calls.push('travel'),grant:async()=>calls.push('reward')}});
 assert.deepEqual(calls,['travel']);
});
test('Every reconstructed frame fits inside its own cell, including complete Geng Jing axe',async()=>{
 const metadata=JSON.parse(await readFile(new URL('../assets/native-combat.json',import.meta.url))),battle=JSON.parse(await readFile(new URL('../assets/battle.json',import.meta.url)));
 for(const [name,m]of Object.entries(metadata.sprites)){const sheet=battle[name];if(!sheet?.cellWidth)continue;
  for(const frame of m.frames)for(const [part,flags,dx,dy]of frame){const [, ,w,h]=m.parts[part],x=sheet.originX+dx-(flags&1?w:0),y=sheet.originY+dy-(flags&2?h:0);assert.ok(x>=0&&y>=0&&x+w<=sheet.cellWidth&&y+h<=sheet.cellHeight,name);}
 }
 assert.ok(battle.gengjing.cellWidth>96);
});

test('Original enemies retain fixed level, HP, experience and silver regardless of player level',()=>{
 const low=originalState(newGame()),high=originalState(newGame());high.level=60;
 const a=originalEncounter(39,{title:'耿京',map:25},low),b=originalEncounter(39,{title:'耿京',map:25},high);
 assert.deepEqual(a,b);assert.equal(a.enemies[0].hp,15000);assert.equal(a.enemies[0].originalStats.level,30);assert.equal(a.xp,8000);assert.equal(a.reward,800);
 assert.equal(originalBattleOutcome({battleTeams:[36]}),'defeat');assert.equal(originalBattleOutcome({battleTeams:[42]}),'defeat');assert.equal(originalBattleOutcome({battleTeams:[39]}),'victory');
});

test('Native damage follows Java integer packets, including bonus damage on status skills',t=>{
 t.mock.method(Math,'random',()=>.5);
 const s=originalState(newGame()),encounter=originalEncounter(1,{title:'封山',map:0},s),id='native-test';encounters[id]=encounter;
 try{
  const b=createBattle(id,s),source={stats:b.stats,maxHP:b.maxHP},target=b.enemies[0];
  assert.equal(originalAttack(source,target).amount,15);
  assert.equal(originalAttack(source,target,{skill:b.learnedSkills.hero[0]}).amount,38);
  s.level=5;s.journey.members=['fei'];const durable=createBattle(id,s);for(const e of durable.enemies)e.hp=e.maxHP=1000;const fire=battleTurn(durable,'skill',0,'wildfire');
  assert.ok(fire.events.some(e=>e.source==='hero'&&e.type==='damage'&&e.amount>0));assert.ok(fire.enemies.some(e=>e.burn>0));
  assert.equal(chooseMonsterSkill({skills:[62,0],skillRates:[30,70]},()=>.2),62);assert.equal(chooseMonsterSkill({skills:[62,0],skillRates:[30,70]},()=>.8),0);
 }finally{delete encounters[id];}
});

test('Removing equipment clamps current HP and MP to the new limits',()=>{
 const s=originalState(newGame());s.level=60;s.journey.members=['fei'];s.journey.actorLevels.fei=60;
 const item=originalRules.arms.find(a=>a.stats[5]>0&&a.properties[8]===2&&a.properties[9]===4);
 assert.ok(item);const id='arm-'+item.index;addEquipment(s,id,2);assert.ok(equipItem(s,id,'hero'));assert.ok(equipItem(s,id,'fei'));
 s.hp=characterStats(s).maxHP;s.journey.partyVitals={fei:{hp:characterStats(s,'fei').maxHP,mp:characterStats(s,'fei').maxMP}};
 delete s.journey.equipped[Object.keys(s.journey.equipped).find(k=>s.journey.equipped[k]===id)];
 delete s.journey.companionEquipment.fei[Object.keys(s.journey.companionEquipment.fei).find(k=>s.journey.companionEquipment.fei[k]===id)];clampPartyVitals(s);
 assert.equal(s.hp,characterStats(s).maxHP);assert.equal(s.journey.partyVitals.fei.hp,characterStats(s,'fei').maxHP);
});

test('Three original camp checkpoints run in order, retain their own battles, and stop on defeat',async()=>{
 const variables={0:52},teams=[],run=async(won=true)=>{
  const checkpoint=mainCheckpoint(63,variables[0]);assert.ok(checkpoint);
  const p=scenePrograms(native,checkpoint.scene,checkpoint.actorIndex,variables,story.steps);assert.equal(p.length,1);
  await executeNative(p[0].items,{variables,handlers:{effect:async()=>{},dialogue:async()=>{},battle:async team=>{teams.push(team);return won;},gameOver:async()=>{}}});
 };
 await run(false);assert.equal(variables[0],52);teams.length=0;
 for(let n=0;n<3;n++)await run();assert.deepEqual(teams,[69,73,49]);assert.equal(variables[0],55);assert.equal(mainCheckpoint(63,55),null);
 const e={id:'checkpoint',contact:true,x:3,y:17,contactRect:{x:-1,y:278,width:368,height:3}};
 assert.equal(touchingEncounter({x:280,y:280},[e]),e);assert.equal(touchingEncounter({x:280,y:240},[e]),null);
});

test('Original field storms patrol, respect collision and chase only in the decoded detection range',()=>{
 const e={x:10,y:10,detectionBounds:[-60,-60,120,120]},player={x:200,y:168},open=()=>true;
 advanceFieldActor(e,player,.08,open,{rng:()=>.2});assert.ok(e.motion.chasing);assert.equal(e.x*16+8,174);
 const still=structuredClone(e);advanceFieldActor(still,player,.08,()=>false);assert.equal(still.x,e.x);assert.equal(still.y,e.y);
 advanceFieldActor(e,player,.08,open,{flying:true});assert.equal(e.motion.chasing,false);
 const patrol={x:10,y:10,detectionBounds:[0,0,0,0]};for(let n=0;n<100;n++)advanceFieldActor(patrol,player,.08,open,{rng:()=>.2});
 assert.ok(Math.abs(patrol.x*16+8-168)<=20);assert.equal(patrol.y,10);
});


test('Invisible NPC trigger selects the original event and second contact rectangle',()=>{
 const actor=native.scenes.s5.actors[17],variables={0:8};
 assert.equal(scenePrograms(native,'s5',17,variables,[],4).length,0);
 assert.ok(scenePrograms(native,'s5',17,variables,[],5).some(p=>p.index===2));
 assert.deepEqual(nativeContactRects(actor,[5]),[{event:5,x:actor.x-41,y:actor.y-21,width:125,height:64}]);
 assert.equal(scenePrograms(native,'s5',17,{0:7},[],5).length,0);
});
