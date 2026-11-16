export const chapters = ['一 · 风起药庐', '一 · 风起药庐', '二 · 枫林照影', '二 · 枫林照影', '三 · 彼岸无殇', '四 · 铁骑红颜', '终 · 人间归途', '终 · 人间归途'];
export const places = {
  12: { name: '临安 · 听雨别院', mood: '池荷初静，故人待归。', spawn: [17, 12], palette: '#abc5aa' },
  0: { name: '栖霞 · 十里枫林', mood: '西风卷红叶，山道有行人。', spawn: [23, 25], palette: '#d7ba79' },
  4: { name: '栖霞 · 彼岸洞', mood: '幽谷藏暗香，一灯照归途。', spawn: [16, 26], palette: '#9a8eac' },
  19: { name: '江北 · 金军营地', mood: '铁骑踏夜，破晓将至。', spawn: [15, 24], palette: '#aeb77b' }
};
export const characters = {
  hero: { name: '凌飞云', portrait: 'lfytouxiang.png', role: '流云剑客' },
  lan: { name: '纳兰芷萱', portrait: 'nlzxtouxiang.png', role: '飞燕游侠' },
  fei: { name: '耿沐霏', portrait: 'gmltouxiang.png', role: '听雨医者' },
  geng: { name: '耿京', portrait: 'gjtouxiang.png', role: '义军首领' },
  boss: { name: '铁骑统领', portrait: 'ltdtouxiang.png', role: '金军先锋' },
  story: { name: '江湖记', portrait: null, role: '' }
};
export const entities = [
  { id: 'geng', map: 12, x: 17, y: 7, sprite: 27, name: '耿京', kind: 'npc', marker: '谈' },
  { id: 'fei', map: 12, x: 23, y: 10, sprite: 1, name: '耿沐霏', kind: 'npc', marker: '谈' },
  { id: 'home-chest', map: 12, x: 10, y: 8, sprite: 39, name: '药箱', kind: 'chest', marker: '取' },
  { id: 'maple-gate', map: 12, x: 18, y: 29, name: '前往枫林', kind: 'portal', to: 0 },
  { id: 'camp-gate', map: 12, x: 31, y: 10, name: '渡江破阵', kind: 'portal', to: 19 },
  { id: 'lan', map: 0, x: 21, y: 20, sprite: 2, name: '纳兰芷萱', kind: 'npc', marker: '谈' },
  { id: 'patrol', map: 0, x: 15, y: 12, sprite: 7, name: '金军斥候', kind: 'enemy', marker: '战' },
  { id: 'maple-chest', map: 0, x: 6, y: 19, sprite: 40, name: '遗落的军匣', kind: 'chest', marker: '取' },
  { id: 'cave-gate', map: 0, x: 12, y: 2, name: '进入彼岸洞', kind: 'portal', to: 4 },
  { id: 'home-gate', map: 0, x: 23, y: 26, name: '返回别院', kind: 'portal', to: 12 },
  { id: 'herb', map: 4, x: 24, y: 5, sprite: 43, name: '彼岸花', kind: 'herb', marker: '采' },
  { id: 'cave-chest', map: 4, x: 5, y: 13, sprite: 39, name: '洞中藏箱', kind: 'chest', marker: '取' },
  { id: 'cave-return', map: 4, x: 16, y: 27, name: '返回枫林', kind: 'portal', to: 0 },
  { id: 'shortcut', map: 4, x: 27, y: 8, name: '山径 · 直达别院', kind: 'portal', to: 12 },
  { id: 'prisoner', map: 19, x: 8, y: 18, sprite: 13, name: '被俘的乡民', kind: 'npc', marker: '救' },
  { id: 'boss', map: 19, x: 19, y: 8, sprite: 9, name: '铁骑统领', kind: 'enemy', marker: '战' },
  { id: 'camp-chest', map: 19, x: 25, y: 21, sprite: 40, name: '辎重箱', kind: 'chest', marker: '取' },
  { id: 'camp-return', map: 19, x: 15, y: 26, name: '返回别院', kind: 'portal', to: 12 }
];
export const objectives = [
  { title: '风起药庐', text: '与耿京交谈，问明沐霏的伤势。', target: 'geng' },
  { title: '枫林寻人', text: '前往十里枫林，寻找纳兰芷萱。', target: 'lan', map: 0 },
  { title: '并肩迎敌', text: '击退拦路的金军斥候。', target: 'patrol', map: 0 },
  { title: '彼岸药香', text: '进入彼岸洞，寻得救命的花。', target: 'herb', map: 4 },
  { title: '故人无恙', text: '带彼岸花回别院，交给耿沐霏。', target: 'fei', map: 12 },
  { title: '破晓之前', text: '渡江突入营地，击败铁骑统领。', target: 'boss', map: 19 },
  { title: '人间归途', text: '烽烟渐远，选择你的归途。', target: 'geng', map: 12 },
  { title: '旧篇已完成', text: '四幕试玩已结束。点引路进入原作六章主线。', target: null, map: 12 }
];
export function visibleEntity(e, s) {
  if (e.id === 'lan') return !s.party;
  if (e.id === 'camp-gate') return s.stage >= 5;
  if (e.id === 'patrol') return s.stage < 3;
  if (e.id === 'herb') return s.stage < 4;
  if (e.id === 'boss') return s.stage < 6;
  if (e.id === 'shortcut') return s.stage >= 4;
  if (e.id === 'prisoner') return !s.flags.rescued;
  return true;
}
