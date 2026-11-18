// The original text and cutscene ordering are decoded from the original JAR.
// Movement, quests, combat balance and touch presentation are implemented for the web.
import { originalRules } from './original-rules.js';
import { originalFields } from './original-field.js';
import { characterStats, canEquipOriginal } from './progression.js';
import { addItem } from './items.js';
import { equipmentCount, equippedCount, addEquipment } from './inventory.js';
import { characterRules } from './character-rules.js';
import {monsterStats,originalBattleOutcome} from './combat-rules.js';
export const STORY_COUNT = 67;
export const chapterNames = ['年少轻狂祸乱起', '欢喜冤家两落魄', '情窦初开汴京城', '壮志飞过紫云山', '儿女泪洒衣冠冢', '金戈铁马战襄阳'];
export const equipment = {
  steel: { name: '点钢枪', slot: 'weapon', attack: 0, price: 0, icon: 'wood', description: '凌飞云在凤凰山上使用的长枪。' },
  wood: { name: '软藤枪', slot: 'weapon', attack: 0, price: 0, icon: 'wood', description: '凤凰山逃亡时，沐霏削枝赠予的长枪。' },
  iron: { name: '蘸金枪', slot: 'weapon', attack: 7, price: 160, icon: 'iron', description: '长枪顺手，普攻与枪法伤害增加 7。' },
  silver: { name: '亮银枪', slot: 'weapon', attack: 12, price: 0, icon: 'silver', description: '父亲留下的旧枪。在紫云山失而复得。' },
  liquan: { name: '沥泉神枪', slot: 'weapon', attack: 22, price: 0, icon: 'liquan', description: '衣冠冢中取得的岳将军神枪。' },
  bronze: { name: '青铜戒', slot: 'ring', defense: 2, price: 130, icon: 'bronze', description: '敌人每次攻击伤害降低 2。' },
  linglong: { name: '玲珑环', slot: 'ring', defense: 5, price: 0, icon: 'linglong', description: '金色妖物掉落的首饰。每次受到的伤害降低 5。' },
  plainjade: { name: '青玉佩', slot: 'jade', attack: 3, price: 180, icon: 'plainjade', description: '温润如水，攻击增加 3。' },
  koi: { name: '锦鲤玉佩', slot: 'jade', attack: 5, price: 0, icon: 'koi', description: '凤凰山遗落的成双信物，串起一段未了的往事。' },
  frostjade: { name: '冰心佩', slot: 'jade', defense: 3, price: 0, icon: 'frostjade', description: '金色妖物掉落。每次受到的伤害降低 3。' }
};
// Keep save IDs for existing equipment. New records keep their original ArmData ID.
for (const arm of originalRules.arms) {
  const p=arm.properties, actors=p[3]===0?[['hero','fei','lan'][p[9]]]:p[8]===0?['hero']:p[8]===1?(p[9]===1?['fei']:p[9]===2?['lan']:['fei','lan']):['hero','fei','lan'];
  const actor=actors.length===1?actors[0]:null,health=Math.round(arm.stats[5]/10),mana=Math.round(p[4]/10),attack=Math.round((arm.stats[0]+arm.stats[1])/40),defense=Math.round((arm.stats[2]+arm.stats[3])/40);
  const slot=['weapon','armor','bracer','ring','jade'][p[3]], rare=arm.index>=62&&arm.index<=78;
  equipment['arm-'+arm.index]={name:arm.name,slot,actor,actors,health,mana,originalId:arm.index,rarity:rare?'神兵':'装备',
    attack,defense,price:p[0],
    icon:slot==='weapon'?(p[9]===1?'linglong':'silver'):slot==='ring'?'bronze':'plainjade',
    art:slot==='armor'||slot==='bracer'?'assets/gear-'+slot+'.svg':rare?'assets/native/relic-'+(slot==='ring'?'shenjie':slot==='jade'?'shenpei':p[9]===1?'shenhuan':p[9]===2?'shensuo':'shenqiang')+'.png':p[3]===0&&p[9]===2?'assets/native/relic-shensuo.png':null,
    description:arm.description+' · '+(actors.length===3?'全队可佩戴':actors.map(id=>({hero:'凌飞云',fei:'耿沐霏',lan:'兰芷萱'})[id]).join('、')+'使用')};
}
equipment.polu={name:'破虏剑',slot:'quest',icon:'silver',rarity:'御剑信物',description:'青年剑客赠予的古剑，习得御剑之术后用于飞行。'};
export const canFly = state => !!state.journey && state.journey.index >= 8;
export const itemArt = item => item.art || (item.slot==='weapon'?'assets/native/relic-shenqiang.png':item.slot==='ring'?'assets/native/relic-shenjie.png':item.slot==='jade'?'assets/native/relic-shenpei.png':`assets/native/item-${item.icon}.png`);
export function grantEquipment(state,id,{equip=false,count=1}={}) {
  const j=state.journey,item=equipment[id];if(!j||!item)return false;
  const fresh=addEquipment(state,id,count);if(equip&&item.slot!=='quest')equipItem(state,id,item.actor||'hero');return fresh;
}
export function originalState(base) {
  return { ...base, hp:220,mp:66,coins:characterRules.initial.coins,potions:0,map: 0, tile: { x: 8, y: 12 }, stage: 0, party: false, ending: null,
    journey: { index: 0, line: 0, members: [], completed: false, visited: [0], flying: false,
      owned: Object.keys(characterRules.initial.arms).map(n=>'arm-'+n), armCounts:Object.fromEntries(Object.entries(characterRules.initial.arms).map(([n,count])=>['arm-'+n,count])),equipped: { weapon: null, ring: null, jade: null }, skillRank: 1, antidotes: 0, side: {},actorLevels:{fei:5,lan:10},actorXP:{fei:0,lan:0},learned:{},items:{...characterRules.initial.items},rulesVersion:2 } };
}
export function journeyObjective(state, steps) {
  if (state.journey.index >= steps.length) return { title: '花叶永不相见', text: '原作主线已至终章。可重温结局、回访已到过的地方，或另启新程。', target: null, chapter: 6, completed: true };
  const s = steps[state.journey.index];
  return { ...s, text: `${s.kind === 'battle' ? '前往交锋' : s.kind === 'travel' ? '穿过此地 · 可绕开旋风' : '前往交谈'} · ${s.title}`, target: 'main-goal' };
}
export function advanceJourney(state, steps) {
  const j = state.journey, step = steps[j.index];
  if (!step) return false;
  if (step.party) j.members = [...step.party];
  state.party = j.members.length > 0;
  const grant = id => { if (!j.owned.includes(id)) j.owned.push(id); j.equipped[equipment[id].slot] = id; };
  if (step.title === '一块锦鲤玉佩') grant('koi');
  if (step.title === '沐霏相救') grant('wood');
  if (step.title === '亮银枪归来') grant('silver');
  if (step.title === '神枪与蛇毒') grant('liquan');
  if (step.title === '古庙逢君') grantEquipment(state,'polu');
  if (step.title === '临行嘱托') grantEquipment(state,'arm-65',{equip:true});
  if (step.title === '兵器库将倾') grantEquipment(state,'arm-75',{equip:true});
  j.index++;while(steps[j.index]?.superseded)j.index++;j.line = 0; j.completed = j.index === steps.length;
  delete j.afterBattle;
  delete j.battleWave;
  return true;
}
export function equipmentStats(state,actor='hero') {
  const equipped=actor==='hero'?state.journey?.equipped:state.journey?.companionEquipment?.[actor];
  return Object.values(equipped || {}).reduce((sum, id) => ({ attack: sum.attack + (equipment[id]?.attack || 0), defense: sum.defense + (equipment[id]?.defense || 0),health:sum.health+(equipment[id]?.health||0),mana:sum.mana+(equipment[id]?.mana||0) }), { attack: 0, defense: 0,health:0,mana:0 });
}
export function equipItem(state, id,actor=equipment[id]?.actor||equipment[id]?.actors?.[0]||'hero') {
  if (!state.journey?.owned.includes(id) || !equipment[id]) return false;
  const j=state.journey,item=equipment[id];
  if(item.slot==='quest'||!['hero','fei','lan'].includes(actor)||item.actor&&item.actor!==actor||item.actors&&!item.actors.includes(actor))return false;
  if(item.originalId!==undefined&&!canEquipOriginal(state,actor,item.originalId))return false;
  j.companionEquipment ||= {};
  const targetSlots=actor==='hero'?j.equipped:j.companionEquipment[actor]||{};
  if(targetSlots[item.slot]!==id&&equippedCount(state,id)>=equipmentCount(state,id))for(const current of [j.equipped,...Object.values(j.companionEquipment)])for(const [slot,other]of Object.entries(current))if(other===id)delete current[slot];
  const slots=actor==='hero'?j.equipped:(j.companionEquipment[actor] ||= {});
  slots[item.slot] = id;
  clampPartyVitals(state);
  return true;
}
export function clampPartyVitals(state) {
  const j=state.journey;if(!j)return;
  const hero=characterStats(state);state.hp=Math.min(state.hp,hero.maxHP);state.mp=Math.min(state.mp,hero.maxMP);
  for(const [member,vitals]of Object.entries(j.partyVitals||{})){const stats=characterStats(state,member);vitals.hp=Math.min(vitals.hp,stats.maxHP);vitals.mp=Math.min(vitals.mp,stats.maxMP);}
}
export function purchase(state, id) {
  const item = equipment[id];
  if (!item || !item.price || state.coins < item.price || state.journey.owned.includes(id)) return false;
  state.coins -= item.price; state.journey.owned.push(id); return true;
}
export function flightPath(map, start, end) {
  const path = [], p = { ...start };
  end = { x: Math.max(0, Math.min(map.width - 1, Math.round(end.x))), y: Math.max(0, Math.min(map.height - 1, Math.round(end.y))) };
  while (p.x !== end.x || p.y !== end.y) {
    if (p.x !== end.x) p.x += Math.sign(end.x - p.x); else p.y += Math.sign(end.y - p.y);
    path.push({ ...p });
  }
  return path;
}
export const enemyTypes = {
  soldiers: ['金军守卫', 'mon1', null], pursuers: ['金军亲卫', 'mon2', null], trial: ['义军武师', 'mon4', null],
  ambush: ['守库伏兵', 'mon4', null], taimeng: ['神兽态蒙', 'taimeng', 'confuse'], litd: ['厉天渡', 'litd', null],
  ice: ['牛皋之魂', 'mon4', 'freeze'], fire: ['杨再兴之魂', 'mon2', 'burn'], snake: ['沥泉蛇怪', 'snake', 'burn'],
  war: ['金军精锐', 'mon4', null], li: ['完颜羽诚', 'litd', 'confuse'], golden: ['金色妖物', 'golden', null], ghost: ['魁召', 'ghost', 'confuse']
};
export function fieldPools(map,scene) {
  return originalFields[scene]?.map===map?originalFields[scene]:Object.values(originalFields).find(s=>s.map===map)||{normal:[],rare:[],chests:[]};
}
export function journeyEncounter(step, state, type = step.enemy, wave = 0) {
  const teamId=step.battleTeams?.[wave];
  if(teamId!==undefined) return originalEncounter(teamId,step,state);
  const pools=fieldPools(step.map,step.scene),pool=type==='golden'&&pools.rare.length?pools.rare:pools.normal;
  if(type!=='ghost'&&pool.length)return originalEncounter(pool[Math.floor(Math.random()*pool.length)],step,state);
  // Scripted side encounters without field actors retain their original monster identity.
  if(type!=='golden') {
    const ids={ghost:38,ice:44,fire:45,snake:46,taimeng:40,litd:41,li:51};
    const stage=Math.min(29,Math.floor((state.journey?.index||0)/2));
    const monsters=ids[type]!==undefined?[ids[type]]:[stage,Math.max(0,stage-1)];
    return originalEncounter(null,step,state,monsters);
  }
  const [name, sprite, status] = enemyTypes[type] || enemyTypes.soldiers, level = state.level;
  const boss = ['litd', 'taimeng', 'snake', 'li', 'ghost', 'golden', 'ice', 'fire'].includes(type);
  return { name: step.title, reward: 65 + level * 25, xp: 55 + level * 20, background: '',
    landscape: step.map >= 4 && step.map <= 11 || step.map === 26 || step.map === 41 ? 'cave' : step.map >= 19 && step.map <= 35 ? 'camp' : 'forest',
    enemies: [{ name, sprite, hp: (boss ? 95 : 60) + level * 21, attack: 9 + level * 3, status },
      ...(!boss ? [{ name: '持刀护卫', sprite: 'mon2', hp: 40 + level * 16, attack: 7 + level * 2 }] : [])] };
}
export function originalEncounter(teamId,step,state,monsterIds=null) {
  const ids=monsterIds||originalRules.teams[teamId]?.monsters;if(!ids)throw new Error('Missing original team '+teamId);
  return {name:step.title,reward:ids.reduce((n,id)=>n+originalRules.monsters[id].coins,0),xp:ids.reduce((n,id)=>n+originalRules.monsters[id].xp,0),teamId,native:true,
    expectedOutcome:originalBattleOutcome({battleTeams:[teamId]}),
    landscape:step.map>=4&&step.map<=11||step.map===41?'cave':step.map>=19&&step.map<=35?'camp':'forest',
    enemies:ids.map(id=>{const m=originalRules.monsters[id],sprite=m.sprite.replace('/','');
      return {originalId:id,name:m.name.replace(/\s*\d+级\s*$/,''),sprite,hp:m.stats[5],attack:Math.round((m.stats[0]+m.stats[1])/2),originalStats:monsterStats(m),
        skills:m.skills,skillRates:m.skillRates,counterRate:m.counterRate,counterType:m.counterType};})};
}
// e.java: each equipment ID is paired with a percentage; stop after a non-guaranteed success.
export function encounterLoot(encounter,rng=Math.random) {
  const result=[];
  for(const enemy of encounter.enemies) {
    const m=originalRules.monsters[enemy.originalId];if(!m)continue;
    for(let i=0;i<m.dropEquipment.length;i++) {
      const chance=m.equipmentRates[i];if(Math.floor(rng()*100)>=chance)continue;
      result.push({id:'arm-'+m.dropEquipment[i],count:1});if(chance!==100)break;
    }
  }
  return result;
}
export function battleRewards(state,encounter,rng=Math.random) {
  const loot=encounter.fixedLoot||encounterLoot(encounter,rng),collected=[];
  for(const entry of loot) {
    if(!equipment[entry.id])continue;
    const fresh=grantEquipment(state,entry.id,{count:entry.count||1});collected.push({...entry,fresh});
  }
  return collected;
}
export function originalItemDrops(state,encounter,rng=Math.random){
  const drops=[];
  for(const enemy of encounter.enemies){const m=originalRules.monsters[enemy.originalId];if(!m)continue;
    for(let i=0;i<m.dropItems.length;i++){const chance=m.itemRates[i];if(Math.floor(rng()*100)>=chance)continue;const index=m.dropItems[i];if(originalRules.items[index]){addItem(state,index);drops.push({index,name:originalRules.items[index].name,count:1});}if(chance!==100)break;}
  }
  return drops;
}
