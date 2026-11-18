"""Convert the original black color-key backdrop for HTML display; preserve colored art."""
from pathlib import Path
import sys
sys.path.insert(0,'C:/Users/86948/Documents/Codex/2026-11-13/ni-z/work/python-libs')
from PIL import Image
root=Path(__file__).resolve().parents[1]/'assets'
for name in ['shenhuan','shenjie','shenpei','shenqiang','shensuo']:
 im=Image.open(root/(name+'.png')).convert('RGBA');pixels=im.load()
 for y in range(im.height):
  for x in range(im.width):
   r,g,b,a=pixels[x,y]
   if max(r,g,b)<35:pixels[x,y]=(r,g,b,0)
 im.save(root/'native'/('relic-'+name+'.png'))
print('Prepared five transparent relic cutouts.')
