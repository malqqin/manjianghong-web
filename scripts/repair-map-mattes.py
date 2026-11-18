"""Reinstall map renders with correct alpha compositing, without model calls."""
import importlib.util,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('art_processor',root/'tmp/imagegen/process_full.py')
processor=importlib.util.module_from_spec(spec);spec.loader.exec_module(processor)
from PIL import Image
report=[]
for job in processor.CONFIG['jobs']:
 if job['kind']!='map':continue
 master=processor.OUT/job['master']
 source=Image.open(processor.OUT/'backup'/job['paths'][0]).convert('RGBA')
 art=Image.open(master).convert('RGBA')
 result,_=processor.image(job,art,source)
 for name in job['paths']:
  target=root/name
  backup=root/'output/map-matte-backup'/name
  backup.parent.mkdir(parents=True,exist_ok=True)
  if not backup.exists():shutil.copy2(target,backup)
  result.save(target,optimize=True)
  report.append({'path':name,'size':list(result.size)})
(root/'output/map-matte-repair.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('Recomposited',len(report),'maps; original backups and AI masters preserved.')
