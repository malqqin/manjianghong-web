"""Isolate every original frame, preserving weapon extents and actor foot anchor."""
import json,sys,io,zipfile
from pathlib import Path
sys.path.insert(0,'C:/Users/86948/Documents/Codex/2026-11-13/ni-z/work/python-libs')
from PIL import Image
root=Path(__file__).resolve().parents[1];z=zipfile.ZipFile(sys.argv[1])
native=json.loads((root/'assets/native-combat.json').read_text('utf8'));battle=json.loads((root/'assets/battle.json').read_text('utf8'))
report={}
for name,meta in native['sprites'].items():
 if name not in battle:continue
 src=meta['source'].lstrip('/');original=Image.open(io.BytesIO(z.read(src)));art=Image.open(root/'assets'/src).convert('RGBA');ratio=art.width/original.width
 bounds=[]
 for frame in meta['frames']:
  for part,flags,x,y in frame:
   sx,sy,w,h=meta['parts'][part];x-=w if flags&1 else 0;y-=h if flags&2 else 0;bounds.append((x,y,x+w,y+h))
 # Keep the DOM at 96 x 96. The larger bitmap is positioned at the same feet.
 left=min(-48,min(b[0] for b in bounds)-2);top=min(-80,min(b[1] for b in bounds)-2)
 right=max(48,max(b[2] for b in bounds)+2);bottom=max(16,max(b[3] for b in bounds)+2)
 width=right-left;height=bottom-top;sheet=Image.new('RGBA',(width*4*len(meta['frames']),height*4))
 for fi,frame in enumerate(meta['frames']):
  cell=Image.new('RGBA',(width*4,height*4))
  for part,flags,x,y in frame:
   sx,sy,w,h=meta['parts'][part];im=art.crop(tuple(round(v*ratio)for v in [sx,sy,sx+w,sy+h])).resize((w*4,h*4),Image.Resampling.LANCZOS)
   if flags&1:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT);x-=w
   if flags&2:im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM);y-=h
   cell.alpha_composite(im,((x-left)*4,(y-top)*4))
  sheet.alpha_composite(cell,(fi*width*4,0))
 sheet.save(root/'assets/native'/('battle-'+name+'.png'))
 battle[name].update(cellWidth=width,cellHeight=height,originX=-left,originY=-top)
 report[name]=dict(width=width,height=height,bounds=[left,top,right,bottom],frames=len(meta['frames']))
(root/'assets/battle.json').write_text(json.dumps(battle,separators=(',',':')),encoding='utf8')
out=root/'output/battle-frame-audit.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,indent=2),encoding='utf8')
print('Rebuilt',len(report),'isolated battle sheets;',report.get('gengjing'))
