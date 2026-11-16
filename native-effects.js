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
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
    const point = this.anchor(element), scale = point.scale;
    const overhead = [2, 3, 9, 10].includes(index) ? 50 * scale : 0;
    this.layer.append(canvas);
    if ([13, 15, 17, 21].includes(index) && !matchMedia('(prefers-reduced-motion:reduce)').matches)
      this.scene.animate([{ translate:'0 0' }, { translate:'3px 0' }, { translate:'-3px 0' }, { translate:'0 0' }], { duration:320, iterations:2 });
    const duration = nativeDuration(this.metadata, index), start = performance.now();
    await new Promise(resolve => {
      const draw = now => {
        if (!canvas.isConnected || now - start >= duration) { resolve(); return; }
        ctx.clearRect(0, 0, rect.width, rect.height);
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
        drawNativeFrame(ctx, this.image, this.metadata, animationFrame(animation.steps, now-start, 80), point.x, point.y-overhead, scale, mirror);
        requestAnimationFrame(draw);
      }; requestAnimationFrame(draw);
    }); canvas.remove();
  }
}
