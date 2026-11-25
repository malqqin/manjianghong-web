const legacyIllustrations = new Map([
  ['点钢枪', 'steel'],
  ['软藤枪', 'wood'],
  ['蘸金枪', 'iron'],
  ['亮银枪', 'silver'],
  ['沥泉神枪', 'liquan'],
  ['青铜戒', 'bronze'],
  ['玲珑环', 'linglong'],
  ['青玉佩', 'plainjade'],
  ['锦鲤玉佩', 'koi'],
  ['冰心佩', 'frostjade'],
  ['破虏剑', 'polu'],
]);

export function inventoryArt(item) {
  const id=item.originalId;
  const key=id==null?legacyIllustrations.get(item.name):id===1?'wood':'arm-'+id;
  return 'assets/inventory/'+key+'.png';
}

export const supplyArt=id=>'assets/inventory/item-'+id+'.png';
