import { programInstructions, trackKeys } from './story-presentation.js';
import { readCondition, conditionAtoms, evaluateCondition } from './exploration.js';

const flatten=rows=>rows.flatMap(i=>[i,...(i.branches||[]).flatMap(flatten)]);
const LAYOUT_ACTIONS=new Set([0,1,2,3,4,7,8,10,49]);
// Apply non-dialogue entry programs without firing cutscenes while drawing a map.
export function sceneActorLayout(data,key,variables={},overrides={}){
 const scene=data.scenes[key],actors=(scene?.actors||[]).map(a=>({...a})),v={...variables};
 const apply=rows=>{for(const i of rows){const a=i.args,value=p=>a[p]===2?(v[a[p+1]]||0):a[p]===1?0:a[p+1],actor=actors[value(0)];
  if(i.action===4){apply(i.branches[evaluateCondition(readCondition(a,1).node,v)?0:1]);continue;}
  if(i.action===1&&a[0]===2)v[a[1]]=value(2);
  if(i.action===7&&actor)Object.assign(actor,{animation:value(2),x:value(4),y:value(6),flags:actor.flags|12});
  if(i.action===8&&actor)Object.assign(actor,{animation:value(2),flags:actor.flags|12});
  if(i.action===10&&actor)actor.flags&=~4;
  if(i.action===49)for(const a of actors)if(a.flags&0x100)a.flags&=~4;
 }};
 for(const p of scene?.programs||[]){const rows=programInstructions(p.code);if(p.conditions.includes(0)&&flatten(rows).every(i=>LAYOUT_ACTIONS.has(i.action))&&evaluateCondition(readCondition(p.code).node,v))apply(rows);}
 return actors.map((a,i)=>({...a,...overrides[i]}));
}
export function storyStage(data,steps,index){
 const current=steps[Math.min(index,steps.length-1)];
 for(let n=Math.min(index,steps.length-1);n>=0;n--){
  const step=steps[n],scene=data.scenes[step.scene],groups=new Set(step.lines.map(l=>l.source?.group).filter(g=>g!=null));
  const candidates=scene.programs.map(p=>({condition:readCondition(p.code).node,items:flatten(programInstructions(p.code))})).filter(p=>p.items.some(i=>i.action===11&&groups.has(i.args[3])));
  if(n===index){const atom=candidates.flatMap(p=>conditionAtoms(p.condition)).find(a=>a.left[0]===2&&a.left[1]===0&&a.op===0&&a.right[0]===0);if(atom)return atom.right[1];}
  if(n<index){const set=candidates.flatMap(p=>p.items).filter(i=>i.action===1&&i.args[0]===2&&i.args[1]===0&&i.args[2]===0).at(-1);if(set)return set.args[3];}
 }
 return current?1:0;
}
// ss21 programs 5–7: three checkpoints before the Li Yucheng confrontation.
export function mainCheckpoint(index,stage){return index===63&&stage>=52&&stage<=54?{scene:'ss21',actorIndex:29+stage-52,stage}:null;}
export function scenePrograms(data,sceneKey,actorIndex,variables,steps,event=null){
 const scene=data.scenes[sceneKey];if(!scene)return [];
 const mainGroups=new Set(steps.filter(s=>s.scene===sceneKey).flatMap(s=>[...s.lines,...(s.afterLines||[])].map(l=>l.source?.group).filter(g=>g!=null)));
 return scene.programs.map((p,index)=>({index,events:p.conditions,condition:readCondition(p.code).node,items:programInstructions(p.code)})).filter(p=>{
   const atoms=conditionAtoms(p.condition),matches=atoms.some(a=>a.left[0]===1&&a.left[1]===2&&a.op===0&&a.right[1]===actorIndex);
   if(!matches||!p.events.some(e=>event===null?(e===4||e===5):e===event)||flatten(p.items).some(i=>i.action===11&&mainGroups.has(i.args[3])))return false;
   const system={1:scene.actors[actorIndex].sprite,2:actorIndex,15:1};
   return p.events.some(e=>(e===4||e===5)&&(event===null||e===event)&&evaluateCondition(p.condition,variables,{...system,0:e}));
 });
}
// l.java g(): invisible actors can trigger from either of two rectangles.
export function nativeContactRects(actor,events){
 return events.flatMap(event=>{
  const [left,top,right,bottom]=actor.bounds.slice(event===4?0:4,event===4?4:8);
  if(right<=left||bottom<=top)return [];
  return [{event,x:actor.x+left,y:actor.y+top,width:right-left,height:bottom-top}];
 });
}
export function nativeGroupLines(data,key,group){
 const scene=data.scenes[key],tracks=scene.groups[group];if(!tracks)return [];
 return tracks.flatMap((track,order)=>trackKeys(track).map(k=>({...k,order}))).filter(k=>[13,14].includes(k.action)).sort((a,b)=>a.tick-b.tick||a.order-b.order).map(k=>({text:scene.strings[k.string],source:{scene:key,group,string:k.string}}));
}
// This interpreter follows u.java. All UI and persistent mutations are explicit adapters.
export async function executeNative(items,context){
 const {variables:v,system={},handlers:h}=context,operand=([kind,n])=>kind===2?(v[n]||0):kind===1?(system[n]||0):n;
 for(const item of items){
  const a=item.args,value=p=>operand(a.slice(p,p+2)),set=(p,n)=>{if(a[p]===2)v[a[p+1]]=n;};
  switch(item.action){
   case 0:break;
   case 1:set(0,value(2));break;
   case 2:set(0,value(2)+Math.floor(Math.random()*(value(4)-value(2)+1)));break;
   case 3:{const x=value(2),y=value(6),op=value(4);set(0,[()=>x+y,()=>x-y,()=>x*y,()=>y?Math.trunc(x/y):0][op]?.()||0);break;}
   case 4:await executeNative(item.branches[evaluateCondition(readCondition(a,1).node,v,system)?0:1],context);break;
   case 5:case 6:case 7:case 8:case 9:case 10:await h.actor?.(item.action,value(0),value(2),value(4),value(6));break;
   case 11:await h.group(value(2));break;
   case 12:await h.travel(value(0),value(2),value(4));context.stopped=true;return;
   case 13:case 14:case 15:await h.dialogue(value(2),item.action,value(0));break;
   case 16:case 17:case 18:case 19:case 20:case 21:case 22:await h.effect?.(item.action,value(0),value(2));break;
   case 23:context.stopped=true;return;
   case 24:set(0,await h.choice([value(4),value(6)]));break;
   case 25:set(0,await h.confirm(value(2))?1:0);break;
   case 26:break;
   case 29:case 30:await h.dialogue(value(0));break;
   case 34:await h.gameOver?.(value(0));context.stopped=true;return;
   case 35:set(0,h.inventory(value(2),value(4))>=value(6)?1:0);break;
   case 36:await h.grant(value(0),value(2),value(4));break;
   case 37:h.remove(value(0),value(2));break;
   case 38:h.experience(value(0),value(2));break;
   case 39:set(0,h.teach(value(2),value(4)));break;
   case 41:set(0,await h.battle(value(2))?1:0);break;
   case 42:break;
   case 43:h.journal(value(0));break;
   case 44:h.rest();break;
   case 45:case 46:h.party(value(0),item.action===45);break;
   case 47:case 48:set(0,await h.learn(item.action===47?'lockpick':'advancedFlight')?1:0);break;
   case 49:await h.actor?.(49);break;
   case 50:set(0,h.money(value(2))?1:0);break;
   case 51:await h.shop(value(0),value(2));break;
   case 52:set(0,await h.confirm(value(2))?1:0);break;
   case 53:await h.document(value(0));break;
   case 54:await h.cg(value(0),value(2));break;
   case 55:case 56:break;
   case 57:set(0,await h.challenge(value(2),value(4))?1:0);break;
   default:throw new Error('Unsupported native event '+item.action);
  }
  if(context.stopped)return;
 }
}
