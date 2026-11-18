"""Compose missing battle actors from their own original geometry and current art."""
import sys,struct,json,zipfile,io
from pathlib import Path
sys.path.insert(0,'C:/Users/86948/Documents/Codex/2026-11-13/ni-z/work/python-libs')
from PIL import Image
root=Path(__file__).resolve().parents[1];z=zipfile.ZipFile(sys.argv[1])
native=json.loads((root/'assets/native-combat.json').read_text('utf8'))
battle=json.loads((root/'assets/battle.json').read_text('utf8'))
for name in ['mon3','mon5','mon6','yuelinda','yuelei','niugao','yangzx','liyc','shenstm','lqsg']:
 data=z.read(name+'.bin');p=0
 def read(fmt):
  global p
  value=struct.unpack_from('>'+fmt,data,p);p+=struct.calcsize('>'+fmt);return value[0] if len(value)==1 else list(value)
 size=read('H');source=data[p:p+size].decode().lstrip('/')+'.png';p+=size
 parts=[read('iiii') for _ in range(read('I'))];frames=[]
 for _ in range(read('B')):
  read('H');frames.append([read('Hhhh') for _ in range(read('B'))])
 animations=[]
 for _ in range(read('B')):
  flags=read('B');steps=[]
  for _ in range(read('B')):
   lo,hi=read('BB');v=lo+(hi<<8);steps.append([v&1023,v>>10])
  animations.append(dict(flags=flags,steps=steps,movement=read('hh')))
 assert p==len(data)
 original=Image.open(io.BytesIO(z.read(source)));art=Image.open(root/'assets'/source).convert('RGBA');ratio=art.width/original.width
 sheet=Image.new('RGBA',(384*len(frames),384))
 for fi,frame in enumerate(frames):
  for part,flags,x,y in frame:
   sx,sy,w,h=parts[part];im=art.crop(tuple(round(v*ratio) for v in [sx,sy,sx+w,sy+h])).resize((w*4,h*4),Image.Resampling.LANCZOS)
   if flags&1:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT);x-=w
   if flags&2:im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM);y-=h
   sheet.alpha_composite(im,(fi*384+192+x*4,320+y*4))
 sheet.save(root/'assets/native'/('battle-'+name+'.png'))
 native['sprites'][name]=dict(source=source,parts=parts,frames=frames,animations=animations)
 battle[name]=dict(frames=len(frames),animations=[a['steps'] for a in animations])
(root/'assets/native-combat.json').write_text(json.dumps(native,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(root/'assets/battle.json').write_text(json.dumps(battle,ensure_ascii=False,separators=(',',':')),encoding='utf8')
story=json.loads((root/'assets/original-story.json').read_text('utf8'))
teams={1:[1],5:[4,5,35],9:[36],26:[40,39],30:[52],31:[53],32:[54],33:[55],35:[41],36:[42],43:[43],46:[44],48:[45],50:[46],51:[47],59:[50],63:[51]}
for i,s in enumerate(story['steps']):
 if i in [24,56,62]:s['kind']='talk';s.pop('enemy',None)
 if i in teams:s['battleTeams']=teams[i]
story['steps'][26]['betweenBattles']=[dict(who=who,text=nativeText) for who,nativeText in [('geng','恩，实力果然不俗，看来我这把老骨头要亲自下场了！'),('fei','爹，不公平，我也要来！'),('geng','傻丫头心疼女婿了？来吧，你也好久没和爹交过手了！')]]
(root/'assets/original-story.json').write_text(json.dumps(story,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Restored ten original battle sprites and seventeen main-story enemy team sequences.')
