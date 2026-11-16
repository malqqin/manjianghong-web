// The original sprite order is back, front, left, right.
const FACING_ANIMATION = { up: 0, down: 1, left: 2, right: 3 };
export function facingDirection(dx, dy, previous = 'down') {
  if (Math.hypot(dx, dy) < .01) return previous;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
// Every new raster person uses the same layout: back, front, left, right;
// each direction has one idle pose followed by eight run poses.
export function rasterActorFrame(direction = 'down', moving = false, elapsed = 0) {
  const row = FACING_ANIMATION[direction] ?? FACING_ANIMATION.down;
  return row * 9 + (moving ? 1 + Math.floor(Math.max(0, elapsed) / 90) % 8 : 0);
}
export function animationFrame(steps, elapsed, frameMs = 16) {
  const duration = steps.reduce((total, step) => total + Math.max(1, step[1]) * frameMs, 0);
  let time = ((elapsed % duration) + duration) % duration;
  for (const [frame, ticks] of steps) {
    const length = Math.max(1, ticks) * frameMs;
    if (time < length) return frame;
    time -= length;
  }
  return steps[0][0];
}
export function actorFrame(metadata, direction, moving, elapsed) {
  const base = FACING_ANIMATION[direction] ?? FACING_ANIMATION.down;
  const index = moving ? base + 4 : base;
  const animation = metadata.animations[index] || metadata.animations[base] || metadata.animations[0];
  return animationFrame(animation.steps, elapsed);
}
export const battleAnimations = {
  ally: { idle: 0, attack: 3, skill: 9, guard: 4, hurt: 6, charge: 9, defeat: 8, victory: 0 },
  enemy: { idle: 0, attack: 2, hurt: 3, defeat: 4 }
};
// Original battle sheets have different native directions. Flip the image only.
const NATIVE_BATTLE_FACING = { linfy: 'left', nalan_da: 'left', gengml: 'left', mon2: 'left' };
export function battleFacingScale(sprite, side) {
  const native = NATIVE_BATTLE_FACING[sprite] || 'right';
  return native === (side === 'enemy' ? 'right' : 'left') ? 1 : -1;
}
export function battlePosition(side, index = 0) {
  return side === 'ally' ? [{ x: 73, y: 48 }, { x: 79, y: 64 }, { x: 85, y: 80 }][index] :
    { x: index ? 18 : 33, y: index ? 53 : 81 };
}
// Consecutive area hits share a cast; every actor finishes before the next starts.
export function battleSequence(events, action) {
  const groups = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && last.source === event.source) last.events.push(event);
    else groups.push({ source: event.source, events: [event] });
  }
  return groups.map(group => {
    const enemy = typeof group.source === 'number', damage = group.events.some(e => e.type === 'damage');
    const selfHit = group.events.every(e => e.target === 'hero' && e.type === 'damage' && !e.skill) && group.source === 'hero';
    const cast = !enemy && group.source !== 'burn' && group.source !== 'burn-enemy' && !selfHit &&
      (group.events.some(e => e.skill) || group.source === 'hero' && ['skill', 'sweep'].includes(action) && damage);
    const pose = cast ? 'skill' : group.events.every(e => e.type === 'break') ? 'hurt' :
      damage && !selfHit && !['burn','burn-enemy'].includes(group.source) ? 'attack' : group.source === 'lan' ? 'charge' : 'guard';
    const windup = enemy ? 500 : 0;
    const move = group.events.find(e => e.skill)?.skill;
    const charge = 0, duration = cast ? Math.max(400, move?.duration || 640) : damage ? 560 : 400;
    const impact = cast ? duration : 160;
    const recovery = 240;
    return { ...group, pose, cast, windup, charge, duration, impact, recovery };
  });
}
export function battleEventState(current, event) {
  const view = event.state;
  if (!view) return current;
  return { ...current, hp: view.hp, mp: view.mp, potions: view.potions, focus: view.focus,
    ...(view.companions ? { companions: view.companions.map(a => ({ ...a })) } : {}),
    attackBuff: view.attackBuff, defenseBuff: view.defenseBuff, pierce: view.pierce,
    ...(view.statuses ? { statuses: { ...view.statuses } } : {}),
    ...(view.antidotes !== undefined ? { antidotes: view.antidotes } : {}),
    enemies: current.enemies.map(enemy => ({ ...enemy, ...view.enemies.find(e => e.id === enemy.id) })) };
}
