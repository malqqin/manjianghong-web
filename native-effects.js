import { animationFrame } from './presentation.js';

export const nativeDuration = (metadata, index) =>
  (metadata.animations[index]?.steps || []).reduce((n, [, ticks]) => n + ticks * 80, 0);

// Match s.java: an individual part's mirror flag also changes its anchor.
export function drawNativeFrame(ctx, image, metadata, frame, x, y, scale = 1, mirror = false) {
  const sourceScale = image.width / Math.max(...metadata.parts.map(p => p[0] + p[2]));
  // Sheets can have trailing transparent columns. The extracted source dimensions are authoritative.
  const ratio = metadata.sourceWidth ? image.width / metadata.sourceWidth : sourceScale;
  for (const [part, flags, dx, dy] of metadata.frames[frame] || []) {
    const [sx, sy, w, h] = metadata.parts[part];
    const flipX = mirror !== !!(flags & 1), flipY = !!(flags & 2);
    const px = x + (mirror ? -dx : dx) * scale, py = y + dy * scale;
    ctx.save(); ctx.translate(px, py); ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
    ctx.drawImage(image, sx * ratio, sy * ratio, w * ratio, h * ratio, 0, 0, w, h); ctx.restore();
  }
}

export class NativeBattleEffects {
  constructor(scene, layer, metadata, image, anchor) {
    Object.assign(this, { scene, layer, metadata, image, anchor });
  }
  async play(index, element, { mirror = false, ambient = true } = {}) {
    const animation = this.metadata.animations[index];
    if (!animation || index === 0 || !element) return;
    const canvas = document.createElement('canvas'), rect = this.scene.getBoundingClientRect();
    const dpr = Math.min(3, devicePixelRatio || 1);
    canvas.width = Math.ceil(rect.width * dpr); canvas.height = Math.ceil(rect.height * dpr);
    canvas.className = 'native-battle-effect'; canvas.dataset.animation = index;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const point = this.anchor(element), scale = point.scale;
    const overhead = [2, 3, 9, 10].includes(index) ? 50 * scale : 0;
    this.layer.append(canvas);
    if ([13, 15, 17, 21].includes(index) && !matchMedia('(prefers-reduced-motion:reduce)').matches)
      this.scene.animate([{ translate:'0 0' }, { translate:'3px 0' }, { translate:'-3px 0' }, { translate:'0 0' }], { duration:320, iterations:2 });
    const duration = nativeDuration(this.metadata, index), start = performance.now();
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    const hue=({11:'#f0d894',12:'#f4d58b',13:'#ff8a42',14:'#d7b582',16:'#f4b4c7',18:'#9de5fa',19:'#a8e3ea',20:'#f5b8d2',21:'#b4d9fb',22:'#dcc3f4',23:'#bce8af'})[index];
    const flourish=(elapsed)=>{
      if(!hue)return;
      const t=Math.min(1,elapsed/duration),fade=Math.sin(Math.PI*t),radius=(28+20*t)*scale;
      ctx.save();ctx.translate(point.x,point.y-28*scale);ctx.globalAlpha=fade*.48;
      const glow=ctx.createRadialGradient(0,0,2,0,0,radius*1.7);
      glow.addColorStop(0,hue+'88');glow.addColorStop(.45,hue+'33');glow.addColorStop(1,hue+'00');
      ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(0,0,radius*1.7,radius*1.35,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=hue;ctx.lineWidth=1.3*scale;ctx.shadowColor=hue;ctx.shadowBlur=8*scale;
      if(index===11||index===14||index===23){ctx.beginPath();ctx.ellipse(0,25*scale,radius,radius*.28,0,0,Math.PI*2);ctx.stroke();}
      if(!reduced) for(let n=0;n<12;n++){
        const angle=n*Math.PI/6+t*(index===18?-1:1),r=radius*(.5+(n%3)/4),x=Math.cos(angle)*r,y=Math.sin(angle)*r*.8;
        ctx.save();ctx.translate(x,y-12*t*scale);ctx.rotate(angle);
        ctx.fillStyle=hue;
        if(index===18){ctx.beginPath();ctx.moveTo(0,-6*scale);ctx.lineTo(2*scale,0);ctx.lineTo(0,6*scale);ctx.lineTo(-2*scale,0);ctx.closePath();ctx.fill();}
        else if([16,20,22].includes(index)){ctx.beginPath();ctx.ellipse(0,0,4*scale,1.7*scale,0,0,Math.PI*2);ctx.fill();}
        else{ctx.beginPath();ctx.arc(0,0,scale*(n%3?1:1.7),0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
      ctx.restore();
    };
    await new Promise(resolve => {
      const draw = now => {
        if (!canvas.isConnected || now - start >= duration) { resolve(); return; }
        ctx.clearRect(0, 0, rect.width, rect.height);
        flourish(now-start);
        // i.java adds these currency.png particle layers to the full battle viewport.
        const parts = index===18 ? [96,97] : index===23 ? [98] : index===22 ? [99,100] : [19,20].includes(index) ? [101] : [];
        if(ambient) for(const part of parts) {
          const [sx,sy,w,h]=this.metadata.parts[part], tick=Math.floor((now-start)/80);
          const ratio=this.image.width/(this.metadata.sourceWidth || 128);
          const horizontal=part===101, rising=index===23, count=horizontal?9:part===97 || part===100?26:16;
          for(let n=0;n<count;n++) {
            const px=((n*61+tick*(horizontal?-40:0))*scale%rect.width+rect.width)%rect.width;
            const py=((n*37+tick*(horizontal?0:rising?-5:5))*scale%rect.height+rect.height)%rect.height;
            ctx.drawImage(this.image,sx*ratio,sy*ratio,w*ratio,h*ratio,px,py,w*scale,h*scale);
          }
        }
        const frame=animationFrame(animation.steps,now-start,80);
        if(hue){ctx.save();ctx.globalAlpha=.28;ctx.shadowColor=hue;ctx.shadowBlur=10*scale;drawNativeFrame(ctx,this.image,this.metadata,frame,point.x,point.y-overhead,scale,mirror);ctx.restore();}
        drawNativeFrame(ctx, this.image, this.metadata, frame, point.x, point.y-overhead, scale, mirror);
        requestAnimationFrame(draw);
      }; requestAnimationFrame(draw);
    }); canvas.remove();
  }
}
