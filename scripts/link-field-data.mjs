import fs from 'node:fs/promises';
const data=JSON.parse(await fs.readFile(new URL('../assets/native-story.json',import.meta.url),'utf8'));
const fields=Object.fromEntries(Object.entries(data.scenes).map(([key,scene])=>[key,{map:scene.map,
 normal:[...new Set(scene.actors.filter(a=>a.sprite===17&&a.animation===0).flatMap(a=>a.extra.slice(1)))],
 rare:[...new Set(scene.actors.filter(a=>a.sprite===17&&a.animation===2).flatMap(a=>a.extra.slice(1)))],
 chests:scene.actors.filter(a=>[39,40].includes(a.sprite)&&a.extra[0]===0&&a.extra[1]>0).map((a,index)=>({index,x:a.x/16,y:a.y/16,sprite:a.sprite,arm:a.extra[1],locked:!!a.extra[2]}))}]));
await fs.writeFile(new URL('../original-field.js',import.meta.url),'// Original scene actor extras: l.java selects one enemy-team ID after the respawn flag.\nexport const originalFields = '+JSON.stringify(fields)+';\n');
console.log('Linked field teams and equipment chests from 43 original scenes.');
