// Field encounters use the original animated tornadoes, on reachable tiles only.
// Only scenes containing tornado actors in the original scene data host field enemies.
// The allied camp remains safe outside its scripted entry battle.
const FIELD_MAPS = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 26, 35, 41]);
export const isFieldMap = map => FIELD_MAPS.has(map);
export function createFieldEncounters(map, ground, spawn, occupied = []) {
  if (!isFieldMap(map) || !spawn) return [];
  const chosen = [];
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const candidates = ground.filter(p => distance(p, spawn) >= 4 && distance(p, spawn) <= 12 &&
    occupied.every(q => distance(p, q) >= 3));
  for (const [i, offset] of [[6, -1], [-4, 4], [1, -7]].entries()) {
    const target = { x: spawn.x + offset[0], y: spawn.y + offset[1] };
    const tile = candidates.filter(p => chosen.every(q => distance(p, q) >= 5))
      .sort((a, b) => distance(a, target) - distance(b, target))[0];
    if (!tile) continue;
    const cave = map >= 4 && map <= 11 || map === 26 || map === 41;
    chosen.push({ ...tile, id: `wind-${map}-${i}`, map, kind: 'encounter', contact: true,
      sprite: 17, windVariant: i % 2, name: cave ? '洞中伏兵' : '游荡敌群',
      enemy: cave ? 'ambush' : i % 2 ? 'pursuers' : 'soldiers' });
  }
  return chosen;
}
export function touchingEncounter(player, entities, { flying = false, suppressed = null } = {}) {
  if (flying) return null;
  return entities.find(e => e.contact && e.id !== suppressed &&
    Math.hypot(player.x - (e.x * 16 + 8), player.y - (e.y * 16 + 8)) <= 15) || null;
}
