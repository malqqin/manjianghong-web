import { STORY_COUNT, equipmentStats, equipment } from './journey.js';
import { combatCompanions, nativeSkill, skillSets, learnedSkills } from './skills.js';
import { characterStats } from './progression.js';
import { characterRules } from './character-rules.js';
import { tacticalTurn } from './tactical.js';
export const SAVE_KEY = 'mjh-touch-v1';
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function walkable(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && Boolean(map.collision[y * map.width + x] & 8);
}
export function component(map) {
  const visited = new Set(); let largest = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const start = y * map.width + x;
    if (visited.has(start) || !walkable(map, x, y)) continue;
    const queue = [{ x, y }]; visited.add(start);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = p.x + dx, ny = p.y + dy, key = ny * map.width + nx;
        if (walkable(map, nx, ny) && !visited.has(key)) { visited.add(key); queue.push({ x: nx, y: ny }); }
      }
    }
    if (queue.length > largest.length) largest = queue;
  }
  return largest;
}
export function nearestTile(tiles, x, y) {
  return tiles.reduce((best, p) => !best || Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best, null);
}
export function findPath(map, start, end) {
  if (!walkable(map, start.x, start.y) || !walkable(map, end.x, end.y)) return [];
  const key = p => p.y * map.width + p.x;
  const queue = [start], previous = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === end.x && p.y === end.y) {
      const path = []; let current = p;
      while (previous.get(key(current))) { path.unshift(current); current = previous.get(key(current)); }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (walkable(map, next.x, next.y) && !previous.has(key(next))) {
        previous.set(key(next), p); queue.push(next);
      }
    }
  }
  return [];
}
export function newGame() {
  return { version: 1, stage: 0, map: 12, tile: { x: 17, y: 12 }, hp: 120, mp: 32, level: 1, xp: 0,
    coins: 60, potions: 3, bond: 0, party: false, flags: {}, journal: [], ending: null, playtime: 0, updated: Date.now() };
}
export const maxHP = state => state.journey?characterStats(state).maxHP:100 + state.level * 20 + equipmentStats(state).health;
export const maxMP = state => state.journey?characterStats(state).maxMP:28 + state.level * 4 + equipmentStats(state).mana;
export function validateSave(input) {
  if (!input || input.version !== 1 || !Number.isInteger(input.stage) || input.stage < 0 || input.stage > 7 ||
    !(input.journey ? Number.isInteger(input.map) && input.map >= 0 && input.map < 42 && input.map !== 36 : [12, 0, 4, 19].includes(input.map)) || !Number.isInteger(input.level) || input.level < 1 || input.level > (input.journey ? 60 : 4) ||
    !input.tile || !Number.isFinite(input.tile.x) || !Number.isFinite(input.tile.y) ||
    !Array.isArray(input.journal) || !input.flags || typeof input.flags !== 'object' || Array.isArray(input.flags)) return null;
  const state = { ...newGame(), ...input };
  if (input.journey) {
    const j = input.journey;
    if (!Number.isInteger(j.index) || j.index < 0 || j.index > STORY_COUNT || !Number.isInteger(j.line) || j.line < 0 || j.line > 500 ||
      !Array.isArray(j.members) || j.members.some(id => !['fei', 'lan'].includes(id)) || !Array.isArray(j.owned) || j.owned.some(id => !equipment[id]) ||
      !j.equipped || typeof j.equipped !== 'object' || !Array.isArray(j.visited) || j.visited.some(id => !Number.isInteger(id) || id < 0 || id > 41) ||
      !Number.isInteger(j.skillRank) || j.skillRank < 1 || j.skillRank > 4 || !Number.isInteger(j.antidotes) || j.antidotes < 0 || j.antidotes > 99 ||
      !j.side || typeof j.side !== 'object' || Array.isArray(j.side)) return null;
    const validSlots=(slots,actor)=>slots&&typeof slots==='object'&&!Array.isArray(slots)&&Object.entries(slots).every(([slot,id])=>['weapon','armor','bracer','ring','jade'].includes(slot)&&(!id||j.owned.includes(id)&&equipment[id]?.slot===slot&&(!equipment[id].actor||equipment[id].actor===actor)&&(!equipment[id].actors||equipment[id].actors.includes(actor))));
    if(!validSlots(j.equipped,'hero'))return null;
    if(j.companionEquipment!==undefined&&(!j.companionEquipment||typeof j.companionEquipment!=='object'||Array.isArray(j.companionEquipment)||Object.entries(j.companionEquipment).some(([actor,slots])=>!['fei','lan'].includes(actor)||!validSlots(slots,actor))))return null;
    if(j.battleWave!==undefined&&(!Number.isInteger(j.battleWave)||j.battleWave<0||j.battleWave>2))return null;
    if (j.afterBattle !== undefined && (!Number.isInteger(j.afterBattle) || j.afterBattle !== j.index)) return null;
    if (j.partyVitals !== undefined && (!j.partyVitals || typeof j.partyVitals !== 'object' || Array.isArray(j.partyVitals) ||
      Object.entries(j.partyVitals).some(([id,v]) => !['fei','lan'].includes(id) || !v || !Number.isFinite(v.hp) || !Number.isFinite(v.mp) || v.hp < 0 || v.mp < 0))) return null;
    if (j.tactics !== undefined && (!j.tactics || typeof j.tactics !== 'object' || Array.isArray(j.tactics) || Object.entries(j.tactics).some(([id, skill]) => !['fei', 'lan'].includes(id) || skill !== 'attack' && !skillSets[id].some(s => s.id === skill && s.effect !== 'revive')))) return null;
    state.journey = { ...j, completed: j.index === STORY_COUNT, flying: false, members: [...new Set(j.members)], visited: [...new Set(j.visited)] };
    if(j.index===11){state.journey.index=12;state.journey.line=0;}
    for(const key of ['actorLevels','actorXP','items','learned','armCounts','clearedEncounters','nativeVars'])if(j[key]!==undefined&&(!j[key]||typeof j[key]!=='object'||Array.isArray(j[key])))return null;
    if(Object.entries(j.actorLevels||{}).some(([id,l])=>!['fei','lan'].includes(id)||!Number.isInteger(l)||l<1||l>60))return null;
    if(Object.values(j.items||{}).some(n=>!Number.isInteger(n)||n<0||n>99))return null;
    if(Object.entries(j.armCounts||{}).some(([id,n])=>!equipment[id]||!Number.isInteger(n)||n<0||n>99))return null;
    if(Object.values(j.actorXP||{}).some(n=>!Number.isFinite(n)||n<0))return null;
    if(Object.values(j.clearedEncounters||{}).some(n=>!Number.isFinite(n)||n<0))return null;
    if(j.fieldClock!==undefined&&(!Number.isFinite(j.fieldClock)||j.fieldClock<0))return null;
    if(Object.values(j.nativeVars||{}).some(n=>!Number.isFinite(n)))return null;
    if(j.nativeStageIndex!==undefined&&(!Number.isInteger(j.nativeStageIndex)||j.nativeStageIndex<0||j.nativeStageIndex>STORY_COUNT))return null;
    if(Object.entries(j.learned||{}).some(([id,list])=>!['hero','fei','lan'].includes(id)||!Array.isArray(list)||list.some(n=>!Number.isInteger(n)||n<0||n>61)))return null;
    if(j.owned.includes('liquan')){
      const target=state.journey, ownsOriginal=j.owned.includes('arm-64');
      target.owned=[...new Set(j.owned.map(id=>id==='liquan'?'arm-64':id))];
      target.armCounts={...j.armCounts,'arm-64':ownsOriginal?(j.armCounts?.['arm-64']??1):(j.armCounts?.liquan??1)};
      delete target.armCounts.liquan;
      if(j.equipped.weapon==='liquan')target.equipped={...j.equipped,weapon:state.level>=40?'arm-64':null};
    }
    state.party = state.journey.members.length > 0;
    if((j.rulesVersion||0)<2){
      const target=state.journey;target.items={...(j.items||{})};
      const add=(id,count)=>{target.items[id]=Math.min(99,(target.items[id]||0)+count);};
      add(8,Math.max(0,Math.floor(state.potions)));for(const id of [2,3,4])add(id,j.antidotes||0);state.potions=0;target.antidotes=0;
      target.actorLevels={fei:Math.max(5,state.level),lan:Math.max(10,state.level),...(j.actorLevels||{})};target.actorXP={fei:0,lan:0,...(j.actorXP||{})};
      target.rulesVersion=2;
      if(!j.rulesVersion)state.xp=Math.min(state.xp,Math.max(0,characterRules.experience[state.level]-1));
    }
  }
  for (const field of ['hp', 'mp', 'coins', 'potions', 'bond', 'xp', 'playtime']) if (!Number.isFinite(state[field])) return null;
  state.hp = clamp(state.hp, state.journey ? 0 : 1, maxHP(state)); state.mp = clamp(state.mp, 0, maxMP(state));
  state.potions = clamp(Math.floor(state.potions), 0, 99); state.coins = clamp(Math.floor(state.coins), 0, 99999);
  state.xp = clamp(Math.floor(state.xp), 0, 99999); state.playtime = Math.max(0, state.playtime); state.bond = clamp(state.bond, 0, 10);
  state.party = Boolean(state.party); state.ending = ['together', 'wander'].includes(state.ending) ? state.ending : null;
  state.journal = state.journal.slice(-40).map(x => String(x).slice(0, 500));
  return state;
}
export const encounters = {
  patrol: { name: '枫林遇伏', background: 'b2.png', reward: 80, xp: 90,
    enemies: [{ name: '金军斥候', sprite: 'mon1', hp: 62, attack: 13 }, { name: '持刀游骑', sprite: 'mon2', hp: 74, attack: 16 }] },
  cave: { name: '暗香藏刃', background: 'b1.png', reward: 100, xp: 110,
    enemies: [{ name: '黑衣伏兵', sprite: 'mon2', hp: 96, attack: 19 }, { name: '守洞枪兵', sprite: 'mon4', hp: 88, attack: 17 }] },
  boss: { name: '铁骑破阵', background: 'b3.png', reward: 180, xp: 150,
    enemies: [{ name: '铁骑统领', sprite: 'litd', hp: 238, attack: 26 }, { name: '亲卫', sprite: 'mon4', hp: 88, attack: 18 }] }
};
export function createBattle(id, state) {
  const encounter = encounters[id];
  const stats = equipmentStats(state);
  const battle = { id,native:!!encounter.native,round: 1, hp: state.hp, mp: state.mp, maxHP: maxHP(state), maxMP: maxMP(state),
    level: state.level, potions: state.potions, companion: state.party, focus: false, outcome: null,
    attackBonus: stats.attack, defenseBonus: stats.defense,
    stats:state.journey?characterStats(state):null,rage:state.journey?.rage||0,
    itemCounts:structuredClone(state.journey?.items||{}),
    learnedSkills:state.journey?Object.fromEntries(['hero',...state.journey.members].map(id=>[id,learnedSkills(state,id).filter(s=>!s.passive)])):null,
    spear: !!state.journey, activeActor: 'hero', spent: [],
    antidotes: state.journey?.antidotes || 0, statuses: { freeze: 0, burn: 0, confuse: 0 },
    companions: combatCompanions(state), companionName: state.journey?.members.includes('lan') ? '兰芷萱' : state.journey ? '耿沐霏' : '兰芷萱',
    enemies: encounter.enemies.map((e, i) => ({ ...e, hp: e.hp - (id === 'boss' && state.flags.intel ? 30 : 0),
      maxHP: e.hp, id: i, stagger: false })), events: [] };
  battle.activeActor=battle.hp>0?'hero':battle.companions.find(a=>a.hp>0)?.id || null;
  return battle;
}
export function intent(enemy, round) {
  if (round % 3 === 0) return { text: '蓄力重击', multiplier: 1.8, heavy: true };
  if ((round + enemy.id) % 4 === 0) return { text: '整备 · 本回合不攻击', multiplier: 0, heavy: false };
  return { text: '普通攻击', multiplier: 1, heavy: false };
}
export function battleTurn(current, action, target = 0, skillId = null, actorId = current.activeActor, allyTarget = actorId) {
  if (current.spear) return tacticalTurn(current, action, target, skillId, actorId, allyTarget);
  const b = structuredClone(current); b.events = [];
  if (b.outcome) return b;
  const enemy = b.enemies.find(e => e.id === target && e.hp > 0) || b.enemies.find(e => e.hp > 0);
  const heroSkill = nativeSkill('hero', action === 'sweep' ? 'wildfire' : skillId);
  const costs = { skill: b.spear ? heroSkill.cost : 8, sweep: 12 };
  if (costs[action] && b.mp < costs[action]) return { ...b, error: '真气不足，可以防御回气。' };
  if (action === 'sweep' && b.level < 2) return { ...b, error: '二级习得横扫千军。' };
  if (action === 'potion' && !b.potions) return { ...b, error: '行囊中没有金疮药了。' };
  if (action === 'cleanse' && !b.antidotes) return { ...b, error: '没有清平丸了。' };
  if (!['attack', 'skill', 'sweep', 'guard', 'potion', 'cleanse'].includes(action)) return { ...b, error: '未知招式' };
  const emit = event => b.events.push({ ...event, state: { hp: b.hp, mp: b.mp, potions: b.potions, focus: b.focus,
    statuses: { ...b.statuses }, antidotes: b.antidotes, companions: b.companions?.map(a => ({ ...a })),
    attackBuff: b.attackBuff, defenseBuff: b.defenseBuff, pierce: b.pierce,
    enemies: b.enemies.map(e => ({ id: e.id, hp: e.hp, freeze: e.freeze || 0, burn: e.burn || 0, confuse: e.confuse || 0 })) } });
  const damage = (e, n, kind, source = 'hero', skill = null) => {
    const defense = b.spear && source !== 'burn-enemy' ? Math.round((e.defense || b.level * 2) * (b.pierce ? .8 : 1)) : 0;
    const actual = Math.min(e.hp, Math.max(1, Math.round((n + (source === 'hero' ? b.attackBonus || 0 : 0)) * (b.attackBuff ? 1.3 : 1)) - defense)); e.hp -= actual;
    emit({ source, target: e.id, amount: actual, text: kind, type: 'damage', defeated: e.hp <= 0, skill });
  };
  const useSkill = (actor, skill, base) => {
    const source = actor.id, foes = b.enemies.filter(e => e.hp > 0), victim = foes.find(e => e.id === target) || foes[0];
    const text = actor.name + ' · ' + skill.name;
    const heal = value => { const amount = Math.min(b.maxHP - b.hp, Math.round(b.maxHP * value)); b.hp += amount;
      emit({ source, target: 'hero', type: 'heal', text, amount, skill }); };
    if (['strike', 'critical', 'drain'].includes(skill.effect)) {
      damage(victim, Math.round(base * (skill.power || (b.round % 5 === 0 ? 2 : 1))), text, source, skill);
      if (skill.effect === 'drain') heal(.2);
    } else if (skill.effect === 'area') foes.slice(0, 3).forEach(e => damage(e, base, text, source, skill));
    else if (['burn', 'freeze', 'confuse'].includes(skill.effect)) foes.slice(0, 2).forEach(e => {
      e[skill.effect] = skill.effect === 'burn' ? 2 : 1;
      emit({ source, target: e.id, type: 'status', text: text + ' · ' + ({ burn: '灼烧', freeze: '冰冻', confuse: '混乱' })[skill.effect], skill });
    });
    else if (skill.effect === 'heal' || skill.effect === 'revive') heal(.3);
    else {
      b[skill.effect === 'attackBuff' ? 'attackBuff' : skill.effect === 'defenseBuff' ? 'defenseBuff' : 'pierce'] = 2;
      emit({ source, target: 'hero', type: 'buff', text, skill });
    }
  };
  let guard = false;
  if (action === 'cleanse') { b.antidotes--; b.statuses = { freeze: 0, burn: 0, confuse: 0 }; emit({ source: 'hero', type: 'heal', text: '清平丸 · 异常状态解除' }); }
  else if (b.statuses?.freeze > 0) { b.statuses.freeze--; emit({ source: 'hero', type: 'guard', text: '冰冻 · 本回合无法行动' }); action = 'frozen'; }
  else if (b.statuses?.confuse > 0 && ['attack', 'skill', 'sweep'].includes(action)) {
    b.statuses.confuse--; const hit = 8 + b.level * 2; b.hp = Math.max(0, b.hp - hit);
    emit({ source: 'hero', target: 'hero', amount: hit, type: 'damage', text: '混乱 · 误伤自己', defeated: !b.hp }); action = 'confused';
  }
  if (action === 'attack') { const bonus = b.focus ? 12 : 0; b.mp = Math.min(b.maxMP, b.mp + 3); b.focus = false; damage(enemy, 18 + b.level * 4 + bonus, b.spear ? '长枪突刺' : '流云剑'); }
  if (action === 'skill' || action === 'sweep' && b.spear) {
    const bonus = b.focus ? 12 : 0; b.mp -= costs[action]; b.focus = false;
    if (b.spear) useSkill({ id: 'hero', name: '凌飞云' }, heroSkill, 18 + b.level * 4 + bonus);
    else damage(enemy, 36 + b.level * 7 + bonus, '惊鸿一剑');
    enemy.stagger = true;
  }
  if (action === 'sweep' && !b.spear) { b.mp -= 12; b.focus = false; b.enemies.filter(e => e.hp > 0).forEach(e => damage(e, 27 + b.level * 5, '横扫千军')); }
  if (action === 'guard') { guard = true; b.focus = true; b.mp = Math.min(b.maxMP, b.mp + 9); emit({ source: 'hero', type: 'guard', text: '凝神守势 · 下一击伤害提高' }); }
  if (action === 'potion') { b.potions--; const heal = Math.min(65, b.maxHP - b.hp); b.hp += heal; emit({ source: 'hero', target: 'hero', amount: heal, type: 'heal', text: '金疮药' }); }
  if (b.spear) for (const ally of b.companions || []) {
    if (b.hp <= 0 || !b.enemies.some(e => e.hp > 0)) break;
    let skill = nativeSkill(ally.id, ally.skill);
    if (ally.id === 'lan' && b.hp < b.maxHP * .55 && ally.skill === 'fragrance') skill = nativeSkill('lan', 'spring');
    if (ally.skill !== 'attack' && ally.mp >= skill.cost && !(skill.effect === 'heal' && b.hp >= b.maxHP)) { ally.mp -= skill.cost; useSkill(ally, skill, 12 + b.level * 3); }
    else { ally.mp = Math.min(ally.maxMP, ally.mp + 3); damage(b.enemies.find(e => e.hp > 0), 12 + b.level * 3, ally.name + ' · 普攻', ally.id); }
  }
  else if (b.companion && b.hp > 0 && b.enemies.some(e => e.hp > 0)) {
    if (b.round % 3 === 0 && b.hp < b.maxHP * .75) {
      const heal = Math.min(26, b.maxHP - b.hp); b.hp += heal;
      emit({ source: 'lan', target: 'hero', amount: heal, type: 'heal', text: `${b.companionName} · 援护` });
    } else damage(b.enemies.find(e => e.hp > 0), 12 + b.level * 3, `${b.companionName} · 连击`, 'lan');
  }
  for (const e of b.enemies.filter(e => e.hp > 0 && e.burn > 0)) {
    e.burn--; damage(e, Math.max(1, Math.round(e.maxHP * .1)), '灼烧', 'burn-enemy');
  }
  if (b.enemies.every(e => e.hp <= 0)) { b.outcome = 'victory'; return b; }
  for (const e of b.enemies.filter(e => e.hp > 0)) {
    if (b.hp <= 0) break;
    if (e.freeze > 0) { e.freeze--; emit({ source: e.id, target: e.id, type: 'guard', text: e.name + ' · 冰冻，无法行动' }); continue; }
    if (e.confuse > 0) { e.confuse--; damage(e, Math.max(1, Math.round(e.attack * .5)), e.name + ' · 混乱误伤', e.id); continue; }
    const plan = intent(e, b.round);
    if (e.stagger && plan.heavy) { emit({ source: e.id, target: e.id, type: 'break', text: e.name + '的蓄力被打断' }); e.stagger = false; continue; }
    e.stagger = false;
    if (!plan.multiplier) continue;
    const hit = Math.max(1, Math.round(e.attack * plan.multiplier * (guard ? .25 : 1) * (b.defenseBuff ? .8 : 1)) - (b.defenseBonus || 0)); b.hp = Math.max(0, b.hp - hit);
    if (b.hp > 0 && e.status && b.round % 4 === 0 && !guard) b.statuses[e.status] = e.status === 'freeze' ? 1 : 3;
    emit({ source: e.id, target: 'hero', amount: hit, type: 'damage', text: e.name + ' · ' + plan.text, defeated: b.hp <= 0 });
  }
  if (b.hp > 0 && b.statuses?.burn > 0) {
    b.statuses.burn--; const hit = Math.min(b.hp, Math.ceil(b.maxHP * .1)); b.hp -= hit;
    emit({ source: 'burn', target: 'hero', amount: hit, type: 'damage', text: '灼烧 · 失去一成生命', defeated: !b.hp });
  }
  if (b.hp <= 0) b.outcome = 'defeat';
  for (const buff of ['attackBuff', 'defenseBuff', 'pierce']) if (b[buff] > 0) b[buff]--;
  if (b.enemies.every(e => e.hp <= 0) && b.hp > 0) b.outcome = 'victory';
  b.round++; return b;
}
