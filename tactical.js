import { nativeSkill, partyNames, decodedSkill } from './skills.js';
import { applyItem, itemRecord } from './items.js';
import {originalAttack,chooseMonsterSkill} from './combat-rules.js';
import {characterRules} from './character-rules.js';

export const partyActors = battle => [{ id: 'hero', name: partyNames.hero, hp: battle.hp, maxHP: battle.maxHP,
  mp: battle.mp, maxMP: battle.maxMP, statuses: battle.statuses, focus: battle.focus,
  guarding: battle.guarding, attackBuff: battle.attackBuff, defenseBuff: battle.defenseBuff,attackBuffPercent:battle.attackBuffPercent,defenseBuffPercent:battle.defenseBuffPercent,reductionChange:battle.reductionChange,reductionTurns:battle.reductionTurns,stats:battle.stats,rage:battle.rage||0 }, ...battle.companions];
export const availableActors = battle => partyActors(battle).filter(a => a.hp > 0 && !battle.spent.includes(a.id));
export const blockedByStatus = actor => actor.statuses?.freeze > 0 || actor.statuses?.confuse > 0;

// A command resolves only the selected actor. Uncommanded allies wait for player input.
export function tacticalTurn(current, action, target, skillId, actorId = current.activeActor, allyTarget = actorId) {
  const b = structuredClone(current); b.events = [];
  if (b.outcome) return b;
  const actors = partyActors(b), actor = actors.find(a => a.id === actorId);
  if (!actor || actor.hp <= 0 || b.spent.includes(actorId)) return { ...b, error: '这名队员本回合已行动或已倒下。' };
  if (!['attack', 'skill', 'sweep', 'guard', 'potion', 'cleanse','item','status-turn'].includes(action)) return { ...b, error: '未知指令' };
  if(action==='item'&&!(b.itemCounts?.[Number(skillId)]>0))return {...b,error:'行囊中没有这件药品。'};
  const requested=action==='sweep'?'wildfire':skillId||b.learnedSkills?.[actorId]?.[0]?.id||nativeSkill(actorId).id;
  const skill = nativeSkill(actorId, requested,b);
  if(['skill','sweep'].includes(action)&&b.learnedSkills&&!b.learnedSkills[actorId]?.some(s=>s.id===requested))return {...b,error:'尚未习得这门招式。'};
  if(['skill','sweep'].includes(action)&&(actor.rage||0)<(skill.rageCost||0))return {...b,error:'怒气不足，攻击与受击可积累怒气。'};
  if (['skill','sweep'].includes(action) && actor.mp < skill.cost) return { ...b, error: b.native?'精气不足，可使用返气丸等药品恢复。':'精气不足，可普攻或防御回气。' };
  if (action === 'potion' && !b.potions) return { ...b, error: '没有金疮药了。' };
  if (action === 'cleanse' && !b.antidotes) return { ...b, error: '没有清平丸了。' };
  if (action === 'skill' && skill.effect === 'revive' && !actors.some(a => a.hp <= 0)) return { ...b, error: '没有倒下的队友。' };
  const sync = () => { const hero = actors[0]; Object.assign(b, { hp: hero.hp, mp: hero.mp, statuses: { ...hero.statuses }, focus: hero.focus,
    guarding: hero.guarding, attackBuff: hero.attackBuff, defenseBuff: hero.defenseBuff,attackBuffPercent:hero.attackBuffPercent,defenseBuffPercent:hero.defenseBuffPercent,reductionChange:hero.reductionChange,reductionTurns:hero.reductionTurns,rage:hero.rage }); };
  const emit = event => { sync(); b.events.push({ ...event, action, state: { hp: b.hp, mp: b.mp, potions: b.potions, focus: b.focus,
    statuses: { ...b.statuses }, attackBuff: b.attackBuff, defenseBuff: b.defenseBuff, antidotes: b.antidotes, companions: b.companions.map(a => structuredClone(a)),
    enemies: b.enemies.map(e => structuredClone(e)) } }); };
  const damage = (victim, amount, source, text, move = null) => {
    const dealt = Math.min(victim.hp, Math.max(1, Math.round(amount))); victim.hp -= dealt;
    if(typeof victim.id==='string')victim.rage=Math.min(victim.stats?.rage||200,(victim.rage||0)+10);
    emit({ source, target: victim.id, amount: dealt, text, type: 'damage', defeated: victim.hp <= 0, skill: move });
  };
  const nativeStrike=(source,victim,move=null,forcedText=null)=>{
    const modifier=move&&characterRules.skills[move.sourceIndex];
    if(modifier?.rates[1]){victim.reductionChange=modifier.rates[1];victim.reductionTurns=modifier.n;}
    const hit=originalAttack(source,victim,{skill:move}),text=forcedText||source.name+' · '+(move?.name||'攻击');
    if(hit.miss){emit({source:source.id,target:victim.id,type:'guard',text:text+' · 未命中',skill:move});return;}
    const record=move&&characterRules.skills[move.sourceIndex],status=victim.statuses||victim;
    for(const [i,name]of ['freeze','burn','confuse'].entries()){
      const sourceStats=source.stats||source.originalStats,turns=record?record.effects[13+i]:sourceStats?.status?.[i]?.[2],rate=sourceStats?.status?.[i]?.[1]||0,resistance=(victim.stats||victim.originalStats)?.resistance?.[i]||0;
      if(turns&&victim.hp>hit.amount&&(record?resistance<100:Math.random()*100<rate&&Math.random()*100>=resistance)){
        status[name]=turns;
        // y.java stores one active abnormal state at a time.
        for(const other of ['freeze','burn','confuse'])if(other!==name)status[other]=0;
      }
    }
    damage(victim,hit.amount,source.id,text+(hit.critical?' · 暴击':''),move);
  };
  const nativeStatusTurn = (source, team) => {
    const status=source.statuses||source;
    if(status.freeze){
      emit({source:source.id,target:source.id,type:'guard',text:source.name+' · 冰冻，无法行动'});
      return true;
    }
    if(!status.confuse)return false;
    const targets=team.filter(target=>target!==source&&target.hp>0);
    const target=targets[Math.floor(Math.random()*targets.length)];
    if(target){
      if(typeof source.id==='string')source.rage=Math.min(source.stats?.rage||200,(source.rage||0)+10);
      nativeStrike(source,target,null,source.name+' · 混乱，攻击'+target.name);
    }else emit({source:source.id,target:source.id,type:'guard',text:source.name+' · 混乱，无同伴可攻击'});
    return true;
  };
  // y.java f()/g(): advance the current abnormal state on the owner's action,
  // then roll its resistance for early recovery.
  const finishNativeAction = source => {
    if(source.hp<=0)return;
    const status=source.statuses||source;
    if(status.burn&&source.hp>1){
      const amount=Math.min(source.hp-1,Math.trunc(source.maxHP*.1));
      if(amount>0)damage(source,amount,typeof source.id==='number'?'burn-enemy':'burn',source.name+' · 灼烧');
    }
    for(const [i,name] of ['freeze','burn','confuse'].entries()){
      if(!status[name])continue;
      status[name]--;
      const resistance=(source.stats||source.originalStats)?.resistance?.[i]||0;
      if(status[name]&&resistance&&Math.random()*100<resistance)status[name]=0;
    }
  };
  const living = () => b.enemies.filter(e => e.hp > 0);
  const selected = living().find(e => e.id === target) || living()[0];
  const heal = (victim, amount, move, text) => {
    const value = Math.min(victim.maxHP - victim.hp, Math.round(amount)); victim.hp += value;
    emit({ source: actorId, target: victim.id, amount: value, type: 'heal', skill: move, text });
  };
  actor.statuses ||= { freeze:0, burn:0, confuse:0 };
  let freeItem=false;
  const held = actor.statuses.freeze > 0;
  if (b.native&&nativeStatusTurn(actor,actors)) {
    // A frozen or confused actor cannot choose a command, including using medicine.
  } else if (action==='status-turn') {
    return {...b,error:'这名队员仍可正常行动。'};
  } else if (held && action !== 'cleanse') {
    actor.statuses.freeze--; emit({ source: actorId, target: actorId, type:'guard', text:actor.name+' · 冰冻，无法行动' });
  } else if (action === 'cleanse') {
    b.antidotes--; actor.statuses = {freeze:0,burn:0,confuse:0}; emit({source:actorId,target:actorId,type:'heal',text:'清平丸 · 解除异常'});
  } else if (actor.statuses.confuse && ['attack','skill','sweep'].includes(action)) {
    actor.statuses.confuse--; damage(actor, 8+b.level*2, actorId, actor.name+' · 混乱误伤');
  } else if(action==='item'){
    const index=Number(skillId),all=itemRecord(index).properties[2]===2,targets=all?actors:[actors.find(a=>a.id===allyTarget)||actor];let used=false;
    for(const victim of targets){const result=applyItem(victim,index);if(!result.ok){if(!all)return {...b,error:result.message};continue;}
      used=true;freeItem=result.free;if(result.escape)b.outcome='escaped';emit({source:actorId,target:victim.id,type:result.escape?'guard':'heal',text:result.message,amount:result.amount,manaAmount:result.manaAmount});}
    if(!used)return {...b,error:'没有可以使用这件药品的人物。'};b.itemCounts[index]--;
  } else if (action === 'potion') {
    b.potions--; const victim=actors.find(a=>a.id===allyTarget && a.hp>0)||actor; heal(victim,65,null,'金疮药');
  } else if (action === 'guard') {
    actor.guarding=true; actor.focus=!b.native;if(!b.native)actor.mp=Math.min(actor.maxMP,actor.mp+9);
    emit({source:actorId,target:actorId,type:'guard',text:actor.name+(b.native?' · 防御':' · 防御回气')});
  } else {
    let base=(actor.stats?Math.round((actor.stats.attackMin+actor.stats.attackMax)/2):actorId==='hero'?18+b.level*4+(b.attackBonus||0):12+b.level*3+(actor.attackBonus||0))+(actor.focus?12:0);
    if (actor.attackBuff>0) base*=1.3;
    actor.focus=false;
    const strike=(victim,power=1,move=null)=>b.native?nativeStrike(actor,victim,move):damage(victim,base*power-Math.round((victim.defense||b.level*2)*(victim.pierced?.8:1)),actorId,actor.name+' · '+(move?.name||'攻击'),move);
    if (action === 'attack') { if(!b.native)actor.mp=Math.min(actor.maxMP,actor.mp+3);actor.rage=Math.min(actor.stats?.rage||200,(actor.rage||0)+10); strike(selected); }
    else {
      actor.mp-=skill.cost;
      actor.rage=Math.max(0,(actor.rage||0)-(skill.rageCost||0));
      if(b.native){const record=characterRules.skills[skill.sourceIndex],e=record.effects;actor.hp=Math.min(actor.maxHP,Math.max(1,actor.hp+Math.trunc(actor.maxHP*e[1]/100)+e[0]));actor.mp=Math.min(actor.maxMP,Math.max(0,actor.mp+Math.trunc(actor.maxMP*e[3]/100)));}
      const targets=skill.targetCount==='all'?living():[selected,...living().filter(e=>e!==selected)].slice(0,skill.targetCount||1);
      const text=actor.name+' · '+skill.name;
      if(skill.effect==='restore'){
        for(const victim of actors.filter(a=>a.hp>0)){victim.mp=victim.maxMP;heal(victim,victim.maxHP,skill,text);}
      } else if (['heal','revive'].includes(skill.effect)) {
        const victim=actors.find(a=>a.id===allyTarget && (skill.effect==='revive'?a.hp<=0:a.hp>0)) || (skill.effect==='revive'?actors.find(a=>a.hp<=0):actor);
        heal(victim,victim.maxHP*(skill.healPercent||.3)+(b.native?characterRules.skills[skill.sourceIndex].stats[5]:0),skill,text);
      } else if (['attackBuff','defenseBuff'].includes(skill.effect)) {
        for (const victim of actors.filter(a=>a.hp>0)) { victim[skill.effect]=skill.turns||2;if(b.native)victim[skill.effect+'Percent']=(skill.effect==='attackBuff'?skill.attackPercent:skill.defensePercent)*100;emit({source:actorId,target:victim.id,type:'buff',skill,text}); }
      } else if (skill.effect==='pierce') {
        for (const victim of living()) { victim.pierced=b.native?skill.turns:2;if(b.native){victim.reductionChange=characterRules.skills[skill.sourceIndex].rates[1];strike(victim,skill.power,skill);}else emit({source:actorId,target:victim.id,type:'status',skill,text}); }
      } else if (['burn','freeze','confuse'].includes(skill.effect)) {
        for (const victim of targets) { if(b.native)strike(victim,skill.power,skill);else{victim[skill.effect]=skill.statusTurns?.[skill.effect]||(skill.effect==='burn'?2:1);emit({source:actorId,target:victim.id,type:'status',skill,text});} }
      } else {
        for (const victim of targets) strike(victim,skill.power||(skill.effect==='critical' && b.round%5===0?2:1),skill);
        if(!b.native&&skill.effect==='nativeAttack')for(const victim of targets)for(const [status,turns]of Object.entries(skill.statusTurns||{}))if(turns)victim[status]=turns;
        if(!b.native&&skill.effect==='drain') heal(actor,actor.maxHP*.2,skill,text);
      }
    }
  }
  if(!freeItem){
    b.spent.push(actorId);
    if(b.native)finishNativeAction(actor);
  }
  sync();
  if (!living().length) b.outcome='victory';
  if (!b.outcome && !availableActors(b).length) {
    for (const enemy of living()) {
      if (!actors.some(a=>a.hp>0)) break;
      if(enemy.hp<=0)continue;
      if(b.native&&nativeStatusTurn(enemy,b.enemies)){finishNativeAction(enemy);continue;}
      if(!b.native&&enemy.burn) { enemy.burn--;const n=b.native?Math.min(enemy.hp-1,Math.trunc(enemy.maxHP*.1)):Math.round(enemy.maxHP*.1);if(n>0)damage(enemy,n,'burn-enemy','灼烧');if(!enemy.hp)continue; }
      if(enemy.freeze) { enemy.freeze--;emit({source:enemy.id,target:enemy.id,type:'guard',text:enemy.name+' · 冰冻，无法行动'});continue; }
      if(enemy.confuse) { enemy.confuse--;damage(enemy,Math.round(enemy.attack*.5),enemy.id,enemy.name+' · 混乱误伤');continue; }
      if(b.native&&enemy.originalStats){
        const pool=actors.filter(a=>a.hp>0),victim=pool[Math.floor(Math.random()*pool.length)],index=Math.random()*100<(enemy.skillChance??20)?chooseMonsterSkill(enemy):null,move=index===null?null:decodedSkill(index),record=index===null?null:characterRules.skills[index];
        if(record){
          const before=enemy.hp;enemy.hp=Math.min(enemy.maxHP,Math.max(1,enemy.hp+Math.trunc(enemy.maxHP*record.effects[1]/100)+record.effects[0]));
          if(enemy.hp>before)emit({source:enemy.id,target:enemy.id,type:'heal',amount:enemy.hp-before,text:enemy.name+' · '+move.name,skill:move,casterEffect:true});
        }
        if(record&&record.b<=2){for(const ally of living()){const n=Math.min(ally.maxHP-ally.hp,Math.trunc(ally.maxHP*record.e/100)+record.stats[5]);ally.hp+=n;emit({source:enemy.id,target:ally.id,type:'heal',amount:n,text:enemy.name+' · '+move.name,skill:move});}}
        else {const count=move?.targetCount==='all'?pool.length:move?.targetCount||1;for(const target of [victim,...pool.filter(a=>a!==victim)].slice(0,count))nativeStrike(enemy,target,move);}
        finishNativeAction(enemy);
        continue;
      }
      if((b.round+enemy.id)%4===0 && b.round%3!==0) {emit({source:enemy.id,type:'guard',text:enemy.name+' · 整备'});continue;}
      const pool=actors.filter(a=>a.hp>0), victim=pool[(b.round-1+enemy.id)%pool.length];
      const hit=Math.max(1,Math.round(enemy.attack*(b.round%3===0?1.8:1)*(victim.guarding?.25:1)*(victim.defenseBuff?.8:1)*(victim.stats?1-Math.min(95,victim.stats.reduction)/100:1))-(victim.stats?0:victim.id==='hero'?b.defenseBonus||0:victim.defenseBonus||0));
      damage(victim,hit,enemy.id,enemy.name+' · '+(b.round%3===0?'蓄力重击':'攻击'));
      if(victim.hp>0 && enemy.status && b.round%4===0 && !victim.guarding) victim.statuses[enemy.status]=enemy.status==='freeze'?1:3;
    }
    for(const a of actors) {
      if(!b.native && a.hp>0 && a.statuses.burn) {a.statuses.burn--;const n=b.native?Math.min(a.hp-1,Math.trunc(a.maxHP*.1)):Math.ceil(a.maxHP*.1);if(n>0)damage(a,n,'burn',a.name+' · 灼烧');}
      a.guarding=false;for(const buff of ['attackBuff','defenseBuff']) if(a[buff]&&! --a[buff])a[buff+'Percent']=0;
      if(a.reductionTurns&&! --a.reductionTurns)a.reductionChange=0;
    }
    for(const e of b.enemies) {
      if(e.pierced)e.pierced--;
      if(e.reductionTurns&&! --e.reductionTurns)e.reductionChange=0;
    }
    b.spent=[]; b.round++;
  }
  sync();
  if(!actors.some(a=>a.hp>0)) b.outcome='defeat';
  else if(!living().length) b.outcome='victory';
  b.activeActor=(freeItem&&availableActors(b).find(a=>a.id===actorId)||availableActors(b)[0])?.id||null;
  return b;
}
