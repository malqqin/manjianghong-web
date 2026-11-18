// Names and first-rank descriptions transcribed from the original SkillData.bin.
import { equipmentStats } from './journey.js';
import { characterRules } from './character-rules.js';
import { learnedIndices, characterStats } from './progression.js';
export const skillSets = {
  hero: [
    { id: 'rainbow', name: '长虹贯日', description: '单体150%的伤害', cost: 8, effect: 'strike', power: 1.5, fx: 'wave' },
    { id: 'wildfire', name: '燎原四方', description: '双体灼烧2回合', cost: 12, effect: 'burn', fx: 'fire' },
    { id: 'surge', name: '气吞万里', description: '忽略全体防御20%', cost: 10, effect: 'pierce', fx: 'aura' },
    { id: 'rage', name: '怒目而视', description: '2回合全体攻+30%', cost: 10, effect: 'attackBuff', fx: 'aura' }
  ],
  fei: [
    { id: 'chase', name: '花下追影', description: '+20%暴攻击目标', cost: 4, effect: 'critical', fx: 'slash' },
    { id: 'moon', name: '碧月飞星', description: '双体冰冻1回合', cost: 8, effect: 'freeze', fx: 'ice' },
    { id: 'dance', name: '栖鸾舞风', description: '150%伤害回20%血', cost: 8, effect: 'drain', power: 1.5, fx: 'wave' },
    { id: 'shelter', name: '眷红偎翠', description: '2回合全体防+20%', cost: 8, effect: 'defenseBuff', fx: 'aura' }
  ],
  lan: [
    { id: 'fragrance', name: '暗香疏影', description: '三体100%伤害', cost: 7, effect: 'area', power: 1, fx: 'petal' },
    { id: 'coldmoon', name: '冷月残红', description: '单体200%伤害', cost: 8, effect: 'strike', power: 2, fx: 'wave' },
    { id: 'whisper', name: '花语似珠', description: '双体混乱1回合', cost: 8, effect: 'confuse', fx: 'petal' },
    { id: 'spring', name: '如沐春风', description: '单体回血30%', cost: 6, effect: 'heal', fx: 'heal' },
    { id: 'revive', name: '寸草春晖', description: '复活 回血30%', cost: 12, effect: 'revive', fx: 'heal' }
  ]
};
export const partyNames = { hero: '凌飞云', fei: '耿沐霏', lan: '兰芷萱' };
// First-rank SkillData.bin records: target currency animation r, caster animation s, 精气 cost.
const nativeRecords = {
  hero: [[0,12,15,1],[4,13,15,2],[8,14,35,'all'],[12,9,40,'all']],
  fei: [[16,16,15,1],[20,18,30,2],[24,19,25,1],[28,10,40,'all']],
  lan: [[32,20,35,3],[36,21,15,1],[40,22,30,2],[44,23,10,1],[48,23,40,1]]
};
for (const [actor, records] of Object.entries(nativeRecords)) records.forEach(([sourceIndex,r,cost,targetCount],i) =>
  Object.assign(skillSets[actor][i], { sourceIndex,r,s:11,cost,targetCount }));
const ultimateIds={56:'mountain',57:'heaven',58:'shadows',59:'hearts',60:'bloom',61:'petalstorm'};
export function decodedSkill(index,template={}) {
  const s=characterRules.skills[index];
  return {...template,id:ultimateIds[index]||template.id||'native-'+index,name:s.name,description:s.description,sourceIndex:index,rank:index<56?index%4+1:1,
    cost:Math.max(0,-s.effects[2]),rageCost:Math.max(0,-s.effects[4]),r:s.r,s:s.s,power:s.k/100,
    targetCount:s.b===2||s.b===5?'all':s.b===4?s.p:1,turns:s.n,
    healPercent:s.e/100,manaPercent:s.f/100,attackPercent:s.g/100,defensePercent:s.h/100,
    statusTurns:{freeze:s.effects[13],burn:s.effects[14],confuse:s.effects[15]},
    passive:!!s.o,effect:index===60?'restore':index>=56?'nativeAttack':template.effect||'strike'};
}
export function learnedSkills(state,actor='hero') {
  return learnedIndices(state,actor).map(index=>decodedSkill(index,skillSets[actor].find(s=>Math.floor(s.sourceIndex/4)===Math.floor(index/4))));
}
export function nativeSkill(actor, id, battle=null) { return battle?.learnedSkills?.[actor]?.find(s=>s.id===id)||skillSets[actor]?.find(s => s.id === id) || skillSets[actor]?.[0]; }
export function combatCompanions(state) {
  const ids = state.journey ? state.journey.members : state.party ? ['lan'] : [];
  return ids.map(id => {
    const gear=equipmentStats(state,id);
    const stats=state.journey?characterStats(state,id):null;
    const maxHP = stats?.maxHP??100 + state.level * 20+gear.health, maxMP = stats?.maxMP??28 + state.level * 4+gear.mana, saved = state.journey?.partyVitals?.[id];
    return { id, name: partyNames[id], sprite: id === 'fei' ? 'gengml' : 'nalan_da',attackBonus:gear.attack,defenseBonus:gear.defense,
      hp: Math.min(maxHP, saved?.hp ?? maxHP), maxHP, mp: Math.min(maxMP, saved?.mp ?? maxMP), maxMP,stats,rage:saved?.rage||0,
      statuses: { freeze:0,burn:0,confuse:0 } };
  });
}
