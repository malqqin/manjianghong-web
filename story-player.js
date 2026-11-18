import {compileStory,sampleTrack,layoutPoem,dialoguePages} from './story-presentation.js';
import {animationFrame} from './presentation.js';
import {drawNativeFrame} from './native-effects.js';
import {viewportZoom} from './locomotion.js';
const $=s=>document.querySelector(s);
export class NativeStoryPlayer {
  constructor(data,images,loadMap,reducedMotion){Object.assign(this,{data,images,loadMap,reducedMotion,running:false,stage:null});this.serial=0;}
  async run(lines,{offset=0,checkpoint=()=>{},complete=()=>{},events=null}={}) {
    if(this.running)return;
    this.running=true;this.skipping=false;this.serial++;this.checkpoint=checkpoint;
    $('#app').classList.add('native-story','dialogue-open');
    try {
      this.events=events||compileStory(lines,this.data,offset);
      for(const event of this.events) {
        if(this.skipping)break;
        if(event.scene) {
          if(this.stage?.key!==event.scene+':'+event.group)await this.startGroup(event);
          await this.travel(event.tick);
        }
        if(this.skipping)break;
        if(event.kind==='dialogue')await this.dialogue(event);
        if(event.kind==='caption')await this.caption(event);
        if(event.kind==='effect')await this.effect(event);
        checkpoint(event.checkpoint);
      }
    }finally {
      this.running=false;this.stage=null;this.screenAction=null;this.waiter=null;this.typing=null;this.black=0;this.weather=0;
      for(const id of ['dialogue','native-caption','native-poem','native-cg','native-screen'])$('#'+id).classList.add('hidden');
      $('#native-flash').classList.remove('show');$('.stage').classList.remove('native-shake');
      $('#native-fade').style.opacity=0;$('#native-fade').classList.remove('holding');
      $('#app').classList.remove('native-story','dialogue-open','cinema-bars');
    }
    complete();
  }
  async startGroup(event) {
    $('#dialogue').classList.add('hidden');
    const scene=this.data.scenes[event.scene];await this.loadMap(scene.map);
    if(this.skipping)return;
    this.stage={key:event.scene+':'+event.group,scene,tracks:scene.groups[event.group],tick:0};
    await this.pause(380,false);
  }
  pause(ms,advanceable=true) {
    if(this.skipping)return Promise.resolve();
    return new Promise(resolve=>{
      let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(this.waiter===finish)this.waiter=null;resolve();};
      const timer=setTimeout(finish,ms);this.cancelWait=finish;if(advanceable)this.waiter=finish;
    });
  }
  advance(){if(this.typing){this.typing();return;}this.waiter?.();}
  cancel(){this.skipping=true;this.typing?.();this.cancelWait?.();this.waiter?.();}
  async travel(tick) {
    if(!this.stage)return;
    const from=this.stage.tick,start=performance.now(),duration=Math.max(0,(tick-from)*80);
    if(duration===0){this.stage.tick=tick;return;}
    await new Promise(resolve=>{
      const frame=now=>{if(this.skipping){resolve();return;}const p=Math.min(1,(now-start)/duration);this.stage.tick=from+(tick-from)*p;if(p<1)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);
    });
  }
  portrait(event) {
    if(!this.stage||event.portraitActor==null)return null;
    const actor=this.stage.scene.actors[event.portraitActor];
    if(!actor)return null;const meta=this.data.sprites[actor.sprite];
    if(!meta||!meta.source.includes('touxiang'))return null;
    return {source:meta.source,right:!!(actor.flags&1)};
  }
  async dialogue(event) {
    const c=event.line,box=$('#dialogue'),portrait=this.portrait(event);
    box.classList.remove('hidden','narration');box.classList.toggle('portrait-right',!!portrait?.right);
    const fallback=!event.scene&&c.portrait;
    $('#dialogue-portrait-frame').classList.toggle('hidden',!portrait&&!fallback);
    const image=$('#dialogue-portrait');if(portrait){image.src='assets/'+portrait.source;image.alt=c.speaker||'';}
    else if(fallback){image.src='assets/'+fallback;image.alt=c.speaker||'';}
    $('#dialogue-name').textContent=c.speaker||'';$('#dialogue-role').textContent='';
    $('#dialogue-next').classList.remove('hidden');$('#dialogue-choices').replaceChildren();
    box.style.setProperty('--dialogue-columns',1);
    const width=box.clientWidth-26,font=parseFloat(getComputedStyle($('#dialogue-text')).fontSize);
    const columns=Math.max(10,Math.floor(width/(font+.5)));
    box.style.setProperty('--dialogue-columns',columns);
    const pages=dialoguePages(c.text,columns,2);
    for(let i=0;i<pages.length&&!this.skipping;i++) {
      $('#dialogue-count').textContent=`${i+1}/${pages.length}`;
      await this.reveal($('#dialogue-text'),pages[i],80);
      if(!this.skipping)await this.pause(24*60*60*1000);
    }
    box.classList.add('hidden');
  }
  async reveal(element,text,interval) {
    element.replaceChildren();
    const chars=Array.from(text,char=>{const span=document.createElement('span');span.textContent=char;span.style.visibility='hidden';element.append(span);return span;});
    let finished=false;
    await new Promise(resolve=>{
      const finish=()=>{if(finished)return;finished=true;chars.forEach(c=>c.style.visibility='visible');this.typing=null;resolve();};
      this.typing=finish;const start=performance.now();
      const frame=now=>{if(finished)return;if(this.skipping){finish();return;}const count=Math.floor((now-start)/interval)+1;chars.slice(0,count).forEach(c=>c.style.visibility='visible');if(count>=chars.length){finish();return;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
  }
  async caption(event) {
    const box=$('#native-caption');box.textContent=event.line.text;box.classList.remove('hidden');
    await this.pause(Math.max(800,Math.min(4000,event.parameter*80||1600)));box.classList.add('hidden');
  }
  async fade(black,hold=0) {
    const layer=$('#native-fade');layer.style.transitionDuration=this.reducedMotion()?'0ms':'280ms';
    layer.style.opacity=black?1:0;this.black=black?1:0;
    await this.pause(this.reducedMotion()?80:300,false);if(hold)await this.pause(hold,false);
  }
  async effect(event) {
    if(event.action===15) {
      $('#dialogue').classList.add('hidden');
      const box=$('#native-poem');box.classList.remove('hidden');
      for(const page of layoutPoem(event.text,event.parameter===1)) {
        box.replaceChildren();const nodes=page.map(cell=>{const span=document.createElement('span');span.textContent=cell.char;span.style.cssText=`left:${cell.x*100/7}%;top:${cell.y*100/7}%;color:${cell.color};visibility:hidden`;box.append(span);return span;});
        let done=false;await new Promise(resolve=>{
          const finish=()=>{if(done)return;done=true;nodes.forEach(n=>n.style.visibility='visible');this.typing=null;resolve();};this.typing=finish;const start=performance.now();
          const frame=now=>{if(done)return;if(this.skipping){finish();return;}const count=Math.floor((now-start)/120)+1;nodes.slice(0,count).forEach(n=>n.style.visibility='visible');if(count>=nodes.length)finish();else requestAnimationFrame(frame);};requestAnimationFrame(frame);
        });
        if(!this.skipping)await this.pause(24*60*60*1000);
      }
      box.classList.add('hidden');return;
    }
    if(event.action===19){await this.fade(true,160);return;}
    if(event.action===18){await this.fade(false);return;}
    if(event.action===21||event.action===22) {
      if(event.parameter===0)await this.fade(event.action===21);
      else this.weather=event.action===21?event.parameter:0;
      return;
    }
    if(event.action===20&&!this.reducedMotion()) {
      const stage=$('.stage');stage.classList.add('native-shake');await this.pause(400,false);stage.classList.remove('native-shake');return;
    }
    if([16,17].includes(event.action)) {
      const actor=this.stage?.scene.actors[event.track],meta=this.data.sprites[actor?.sprite];
      const track=this.stage?.tracks.find(t=>t[0]===event.track),pose=track?sampleTrack(track,event.tick).pose:actor?.animation;
      if(meta){
        const cut=event.action===16,duration=cut?1280:(meta.animations[pose]?.steps||[]).reduce((n,[,ticks])=>n+ticks*60,0);
        this.screenAction={cut,actor,meta,pose,start:performance.now(),duration,mirror:!!(actor.flags&1)};
        await this.pause(duration,false);this.screenAction=null;$('#native-screen').classList.add('hidden');
      }
      if(event.action===17&&!this.skipping&&!this.reducedMotion()){
        const layer=$('#native-flash');layer.style.background=event.parameter===1?'#f00':event.parameter===2?'#000':'#fff';
        for(let i=0;i<7&&!this.skipping;i++){
          layer.classList.add('show');await this.pause(60,false);layer.classList.remove('show');await this.pause(60,false);
        }
      }
      return;
    }
    if(event.action===54) {
      const image=new Image();image.src='assets/'+event.text.replace(/^\//,'');try{await image.decode();}catch{return;}
      const panel=$('#native-cg');panel.src=image.src;panel.classList.remove('hidden');await this.pause(24*60*60*1000);panel.classList.add('hidden');
    }
  }
  draw(ctx,view) {
    const stage=this.stage;if(!stage)return;
    const {w,h,dpr}=view,head=stage.tracks.length?sampleTrack(stage.tracks[0],stage.tick):stage.scene.actors.find(a=>a.sprite===0)||{x:120,y:160};
    const map=this.images.get('map-'+stage.scene.map+'.png');
    const axis=(target,extent,viewport)=>extent<viewport?(extent-viewport)/2:Math.max(0,Math.min(extent-viewport,target-viewport/2));
    const logicalMap=this.data.mapSizes?.[stage.scene.map];
    const mapWidth=logicalMap?.[0]||map?.width||240,mapHeight=logicalMap?.[1]||map?.height||320;
    const zoom=view.fullViewport?viewportZoom(w,h,mapWidth,mapHeight,true):Math.min(w/240,h/320);
    const camera={x:axis(head.x,mapWidth,w/zoom),y:axis(head.y,mapHeight,h/zoom)};
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
    if(map)ctx.drawImage(map,0,0,mapWidth,mapHeight);
    const actors=stage.tracks.map(track=>({...sampleTrack(track,stage.tick),id:track[0]}));
    actors.sort((a,b)=>a.y-b.y);
    for(const actor of actors) {
      const original=stage.scene.actors[actor.id],meta=this.data.sprites[original.sprite];
      if(!actor.visible||!meta||[19,21,22].includes(original.sprite)||meta.source.includes('touxiang'))continue;
      const image=this.images.get('original-'+meta.source),animation=meta.animations[actor.pose];
      if(!image||!animation)continue;
      const frame=animationFrame(animation.steps,actor.elapsed,80);
      ctx.save();if(actor.flipY){ctx.translate(actor.x,actor.y);ctx.scale(1,-1);ctx.translate(-actor.x,-actor.y);}
      drawNativeFrame(ctx,image,meta,frame,actor.x,actor.y,1,actor.mirror);ctx.restore();
    }
    ctx.restore();
    if(this.weather===1) {
      ctx.strokeStyle='#ecf1f0aa';ctx.lineWidth=1;const t=performance.now()/80;
      for(let i=0;i<75;i++){const x=((i*73-t*7)%w+w)%w,y=(i*47+t*13)%h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+13);ctx.stroke();}
    }else if(this.weather===2){
      ctx.fillStyle='#f3f5f0cc';const t=performance.now()/80;
      for(let i=0;i<60;i++){const x=((i*73+Math.sin(t/9+i)*12)%w+w)%w,y=(i*47+t*2)%h;ctx.fillRect(x,y,2,2);}
    }
    const screen=this.screenAction;
    const screenCanvas=$('#native-screen');screenCanvas.classList.toggle('hidden',!screen);
    if(screen){
      if(screenCanvas.width!==Math.ceil(w*dpr)||screenCanvas.height!==Math.ceil(h*dpr)){
        screenCanvas.width=Math.ceil(w*dpr);screenCanvas.height=Math.ceil(h*dpr);
      }
      const ctx=screenCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,w,h);
      const {meta,actor,cut,start,mirror}=screen,image=this.images.get('original-'+meta.source),elapsed=performance.now()-start;
      const steps=meta.animations[screen.pose]?.steps||[],frame=animationFrame(steps,elapsed,60);
      const scale=Math.min(w/240,h/320),bounds=actor.bounds,centerX=bounds[0]+bounds[2]/2,centerY=bounds[1]+bounds[3]/2;
      ctx.save();
      if(cut){
        const band=40*scale,y=(h-band)/2;ctx.beginPath();ctx.rect(0,y,w,band);ctx.clip();
        for(let i=0;i<40;i++){ctx.fillStyle=`rgb(${100+(i*71+Math.floor(elapsed/60)*47)%156},0,0)`;ctx.fillRect(0,y+i*scale,w,scale);}
      }else{ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);}
      const entrance=cut&&!this.reducedMotion()?(1-Math.min(1,elapsed/300))*(mirror?1:-1)*w:0;
      if(image)drawNativeFrame(ctx,image,meta,frame,w/2-(mirror?-centerX:centerX)*scale+entrance,h/2-centerY*scale,scale,mirror);
      ctx.restore();
    }
  }
}
