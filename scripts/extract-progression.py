"""Read original records. No API calls and no changes to source archive."""
import struct,json,zipfile,hashlib,sys
from pathlib import Path
archive=Path(sys.argv[1]);z=zipfile.ZipFile(archive)
class Reader:
 def __init__(self,data):self.data=data;self.p=0
 def read(self,f):
  a=struct.unpack_from('>'+f,self.data,self.p);self.p+=struct.calcsize('>'+f);return a[0] if len(a)==1 else list(a)
 def short(self):return self.read('h')
 def array(self,f='h'):return [self.read(f) for _ in range(self.short())]
 def utf(self):
  n=self.read('H');v=self.data[self.p:self.p+n].decode('utf8');self.p+=n;return v
 def base(self):
  name,description,id=self.utf(),self.utf(),self.short();stats=self.array('i');rates=self.array();rows,cols=self.read('hh');status=[[self.short() for _ in range(cols)] for _ in range(rows)]
  return dict(id=id,name=name.lstrip('0123456789#'),rawName=name,description=description,stats=stats,rates=rates,status=status)
def records(name,kind):
 r=Reader(z.read(name+'.bin'));result=[]
 for index in range(r.short()):
  item=r.base();item['index']=index
  if kind=='monster':
   item.update(level=r.short(),xp=r.read('H'),sprite=r.utf(),idle=r.short(),counter=r.utf(),counterType=r.short(),counterRate=r.short(),width=r.short(),height=r.short(),skills=r.array(),coins=r.short(),stealRate=r.short(),dropItems=r.array(),itemRates=r.array(),dropEquipment=r.array(),equipmentRates=r.array(),skillRates=r.array())
  else:
   item['properties']=[r.short() for _ in range(12)]
  result.append(item)
 assert r.p==len(r.data),(name,r.p,len(r.data))
 return result
monsters=records('MonsterData','monster');arms=records('ArmData','arm');items=records('ItemData','item')
offset=Reader(z.read('EnemyTeam.png'));offsets=[offset.read('H') for _ in range(offset.read('i'))]
teams=[]
for i,p in enumerate(offsets):
 r=Reader(z.read('EnemyTeam.bin'));r.p=p;background,count=r.read('hh');teams.append(dict(id=i,background=background,monsters=[r.short() for _ in range(count)]))
out=Path(__file__).resolve().parents[1]/'assets/original-rules.json'
out.write_text(json.dumps(dict(source=archive.name,sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),monsters=monsters,equipment=arms,items=items,teams=teams),ensure_ascii=False,separators=(',',':')),encoding='utf8')
module=out.parents[1]/'original-rules.js'
module.write_text('// Decoded from MonsterData.bin, ArmData.bin and EnemyTeam.bin.\nexport const originalRules = '+json.dumps(dict(monsters=monsters,arms=arms,items=items,teams=teams),ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
print('Decoded %s monsters, %s equipment records and %s enemy teams.'%(len(monsters),len(arms),len(teams)))
