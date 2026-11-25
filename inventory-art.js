const cache = new Map();
const colors = ['#687a87','#a34e3c','#397d76','#6b5893','#a4813f','#496c46','#9a586d','#386983','#945c32'];
const medicineShapes = ['jar','pill','herb','lotus','flame','elixir','seal','leaf','flask','gourd','pill','vial','elixir','flask','vial','mushroom','gem','pill'];

function drawIcon(kind,id) {
  const key=kind+':'+id;
  if(cache.has(key))return cache.get(key);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.scale(2,2);
  const variant=id%9,color=colors[variant],metal='#dfb770',ink='#483029',light='#fff0bb';
  const fill=(shape,paint=color,stroke=ink,width=1.35)=>{
    const path=new Path2D(shape);
    ctx.fillStyle=paint;ctx.fill(path);
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke(path);}
  };
  const line=(shape,paint=metal,width=1.4)=>{
    ctx.strokeStyle=paint;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke(new Path2D(shape));
  };
  const gem=(x,y,r,paint=color)=>fill(`M${x} ${y-r}l${r} ${r} -${r} ${r} -${r} -${r}Z`,paint);
  const gradient=ctx.createLinearGradient(10,8,52,54);
  gradient.addColorStop(0,light);gradient.addColorStop(.35,color);gradient.addColorStop(1,ink);
  switch(kind){
    case 'spear':
      line('M13 55 47 19',ink,5);line('M13 55 47 19',metal,2);
      fill(`M34 28 Q41 17 ${45-variant} 10 L56 5 ${54+variant/2} 20 Q46 19 38 31Z`,gradient);
      line('M39 25 53 9',light);fill('M34 28l7 3-8 4-4-2Z',color);break;
    case 'ribbon':
      fill(`M8 36 C1 12 35 ${3+variant} 49 12 C61 20 38 31 28 30 C23 30 22 34 29 36 Q44 40 56 ${43+variant} L49 56 42 50 C26 45 10 46 12 34 C15 23 42 22 43 16 C27 13 12 23 16 30Z`,gradient);
      line('M10 33C5 17 31 9 47 14 M18 35Q14 43 45 48',light);
      for(let i=0;i<variant%4+1;i++)gem(29+i*5,42+i,1.4,light);break;
    case 'hoop':
    case 'ring': {
      const wide=kind==='hoop',r=wide?20:14;
      ctx.save();ctx.translate(32,wide?32:38);ctx.rotate((variant-4)*.09);ctx.scale(1,wide?1:.65);
      for(const [paint,w] of [[ink,wide?8:7],[color,wide?5:5],[metal,2]]){
        ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle=paint;ctx.lineWidth=w;ctx.stroke();
      }
      ctx.restore();
      if(wide){for(let i=0;i<3+variant%4;i++){const a=i*6.283/(3+variant%4);gem(32+r*Math.cos(a),32+r*Math.sin(a),3,light);}}
      else {gem(32,28,7+variant%3);line('M28 27l4-5 4 5',light);}break;
    }
    case 'armor':
      fill(`M21 12 27 9 32 15 37 9 43 12 ${50+variant%4} 29 43 34 45 52Q32 ${54+variant%5} 19 52L21 34 14 29Z`,gradient);
      line('M27 10q5 13 10 0 M20 37h24 M20 41h24',metal,2);
      if(id<34){for(let y=20;y<37;y+=5)line(`M23 ${y}h18`,light);}
      else{line('M27 16q10 9 7 22l5 13 M18 25l5-5 M43 20l4 5',light);gem(30,39,3);}
      break;
    case 'bracer':
      for(const x of [0,19]){
        ctx.save();ctx.translate(x,0);fill(`M16 ${14+variant%4}l12 3 2 29-17-4Z`,gradient);
        line('M16 21l13 3 M14 36l15 4',metal,2);gem(22,30,3,light);ctx.restore();
      }break;
    case 'jade':
      line('M32 19C11 5 54 5 34 19 M32 46v10m-3-7-4 8m10-8 4 8',color,2);
      if(variant%3===0)fill('M19 24Q32 16 45 24L47 40 32 51 17 40Z',gradient);
      else if(variant%3===1)fill('M32 19c23 0 22 28 0 31-22-3-23-31 0-31Z',gradient);
      else gem(32,35,16,color);
      line('M23 34q8-13 17 0-8 12-13 1',light);break;
    case 'manual': {
      const rank=(id-17)%4+1;
      fill('M14 15 43 10 51 17 51 49 43 55 14 51Z','#ece0b9');
      fill('M14 13 44 9 47 47 14 51Z',gradient);
      line('M19 14v34 M46 49l4-3',metal,2);
      fill('M29 15l10-1 2 24-11 2Z','#f9e9c2');
      line('M33 19l1 14m3-12v9',color);
      for(let i=0;i<rank;i++)gem(22+i*5,44,1.6,light);
      break;
    }
    default: {
      const shape=medicineShapes[id===73?17:id];
      const vessels={
        jar:'M21 22h22l3 9-3 20H21l-3-20Z',
        pill:'M16 30q16-17 32 0v17q-16 12-32 0Z',
        elixir:'M28 16h8v13q16 9 8 22H20q-8-13 8-22Z',
        flask:'M25 18h14v9q17 9 5 24H20q-12-15 5-24Z',
        gourd:'M28 15h8q-2 9 4 13 4 5 0 9 11 10 0 17H24q-11-7 0-17-4-4 0-9 6-4 4-13Z',
        vial:'M25 15h14l2 33-9 6-9-6Z',
      };
      if(vessels[shape]){
        fill(vessels[shape],gradient);line('M26 18h12',metal,3);
        fill('M25 33h14v11H25Z',light);gem(32,38,4);
      }else if(shape==='seal'){fill('M21 11 44 15 39 55 17 50Z',light);line('M32 19v27m-7-22 13 2m-13 8 11 2',color,2);}
      else if(shape==='gem'){gem(32,33,19);line('M32 14 25 33 32 52 39 33 32 14 M13 33h38',light);}
      else if(shape==='flame'){fill('M32 9q-2 14 8 16-1-9 4-11 16 22 0 36-15 10-25-5-8-12 4-25-1 9 4 10 6-8 5-21Z',gradient);fill('M30 47q-4-5 4-15 8 12 1 16Z',light);}
      else if(shape==='mushroom'){fill('M29 30h8l-1 21-10 1Z',light);fill('M12 31q5-17 20-17 16 0 20 17-20 8-40 0Z',gradient);}
      else {line('M18 52q13-14 25-35',color,3);for(let i=0;i<4;i++){const x=22+i*6,y=45-i*7;fill(`M${x} ${y}q-11 0-10-12 10 1 10 12m0 0q1-10 10-10-1 10-10 10`,gradient);}if(shape==='lotus')gem(43,15,9,light);else if(shape==='herb')gem(43,15,5,metal);}
    }
  }
  for(let mark=0;mark<7;mark++){
    if((id+1)&(1<<mark))gem(14+mark*6,59,1.4,metal);
  }
  const url=canvas.toDataURL();cache.set(key,url);return url;
}

export function inventoryArt(item) {
  const id=item.originalId;
  if(id==null)return item.art||`assets/native/item-${item.icon}.png`;
  const kind=item.slot==='weapon'?({hero:'spear',fei:'hoop',lan:'ribbon'})[item.actor]:item.slot;
  return drawIcon(kind,id);
}
export const supplyArt=id=>drawIcon(id>=17&&id<=72?'manual':'medicine',id);
