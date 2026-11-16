// The original text and cutscene ordering are decoded from the original JAR.
// Movement, quests, combat balance and touch presentation are implemented for the web.
export const STORY_COUNT = 67;
export const chapterNames = ['年少轻狂祸乱起', '欢喜冤家两落魄', '情窦初开汴京城', '壮志飞过紫云山', '儿女泪洒衣冠冢', '金戈铁马战襄阳'];
export const equipment = {
  steel: { name: '点钢枪', slot: 'weapon', attack: 0, price: 0, icon: 'wood', description: '凌飞云在凤凰山上使用的长枪。' },
  wood: { name: '软藤枪', slot: 'weapon', attack: 0, price: 0, icon: 'wood', description: '凤凰山逃亡时，沐霏削枝赠予的长枪。' },
  iron: { name: '蘸金枪', slot: 'weapon', attack: 7, price: 160, icon: 'iron', description: '长枪顺手，普攻与枪法伤害增加 7。' },
  silver: { name: '亮银枪', slot: 'weapon', attack: 12, price: 0, icon: 'silver', description: '父亲留下的旧枪。在紫云山失而复得。' },
  liquan: { name: '沥泉神枪', slot: 'weapon', attack: 22, price: 0, icon: 'liquan', description: '衣冠冢中取得的岳将军神枪。' },
  bronze: { name: '青铜戒', slot: 'ring', defense: 2, price: 130, icon: 'bronze', description: '敌人每次攻击伤害降低 2。' },
  linglong: { name: '玲珑环', slot: 'ring', defense: 5, price: 0, icon: 'linglong', description: '金色妖物掉落的首饰。每次受到的伤害降低 5。' },
  plainjade: { name: '青玉佩', slot: 'jade', attack: 3, price: 180, icon: 'plainjade', description: '温润如水，攻击增加 3。' },
  koi: { name: '锦鲤玉佩', slot: 'jade', attack: 5, price: 0, icon: 'koi', description: '凤凰山遗落的成双信物，串起一段未了的往事。' },
  frostjade: { name: '冰心佩', slot: 'jade', defense: 3, price: 0, icon: 'frostjade', description: '金色妖物掉落。每次受到的伤害降低 3。' }
};
export function originalState(base) {
  return { ...base, map: 0, tile: { x: 8, y: 12 }, stage: 0, party: false, ending: null,
    journey: { index: 0, line: 0, members: [], completed: false, visited: [0], flying: false,
      owned: ['steel'], equipped: { weapon: 'steel', ring: null, jade: null }, skillRank: 1, antidotes: 2, side: {} } };
}
export function journeyObjective(state, steps) {
  if (state.journey.index >= steps.length) return { title: '花叶永不相见', text: '原作主线已至终章。可重温结局、回访已到过的地方，或另启新程。', target: null, chapter: 6, completed: true };
  const s = steps[state.journey.index];
  return { ...s, text: `${s.kind === 'battle' ? '前往交锋' : s.kind === 'travel' ? '穿过此地 · 可绕开旋风' : '前往交谈'} · ${s.title}`, target: 'main-goal' };
}
export function advanceJourney(state, steps) {
  const j = state.journey, step = steps[j.index];
  if (!step) return false;
  if (step.party) j.members = [...step.party];
  state.party = j.members.length > 0;
  const grant = id => { if (!j.owned.includes(id)) j.owned.push(id); j.equipped[equipment[id].slot] = id; };
  if (step.title === '一块锦鲤玉佩') grant('koi');
  if (step.title === '沐霏相救') grant('wood');
  if (step.title === '亮银枪归来') grant('silver');
  if (step.title === '神枪与蛇毒') grant('liquan');
  j.index++; j.line = 0; j.completed = j.index === steps.length;
  delete j.afterBattle;
  return true;
}
export function equipmentStats(state) {
  return Object.values(state.journey?.equipped || {}).reduce((sum, id) => ({ attack: sum.attack + (equipment[id]?.attack || 0), defense: sum.defense + (equipment[id]?.defense || 0) }), { attack: 0, defense: 0 });
}
export function equipItem(state, id) {
  if (!state.journey?.owned.includes(id) || !equipment[id]) return false;
  state.journey.equipped[equipment[id].slot] = id; return true;
}
export function purchase(state, id) {
  const item = equipment[id];
  if (!item || !item.price || state.coins < item.price || state.journey.owned.includes(id)) return false;
  state.coins -= item.price; state.journey.owned.push(id); return true;
}
export function flightPath(map, start, end) {
  const path = [], p = { ...start };
  end = { x: Math.max(0, Math.min(map.width - 1, Math.round(end.x))), y: Math.max(0, Math.min(map.height - 1, Math.round(end.y))) };
  while (p.x !== end.x || p.y !== end.y) {
    if (p.x !== end.x) p.x += Math.sign(end.x - p.x); else p.y += Math.sign(end.y - p.y);
    path.push({ ...p });
  }
  return path;
}
export const enemyTypes = {
  soldiers: ['金军守卫', 'mon1', null], pursuers: ['金军亲卫', 'mon2', null], trial: ['义军武师', 'mon4', null],
  ambush: ['守库伏兵', 'mon4', null], taimeng: ['神兽态蒙', 'taimeng', 'confuse'], litd: ['厉天渡', 'litd', null],
  ice: ['牛皋之魂', 'mon4', 'freeze'], fire: ['杨再兴之魂', 'mon2', 'burn'], snake: ['沥泉蛇怪', 'snake', 'burn'],
  war: ['金军精锐', 'mon4', null], li: ['完颜羽诚', 'litd', 'confuse'], golden: ['金色妖物', 'golden', null], ghost: ['魁召', 'ghost', 'confuse']
};
export function journeyEncounter(step, state, type = step.enemy) {
  const [name, sprite, status] = enemyTypes[type] || enemyTypes.soldiers, level = state.level;
  const boss = ['litd', 'taimeng', 'snake', 'li', 'ghost', 'golden', 'ice', 'fire'].includes(type);
  return { name: step.title, reward: 65 + level * 25, xp: 55 + level * 20, background: '',
    landscape: step.map >= 4 && step.map <= 11 || step.map === 26 || step.map === 41 ? 'cave' : step.map >= 19 && step.map <= 35 ? 'camp' : 'forest',
    enemies: [{ name, sprite, hp: (boss ? 95 : 60) + level * 21, attack: 9 + level * 3, status },
      ...(!boss ? [{ name: '持刀护卫', sprite: 'mon2', hp: 40 + level * 16, attack: 7 + level * 2 }] : [])] };
}
