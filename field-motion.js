// l.java.h/o: patrol 16–24 pixels at 2 pixels/tick, chase at 6 pixels/tick.
export function advanceFieldActor(entity,player,dt,walkable,{flying=false,rng=Math.random}={}){
 let m=entity.motion;
 const px=()=>entity.x*16+8,py=()=>entity.y*16+8;
 if(!m){const axis=rng()<.5?'x':'y',radius=16+Math.floor(rng()*9);m=entity.motion={axis,radius,direction:rng()<.5?-1:1,homeX:px(),homeY:py(),chasing:false};}
 const x=px(),y=py(),b=entity.detectionBounds||[],grow=m.chasing?1.5:1;
 const scan=b[2]>0&&b[3]>0&&!flying&&player.x>=x+b[0]*grow&&player.x<=x+(b[0]+b[2])*grow&&player.y>=y+b[1]*grow&&player.y<=y+(b[1]+b[3])*grow;
 m.chasing=!!scan;let dx=0,dy=0;
 if(scan){const sx=player.x-x,sy=player.y-y,total=Math.abs(sx)+Math.abs(sy),distance=Math.min(total,75*dt);if(total){dx=distance*sx/total;dy=distance*sy/total;}}
 else{
  const home=m.axis==='x'?m.homeX:m.homeY,pos=m.axis==='x'?x:y;
  if(pos>=home+m.radius)m.direction=-1;else if(pos<=home-m.radius)m.direction=1;
  if(m.axis==='x')dx=25*dt*m.direction;else dy=25*dt*m.direction;
  const cross=m.axis==='x'?m.homeY-y:m.homeX-x,returning=Math.sign(cross)*Math.min(Math.abs(cross),25*dt);
  if(m.axis==='x')dy=returning;else dx=returning;
 }
 const move=(nx,ny)=>{if(walkable(nx,ny)){entity.x=(nx-8)/16;entity.y=(ny-8)/16;return true;}return false;};
 if(!move(x+dx,y+dy)){if(!move(x+dx,y))move(x,y+dy);if(!scan)m.direction*=-1;}
}
