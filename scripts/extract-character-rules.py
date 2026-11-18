"""Decode character and skill records, retaining the original progression tables."""
import sys, json, re, struct, zipfile, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
archive=Path(sys.argv[1]); z=zipfile.ZipFile(archive)
class Reader:
 def __init__(self,data): self.data=data;self.p=0
 def read(self,f):
  v=struct.unpack_from('>'+f,self.data,self.p);self.p+=struct.calcsize('>'+f);return v[0] if len(v)==1 else list(v)
 def array(self,f='h'):return [self.read(f) for _ in range(self.read('h'))]
 def utf(self):
  n=self.read('H');v=self.data[self.p:self.p+n].decode('utf8');self.p+=n;return v
 def base(self):
  name,description,id=self.utf(),self.utf(),self.read('h');stats=self.array('i');rates=self.array();rows,cols=self.read('hh')
  return dict(name=name.lstrip('0123456789#'),rawName=name,description=description,id=id,stats=stats,rates=rates,status=[[self.read('h') for _ in range(cols)]for _ in range(rows)])
def actors():
 r=Reader(z.read('MateData.bin'));out=[]
 for i in range(r.read('h')):
  a=r.base();a.update(index=i,level=r.read('h'),xp=r.read('H'),sprite=r.utf(),idle=r.read('h'),counter=r.utf(),counterType=r.read('h'),counterRate=r.read('h'),width=r.read('h'),height=r.read('h'),skills=r.array())
  a.update(mana=r.read('h'),rage=r.read('h'),sex=r.read('h'),energy=r.read('h'),manaGrowth=r.read('h'),growth=r.array(),equipment=r.array(),portrait=r.utf());out.append(a)
 assert r.p==len(r.data),(r.p,len(r.data))
 return out
def skills():
 r=Reader(z.read('SkillData.bin'));out=[]
 for i in range(r.read('h')):
  a=r.base();a['index']=i
  for key in ['i','j','a','b','c','d','e','f','g','h','k','l']:a[key]=r.read('h')
  a['revive']=bool(r.read('?'));a['m']=r.read('h');a['area']=bool(r.read('?'))
  for key in ['n','o','p','q']:a[key]=r.read('h')
  a.update(casterSprite=r.utf(),targetSprite=r.utf(),r=r.read('h'),s=r.read('h'),effects=r.array());out.append(a)
 assert r.p==len(r.data),(r.p,len(r.data))
 return out
source=(Path(sys.argv[2])/'p.java').read_text('utf8')

def own_team():
 r=Reader(z.read('OwnTeam.bin'));background=r.read('h');party=r.array();bonus=r.read('h')
 items=r.array();item_counts=r.array();arms=r.array();arm_counts=r.array()
 assert r.p==len(r.data),(r.p,len(r.data))
 return dict(party=party,items=dict(zip(items,item_counts)),arms=dict(zip(arms,arm_counts)),coins=200)
def table(pattern):
 s=re.search(pattern,source).group(1).replace('{','[').replace('}',']');return json.loads(s)
data=dict(source=archive.name,sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),actors=actors(),skills=skills(),initial=own_team(),
 minimumLevels=table(r'd = new short\[\](\{0, 11, 23, 35.*?\});'),experience=table(r'g = new int\[\](\{.*?\});'),autoLearn=table(r'a = new int\[\]\[\](\{\{0, -1.*?\});'),shops=table(r'a = new short\[\]\[\](\{\{0, 0, 0\}.*?\});'))
(root/'character-rules.js').write_text('// MateData.bin, SkillData.bin; p.java progression tables.\nexport const characterRules = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
print(json.dumps(dict(actors=data['actors'],skills=[{k:s[k] for k in ['index','name','description','a','b','c','d','e','f','g','h','k','l','n','o','p','q','effects']}for s in data['skills'][:1]+data['skills'][52:62]]),ensure_ascii=False))
