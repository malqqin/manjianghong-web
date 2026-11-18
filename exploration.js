import { programInstructions } from './story-presentation.js';
export function readCondition(code,start=0) {
  let p=start;const kind=code[p++];
  if(kind===0){const left=code.slice(p,p+2),op=code[p+2],right=code.slice(p+3,p+5);return {node:{kind,left,op,right},end:p+5};}
  const count=code[p++],children=[];for(let i=0;i<count;i++){const c=readCondition(code,p);children.push(c.node);p=c.end;}
  return {node:{kind,children},end:p};
}
export function conditionAtoms(node){return node.kind===0?[node]:(node.children||[]).flatMap(conditionAtoms);}
export function evaluateCondition(node,variables={},system={}) {
  const operand=([kind,n])=>kind===2?(variables[n]||0):kind===1?(system[n]||0):n;
  if(node.kind!==0)return node.kind===1?node.children.every(c=>evaluateCondition(c,variables,system)):node.children.some(c=>evaluateCondition(c,variables,system));
  const a=operand(node.left),b=operand(node.right);return [()=>a===b,()=>a!==b,()=>a<b,()=>a>b,()=>a<=b,()=>a>=b][node.op]?.()||false;
}
export function scenePortals(data,key) {
  const scene=data.scenes[key];if(!scene)return [];
  const sceneKeys=Object.keys(data.scenes),result=[];
  for(const [program,p]of scene.programs.entries()){
    const condition=readCondition(p.code).node,atoms=conditionAtoms(condition);
    const atom=atoms.find(a=>a.op===0&&a.left[0]===1&&a.left[1]===2&&a.right[0]===0);
    if(!atom)continue;
    const actorIndex=atom.right[1],actor=scene.actors[actorIndex];if(!actor)continue;
    for(const instruction of programInstructions(p.code).filter(i=>i.action===12)){
      const a=instruction.args;if(a[0]!==0||a[2]!==0||a[4]!==0)continue;
      const toScene=sceneKeys[a[1]],to=data.scenes[toScene];if(!to||to.map===36)continue;
      result.push({id:`exit-${key}-${program}`,kind:'portal',scene:key,actorIndex,program,condition,toScene,to:to.map,name:to.name,
        markerX:actor.x,markerY:actor.y,x:(actor.x-8)/16,y:(actor.y-8)/16,spawn:a[3]<0||a[5]<0?null:[(a[3]-8)/16,(a[5]-8)/16],markerAnimation:actor.animation,markerSprite:actor.sprite});
    }
  }
  return result;
}
export function routeExit(graph,from,to) {
  if(from===to)return null;const queue=[{key:from,first:null}],visited=new Set([from]);
  for(const node of queue)for(const exit of graph[node.key]||[]){if(visited.has(exit.toScene))continue;const first=node.first||exit;if(exit.toScene===to)return first;visited.add(exit.toScene);queue.push({key:exit.toScene,first});}
  return null;
}

// l.java.h: the first extra is the respawn flag; the rest are enemy-team IDs.
export function sceneEncounters(data,key,actors=data.scenes[key]?.actors) {
 const scene=data.scenes[key];
 return (actors||[]).flatMap((actor,index)=>actor.sprite===17&&(actor.flags&4)&&actor.extra.length>1?[{
  id:`native-wind-${key}-${index}`,kind:'encounter',contact:true,map:scene.map,scene:key,
  x:(actor.x-8)/16,y:(actor.y-8)/16,sprite:17,windVariant:actor.animation,
  name:actor.animation===2?'异色旋风':'游荡敌群',teams:actor.extra.slice(1),respawn:actor.extra[0]===1,detectionBounds:actor.bounds.slice(4)
 }]:[]);
}
export const ENCOUNTER_RESPAWN_MS = 200 * 80;
// l.java.h only ticks while the map simulation runs.
export function encounterAvailable(entity,cleared={},now=0) {
 const time=cleared[entity.id];
 return time==null||entity.respawn&&now-time>=ENCOUNTER_RESPAWN_MS;
}
