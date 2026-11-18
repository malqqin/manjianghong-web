import fs from 'node:fs/promises';
import{trackKeys}from'../story-presentation.js';
const root=new URL('../',import.meta.url),file=new URL('assets/original-story.json',root);
const story=JSON.parse(await fs.readFile(file)),native=JSON.parse(await fs.readFile(new URL('assets/native-story.json',root)));
const original=story.steps.flatMap(s=>[...s.lines,...(s.afterLines||[])]).filter(l=>l.source?.scene==='s6');
const linesFor=group=>native.scenes.s6.groups[group].flatMap((track,order)=>trackKeys(track).map(k=>({...k,order}))).filter(k=>[13,14].includes(k.action)).sort((a,b)=>a.tick-b.tick||a.order-b.order).map(k=>original.find(l=>l.source?.group===group&&l.source.string===k.string)||{who:'story',text:native.scenes.s6.strings[k.string],source:{scene:'s6',group,string:k.string}});
// s6 programs 1 and 2 are guarded by global stage 18 and 49. They must not
// appear immediately after the stage-9 interrogation (the former web slot 11).
for(const [index,group]of [[23,1],[61,2]]){
 const step=story.steps[index];step.afterLines=(step.afterLines||[]).filter(l=>l.source?.scene!=='s6'||l.source.group!==group);step.afterLines.push(...linesFor(group));
}
Object.assign(story.steps[11],{title:'转入牢帐',kind:'travel',lines:[],superseded:true});
await fs.writeFile(file,JSON.stringify(story,null,2)+'\n');
console.log('Moved original s6 group1 to stage18 and group2 to stage49; preserved saved step IDs.');
