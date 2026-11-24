// Integer arithmetic and random ranges follow y.java, not the skill descriptions.
import {characterRules} from './character-rules.js';
export function monsterStats(monster){
 const s=monster.stats,r=monster.rates;
 return {level:monster.level,attackMin:s[0],attackMax:s[1],defense:s[2],dodge:s[3]/100,critical:s[4]/100,maxHP:s[5],
  hit:r[0],reduction:r[1]+(r[2]?Math.trunc(s[2]/r[2]):0),rates:[...r],raw:[...s],resistance:monster.status.map(v=>v[0]),status:monster.status.map(v=>[...v])};
}
export function originalAttack(source,target,{skill=null,rng=Math.random}={}){
 const a=source.stats||source.originalStats,t=target.stats||target.originalStats,record=skill&&characterRules.skills[skill.sourceIndex],extra=record?.effects||[];
 const roll=n=>Math.floor(rng()*n),hit=record?100+(extra[10]||0):a.hit+Math.trunc((a.level-t.level)/3);
 if(roll(100)>=hit)return {amount:0,miss:true};
 const critical=roll(10000)<a.raw[4]+(extra[9]||0),buff=source.attackBuffPercent||0;
 let amount=critical?a.attackMax*2:Math.min(a.attackMin,a.attackMax)+roll(Math.abs(a.attackMax-a.attackMin)+1);
 amount+=Math.trunc(amount*buff/100);
 if(record)amount=record.l?Math.trunc(source.maxHP*(100+record.k)/100):Math.trunc(amount*(100+record.k)/100);
 // The original receiver checks dodge for ordinary attacks, not skill packets.
 if(!record&&roll(10000)<t.raw[3])return {amount:0,miss:true};
 const defense=t.defense+Math.trunc(t.defense*(target.defenseBuffPercent||0)/100),rates=t.rates||[t.hit,t.reduction,0];
 const reduction=rates[1]+(rates[2]?Math.trunc(defense/rates[2]):0)+(target.reductionChange||0)+(target.guarding?50:0);
 amount=Math.max(1,Math.trunc(amount*(100-reduction)/100));
 return {amount,critical,miss:false};
}
export function chooseMonsterSkill(monster,rng=Math.random){
 const n=Math.floor(rng()*100);let total=0;
 for(let i=0;i<(monster.skills||[]).length;i++)if(n<(total+=monster.skillRates[i]||0))return monster.skills[i];
 return null;
}
export function originalBattleOutcome(step,wave=0){
 return [36,42].includes(step.battleTeams?.[wave])?'defeat':'victory';
}
