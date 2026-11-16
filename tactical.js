import { nativeSkill, partyNames } from './skills.js';

export const partyActors = battle => [{ id: 'hero', name: partyNames.hero, hp: battle.hp, maxHP: battle.maxHP,
  mp: battle.mp, maxMP: battle.maxMP, statuses: battle.statuses, focus: battle.focus,
  guarding: battle.guarding, attackBuff: battle.attackBuff, defenseBuff: battle.defenseBuff }, ...battle.companions];
export const availableActors = battle => partyActors(battle).filter(a => a.hp > 0 && !battle.spent.includes(a.id));

// A command resolves only the selected actor. Uncommanded allies wait for player input.
export function tacticalTurn(current, action, target, skillId, actorId = current.activeActor, allyTarget = actorId) {
  const b = structuredClone(current); b.events = [];
  if (b.outcome) return b;
  const actors = partyActors(b), actor = actors.find(a => a.id === actorId);
  if (!actor || actor.hp <= 0 || b.spent.includes(actorId)) return { ...b, error: '这名队员本回合已行动或已倒下。' };
  if (!['attack', 'skill', 'sweep', 'guard', 'potion', 'cleanse'].includes(action)) return { ...b, error: '未知指令' };
  const skill = nativeSkill(actorId, action === 'sweep' ? 'wildfire' : skillId);
  if (['skill','sweep'].includes(action) && actor.mp < skill.cost) return { ...b, error: '精气不足，可普攻或防御回气。' };
  if (action === 'potion' && !b.potions) return { ...b, error: '没有金疮药了。' };
  if (action === 'cleanse' && !b.antidotes) return { ...b, error: '没有清平丸了。' };
  if (action === 'skill' && skill.effect === 'revive' && !actors.some(a => a.hp <= 0)) return { ...b, error: '没有倒下的队友。' };
  const sync = () => { const hero = actors[0]; Object.assign(b, { hp: hero.hp, mp: hero.mp, statuses: { ...hero.statuses }, focus: hero.focus,
    guarding: hero.guarding, attackBuff: hero.attackBuff, defenseBuff: hero.defenseBuff }); };
  const emit = event => { sync(); b.events.push({ ...event, action, state: { hp: b.hp, mp: b.mp, potions: b.potions, focus: b.focus,
    statuses: { ...b.statuses }, attackBuff: b.attackBuff, defenseBuff: b.defenseBuff, antidotes: b.antidotes, companions: b.companions.map(a => structuredClone(a)),
    enemies: b.enemies.map(e => structuredClone(e)) } }); };
  const damage = (victim, amount, source, text, move = null) => {
    const dealt = Math.min(victim.hp, Math.max(1, Math.round(amount))); victim.hp -= dealt;
    emit({ source, target: victim.id, amount: dealt, text, type: 'damage', defeated: victim.hp <= 0, skill: move });
  };
  const living = () => b.enemies.filter(e => e.hp > 0);
  const selected = living().find(e => e.id === target) || living()[0];
  const heal = (victim, amount, move, text) => {
    const value = Math.min(victim.maxHP - victim.hp, Math.round(amount)); victim.hp += value;
    emit({ source: actorId, target: victim.id, amount: value, type: 'heal', skill: move, text });
  };
  actor.statuses ||= { freeze:0, burn:0, confuse:0 };
  const held = actor.statuses.freeze > 0;
  if (held && action !== 'cleanse') {
    actor.statuses.freeze--; emit({ source: actorId, target: actorId, type:'guard', text:actor.name+' · 冰冻，无法行动' });
  } else if (action === 'cleanse') {
    b.antidotes--; actor.statuses = {freeze:0,burn:0,confuse:0}; emit({source:actorId,target:actorId,type:'heal',text:'清平丸 · 解除异常'});
  } else if (actor.statuses.confuse && ['attack','skill','sweep'].includes(action)) {
    actor.statuses.confuse--; damage(actor, 8+b.level*2, actorId, actor.name+' · 混乱误伤');
  } else if (action === 'potion') {
    b.potions--; const victim=actors.find(a=>a.id===allyTarget && a.hp>0)||actor; heal(victim,65,null,'金疮药');
  } else if (action === 'guard') {
    actor.guarding=true; actor.focus=true; actor.mp=Math.min(actor.maxMP,actor.mp+9);
    emit({source:actorId,target:actorId,type:'guard',text:actor.name+' · 防御回气'});
  } else {
    let base=(actorId==='hero'?18+b.level*4+(b.attackBonus||0):12+b.level*3)+(actor.focus?12:0);
    if (actor.attackBuff>0) base*=1.3;
    actor.focus=false;
    const strike=(victim,power=1,move=null)=>damage(victim,base*power-Math.round((victim.defense||b.level*2)*(victim.pierced?.8:1)),actorId,actor.name+' · '+(move?.name||'攻击'),move);
    if (action === 'attack') { actor.mp=Math.min(actor.maxMP,actor.mp+3); strike(selected); }
    else {
      actor.mp-=skill.cost;
      const targets=skill.targetCount==='all'?living():[selected,...living().filter(e=>e!==selected)].slice(0,skill.targetCount||1);
      const text=actor.name+' · '+skill.name;
      if (['heal','revive'].includes(skill.effect)) {
        const victim=actors.find(a=>a.id===allyTarget && (skill.effect==='revive'?a.hp<=0:a.hp>0)) || (skill.effect==='revive'?actors.find(a=>a.hp<=0):actor);
        heal(victim,victim.maxHP*.3,skill,text);
      } else if (['attackBuff','defenseBuff'].includes(skill.effect)) {
        for (const victim of actors.filter(a=>a.hp>0)) { victim[skill.effect]=2; emit({source:actorId,target:victim.id,type:'buff',skill,text}); }
      } else if (skill.effect==='pierce') {
        for (const victim of living()) { victim.pierced=2; emit({source:actorId,target:victim.id,type:'status',skill,text}); }
      } else if (['burn','freeze','confuse'].includes(skill.effect)) {
        for (const victim of targets) { victim[skill.effect]=skill.effect==='burn'?2:1; emit({source:actorId,target:victim.id,type:'status',skill,text}); }
      } else {
        for (const victim of targets) strike(victim,skill.power||(skill.effect==='critical' && b.round%5===0?2:1),skill);
        if(skill.effect==='drain') heal(actor,actor.maxHP*.2,skill,text);
      }
    }
  }
  b.spent.push(actorId); sync();
  if (!living().length) b.outcome='victory';
  if (!b.outcome && !availableActors(b).length) {
    for (const enemy of living()) {
      if (!actors.some(a=>a.hp>0)) break;
      if(enemy.burn) { enemy.burn--; damage(enemy,Math.round(enemy.maxHP*.1),'burn-enemy','灼烧'); if(!enemy.hp) continue; }
      if(enemy.freeze) { enemy.freeze--;emit({source:enemy.id,target:enemy.id,type:'guard',text:enemy.name+' · 冰冻，无法行动'});continue; }
      if(enemy.confuse) { enemy.confuse--;damage(enemy,Math.round(enemy.attack*.5),enemy.id,enemy.name+' · 混乱误伤');continue; }
      if((b.round+enemy.id)%4===0 && b.round%3!==0) {emit({source:enemy.id,type:'guard',text:enemy.name+' · 整备'});continue;}
      const pool=actors.filter(a=>a.hp>0), victim=pool[(b.round-1+enemy.id)%pool.length];
      const hit=Math.max(1,Math.round(enemy.attack*(b.round%3===0?1.8:1)*(victim.guarding?.25:1)*(victim.defenseBuff?.8:1))-(b.defenseBonus||0));
      damage(victim,hit,enemy.id,enemy.name+' · '+(b.round%3===0?'蓄力重击':'攻击'));
      if(victim.hp>0 && enemy.status && b.round%4===0 && !victim.guarding) victim.statuses[enemy.status]=enemy.status==='freeze'?1:3;
    }
    for(const a of actors) {
      if(a.hp>0 && a.statuses.burn) {a.statuses.burn--;damage(a,Math.ceil(a.maxHP*.1),'burn',a.name+' · 灼烧');}
      a.guarding=false;for(const buff of ['attackBuff','defenseBuff']) if(a[buff]) a[buff]--;
    }
    for(const e of b.enemies) if(e.pierced) e.pierced--;
    b.spent=[]; b.round++;
  }
  sync();
  if(!actors.some(a=>a.hp>0)) b.outcome='defeat';
  else if(!living().length) b.outcome='victory';
  b.activeActor=availableActors(b)[0]?.id||null;
  return b;
}
