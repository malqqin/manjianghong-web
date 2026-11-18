// Presentation opcodes from u.java, using original 80ms scene tracks.
const VISUAL_ACTIONS=new Set([15,16,17,18,19,20,21,22,54]);
// Instructions carry byte lengths; read their structure without executing game
// conditions or touching the web save. This recovers adjacent scene transitions.
export function programInstructions(code) {
  const condition=p=>{
    const kind=code[p++];if(kind===0)return p+5;
    const count=code[p++];for(let i=0;i<count;i++)p=condition(p);return p;
  };
  const block=(p,count)=>{
    const result=[];
    for(let i=0;i<count;i++){
      const end=p+1+(code[p]>>1),action=code[p+1],args=code.slice(p+2,end),item={action,args};
      if(!(end>p&&end<=code.length))throw new Error('Invalid original instruction length');
      if(action===4){
        let q=condition(p+3);const first=block(q+2,code[q+1]);q=first.end;
        const second=block(q+2,code[q+1]);item.branches=[first.items,second.items];
        if(second.end!==end)throw new Error('Invalid original conditional block');
      }
      result.push(item);p=end;
    }
    return {items:result,end:p};
  };
  const start=condition(0),result=block(start+1,code[start]);
  if(result.end!==code.length)throw new Error('Incomplete original program');
  return result.items;
}
export function groupTransitions(scene,group) {
  const blocking=new Set([4,11,12,13,14,15,24,25,34,41,54]);
  const effects=items=>items.filter(i=>[18,19,20,21,22].includes(i.action)&&i.args[0]===0).map(i=>({action:i.action,parameter:i.args[1]}));
  const find=items=>{
    for(let i=0;i<items.length;i++){
      const item=items[i];
      if(item.action===11&&item.args[2]===0&&item.args[3]===group){
        let a=i-1,b=i+1;while(a>=0&&!blocking.has(items[a].action))a--;while(b<items.length&&!blocking.has(items[b].action))b++;
        return {before:effects(items.slice(a+1,i)),after:effects(items.slice(i+1,b))};
      }
      for(const branch of item.branches||[]){const result=find(branch);if(result)return result;}
    }
    return null;
  };
  for(const program of scene.programs||[]){const result=find(programInstructions(program.code));if(result)return result;}
  return {before:[],after:[]};
}
export function trackKeys(track) {
  const keys=[];
  for(let p=1;p<track.length;p+=7) {
    const [tick,x,y,animation,action,parameter,string]=track.slice(p,p+7);
    keys.push({tick,x,y,animation,action,parameter,string});
  }
  return keys;
}
export function sampleTrack(track,tick) {
  const keys=trackKeys(track);let current=keys[0],next;
  for(const key of keys) {if(key.tick>tick){next=key;break;}current=key;}
  const progress=next?Math.max(0,Math.min(1,(tick-current.tick)/(next.tick-current.tick))):0;
  return {...current,x:current.x+(next?next.x-current.x:0)*progress,y:current.y+(next?next.y-current.y:0)*progress,
    visible:!(current.animation&0xc000),mirror:!!(current.animation&0x2000),flipY:!!(current.animation&0x1000),
    pose:current.animation&255,elapsed:Math.max(0,tick-current.tick)*80};
}
export function compileStory(lines,data,offset=0) {
  const groups=[];
  lines.forEach((line,index)=>{
    const source=line.source,key=source?.group==null?null:source.scene+':'+source.group;
    if(!key){groups.push({lines:[{line,index}]});return;}
    let group=groups.at(-1);if(group?.key!==key){group={key,scene:source.scene,group:source.group,lines:[]};groups.push(group);}
    group.lines.push({line,index});
  });
  const result=[];
  for(const block of groups) {
    const scene=data.scenes[block.scene],tracks=scene?.groups[block.group];
    if(!tracks){for(const {line,index} of block.lines)if(index>=offset)result.push({kind:line.action===15?'effect':line.action===14?'caption':'dialogue',action:line.action,line,text:line.text,parameter:line.parameter,index,checkpoint:index+1});continue;}
    const boundary=groupTransitions(scene,block.group);
    if(offset<=block.lines[0].index)for(const effect of boundary.before)result.push({...effect,scene:block.scene,group:block.group,tick:0,kind:'effect',checkpoint:block.lines[0].index,program:true});
    const rows=tracks.flatMap((track,order)=>trackKeys(track).map(key=>({...key,track:track[0],order}))).sort((a,b)=>a.tick-b.tick||a.order-b.order);
    let checkpoint=block.lines[0].index;
    const used=new Set();
    for(const row of rows) {
      const common={scene:block.scene,group:block.group,tick:row.tick,track:row.track,parameter:row.parameter,checkpoint};
      if([13,14].includes(row.action)) {
        const item=block.lines.find(({line,index})=>!used.has(index)&&line.source.string===row.string);
        if(!item)continue;used.add(item.index);checkpoint=item.index+1;
        if(item.index>=offset)result.push({...common,kind:row.action===13?'dialogue':'caption',line:item.line,index:item.index,checkpoint,portraitActor:row.parameter});
      }else if(VISUAL_ACTIONS.has(row.action)&&checkpoint>=offset){
        result.push({...common,kind:'effect',action:row.action,text:scene.strings[row.string],checkpoint});
      }
    }
    for(const {line,index} of block.lines)if(!used.has(index)&&index>=offset)result.push({kind:'dialogue',line,index,checkpoint:index+1});
    // Finish the native actors' final motion before restoring exploration.
    if(checkpoint>=offset){
      const tail={scene:block.scene,group:block.group,tick:Math.max(...trackKeys(tracks[0]).map(k=>k.tick)),checkpoint};
      result.push({...tail,kind:'tail'});
      for(const effect of boundary.after)result.push({...effect,...tail,kind:'effect',program:true});
    }
  }
  return result;
}
export function compileGroup(data,sceneKey,group){
 const scene=data.scenes[sceneKey],tracks=scene?.groups[group];if(!tracks)return [];
 const rows=tracks.flatMap((track,order)=>trackKeys(track).map(key=>({...key,track:track[0],order}))).sort((a,b)=>a.tick-b.tick||a.order-b.order);
 const events=rows.filter(row=>[13,14].includes(row.action)||VISUAL_ACTIONS.has(row.action)).map(row=>({scene:sceneKey,group,tick:row.tick,track:row.track,parameter:row.parameter,checkpoint:0,
  kind:row.action===13?'dialogue':row.action===14?'caption':'effect',action:row.action,text:scene.strings[row.string],line:{text:scene.strings[row.string]},portraitActor:row.parameter}));
 events.push({scene:sceneKey,group,tick:Math.max(0,...trackKeys(tracks[0]).map(k=>k.tick)),kind:'tail',checkpoint:0});
 return events;
}
export function layoutPoem(text,vertical=true,columns=7,rows=7) {
  const pages=[[]];let x=vertical?columns-1:0,y=0,color='#111111';
  const nextPage=()=>{pages.push([]);x=vertical?columns-1:0;y=0;};
  for(let i=0;i<text.length;i++) {
    if(text[i]==='#'&&/^[a-f0-9]{6}$/i.test(text.slice(i+1,i+7))){color='#'+text.slice(i+1,i+7);i+=6;continue;}
    if(text[i]==='|'||text[i]==='\n'){if(vertical){x--;y=0;}else{x=0;y++;}continue;}
    if(vertical&&y>=rows){x--;y=0;}if(!vertical&&x>=columns){x=0;y++;}
    if(x<0||y>=rows)nextPage();
    pages.at(-1).push({char:text[i],x,y,color});
    if(vertical)y++;else x++;
  }
  return pages.filter(page=>page.length);
}
export function dialoguePages(text,columns=18,rows=2) {
  const pages=[];let page='',line='',lineCount=0;
  const flush=()=>{if(page)pages.push(page);page='';line='';lineCount=0;};
  for(const char of text.replace(/#[0-9a-f]{6}/gi,'').replaceAll('|','\n')) {
    if(char==='\n'||line.length>=columns) {
      lineCount++;if(lineCount>=rows)flush();else{page+='\n';line='';}
      if(char==='\n')continue;
    }
    page+=char;line+=char;
  }
  flush();return pages.length?pages:[''];
}
