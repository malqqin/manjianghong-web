import { characterRules as rules } from './character-rules.js';
import { originalRules } from './original-rules.js';

export const actorIds = ['hero','fei','lan'];
const legacyArms = Object.fromEntries(Object.entries({steel:'点钢枪',wood:'软藤枪',iron:'蘸金枪',silver:'亮银枪',liquan:'沥泉神枪',bronze:'青铜戒',linglong:'玲珑环',plainjade:'青玉佩',koi:'锦鲤玉佩',frostjade:'冰心佩'}).map(([key,name])=>[key,originalRules.arms.find(a=>a.name===name)?.index]));
export const actorLevel = (state,id='hero') => id==='hero'?state.level:state.journey?.actorLevels?.[id]||Math.max(rules.actors[actorIds.indexOf(id)].level,state.level);
export function learnedIndices(state,id='hero') {
  const index=actorIds.indexOf(id), base=rules.actors[index], level=actorLevel(state,id), result=[...base.skills];
  const add=n=>{if(n>=56){if(!result.includes(n))result.push(n);return;}const pos=result.findIndex(s=>s<56&&Math.floor(s/4)===Math.floor(n/4));if(pos<0)result.push(n);else result[pos]=Math.max(n,result[pos]);};
  for(let l=base.level+1;l<=Math.min(60,level);l++)if(rules.autoLearn[index][l]>=0)add(rules.autoLearn[index][l]);
  for(const n of state.journey?.learned?.[id]||[])if(rules.skills[n]&&level>=rules.minimumLevels[n])add(n);
  return result;
}
export function learnManual(state,id,itemId) {
  const n=itemId-17, skill=rules.skills[n];
  if(!skill||n<0||n>=56)return {ok:false,message:'这不是武功秘籍。'};
  const known=learnedIndices(state,id),current=known.find(s=>s<56&&Math.floor(s/4)===Math.floor(n/4));
  const owner=n<16?'hero':n<32?'fei':n<52?'lan':id;
  if(id!==owner)return {ok:false,message:'这本秘籍不适合这名人物。'};
  if(actorLevel(state,id)<rules.minimumLevels[n])return {ok:false,message:`需达到 ${rules.minimumLevels[n]} 级。`};
  if(current!==undefined&&n<=current)return {ok:false,message:'已经领悟这一重。'};
  if(current===undefined&&n%4||current!==undefined&&n!==current+1)return {ok:false,message:'需先领悟前一重，不能跳级研习。'};
  if(!(state.journey.items?.[itemId]>0))return {ok:false,message:'行囊中没有这本秘籍。'};
  state.journey.learned ||= {};state.journey.learned[id] ||= [];state.journey.learned[id].push(n);state.journey.items[itemId]--;
  return {ok:true,message:`领悟${skill.name} · 第${n%4+1}重`};
}
export function characterStats(state,id='hero') {
  const base=rules.actors[actorIds.indexOf(id)],level=actorLevel(state,id),delta=level-base.level;
  const raw=base.stats.map((v,i)=>v+delta*base.growth[i]),stats=[...raw],rates=[...base.rates],resistance=base.status.map(r=>r[0]);
  let mana=base.mana+delta*base.manaGrowth;
  const slots=id==='hero'?state.journey?.equipped:state.journey?.companionEquipment?.[id];
  for(const value of Object.values(slots||{})){
    const index=value?.startsWith('arm-')?Number(value.slice(4)):legacyArms[value],arm=originalRules.arms[index];if(!arm)continue;
    stats[5]+=Math.trunc(raw[5]*arm.properties[5]);mana+=Math.trunc((base.mana+delta*base.manaGrowth)*arm.properties[6])+arm.properties[4];
    arm.stats.forEach((v,i)=>stats[i]+=v);arm.rates.forEach((v,i)=>rates[i]+=v);arm.status.forEach((v,i)=>resistance[i]+=v[0]);
  }
  for(const n of learnedIndices(state,id)){
    const s=rules.skills[n];if(!s.o)continue;
    stats[0]+=Math.trunc(raw[0]*s.g/100);stats[1]+=Math.trunc(raw[1]*s.g/100);stats[2]+=Math.trunc(raw[2]*s.h/100);stats[5]+=Math.trunc(raw[5]*s.e/100);
    mana+=Math.trunc((base.mana+delta*base.manaGrowth)*s.f/100)+Math.trunc(s.d/100);
    s.stats.forEach((v,i)=>stats[i]+=v);s.rates.forEach((v,i)=>rates[i]+=v);s.status.forEach((v,i)=>resistance[i]+=v[0]);
  }
  return {level,attackMin:stats[0],attackMax:stats[1],defense:stats[2],dodge:stats[3]/100,critical:stats[4]/100,maxHP:stats[5],maxMP:mana,
    hit:rates[0],reduction:rates[1]+(rates[2]?Math.trunc(stats[2]/rates[2]):0),rates,resistance,status:base.status.map((v,i)=>[resistance[i],v[1],v[2]]),rage:base.rage,energy:base.energy,raw:stats};
}
export const experienceRequired = level => rules.experience[level] ?? Infinity;
export function gainExperience(state,amount,actors=['hero',...state.journey.members]) {
  const before=Object.fromEntries(actors.map(id=>[id,learnedIndices(state,id)]));
  const levels=Object.fromEntries(actors.map(id=>[id,actorLevel(state,id)]));
  const old=state.level;
  if(actors.includes('hero')){state.xp+=amount;while(state.level<60&&state.xp>experienceRequired(state.level)){state.xp-=experienceRequired(state.level);state.level++;}}
  state.journey.actorLevels ||= {};state.journey.actorXP ||= {};
  for(const id of actors.filter(id=>id!=='hero')){let l=levels[id],xp=(state.journey.actorXP[id]||0)+amount;while(l<60&&xp>experienceRequired(l)){xp-=experienceRequired(l);l++;}state.journey.actorLevels[id]=l;state.journey.actorXP[id]=xp;}
  const learned=[];for(const id of Object.keys(before))for(const n of learnedIndices(state,id))if(!before[id].includes(n))learned.push({actor:id,index:n,name:rules.skills[n].name});
  return {leveled:state.level>old,learned};
}
export function canEquipOriginal(state,id,armIndex) {
  const arm=originalRules.arms[armIndex];if(!arm)return true;
  const p=arm.properties,actor=rules.actors[actorIds.indexOf(id)];
  return actorLevel(state,id)>=p[10]&&(p[8]===2||p[8]===actor.sex)&&(p[9]===4||p[9]===actor.id);
}
