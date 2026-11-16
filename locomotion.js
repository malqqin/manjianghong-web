import { facingDirection } from './presentation.js';

export function createTrail(points) {
  const trail = { points: [], distance: 0 };
  for (const point of points) recordTrail(trail, point);
  return trail;
}

export function recordTrail(trail, point, keep = 160) {
  const last = trail.points.at(-1);
  const delta = last ? Math.hypot(point.x-last.x, point.y-last.y) : 0;
  if (last && delta < .00001) return;
  trail.distance += delta;
  trail.points.push({ x:point.x, y:point.y, distance:trail.distance });
  while (trail.points.length > 2 && trail.points[1].distance < trail.distance-keep) trail.points.shift();
}

export function trailPoint(trail, distance) {
  const points=trail.points;
  if (distance<=points[0].distance) return points[0];
  for(let i=1;i<points.length;i++) {
    const right=points[i],left=points[i-1];
    if(distance>right.distance) continue;
    const t=(distance-left.distance)/(right.distance-left.distance);
    return { x:left.x+(right.x-left.x)*t, y:left.y+(right.y-left.y)*t };
  }
  return points.at(-1);
}

// Follow by travelled distance, interpolating inside each original path segment.
// Each person owns their progress and animation clock, including after the leader stops.
export function followTrail(trail, followers, speed, dt, spacing=16) {
  followers.forEach((follower,index)=>{
    const target=Math.max(trail.points[0].distance,trail.distance-spacing*(index+1));
    const remaining=Math.max(0,target-follower.distance);
    const travel=remaining<1e-7 ? 0 : Math.min(remaining,speed*dt);
    follower.distance=remaining<1e-7 ? target : follower.distance+travel;
    const point=trailPoint(trail,follower.distance);
    follower.direction=facingDirection(point.x-follower.x,point.y-follower.y,follower.direction);
    follower.moving=travel>.0001;
    follower.walkTime+=(travel/64)*1000;
    follower.x=point.x;follower.y=point.y;
  });
}

export function walkPath(actor,path,speed,dt,onAdvance=()=>{}) {
  let budget=speed*dt,moved=0;
  while(path.length && budget>.00001) {
    const point=path[0],x=point.x*16+8,y=point.y*16+8,dx=x-actor.x,dy=y-actor.y,distance=Math.hypot(dx,dy);
    if(distance<.00001) {path.shift();continue;}
    actor.direction=facingDirection(dx,dy,actor.direction);
    const travel=Math.min(distance,budget);
    actor.x+=dx/distance*travel;actor.y+=dy/distance*travel;budget-=travel;moved+=travel;
    if(distance<=travel) {actor.x=x;actor.y=y;path.shift();}
    onAdvance(actor);
  }
  actor.walkTime+=(moved/64)*1000;
  return moved;
}

export function cameraPosition(player,map,view) {
  const width=view.w/view.zoom,height=view.h/view.zoom;
  return {x:Math.max(0,Math.min(player.x-width*.5,Math.max(0,map.width*16-width))),
    y:Math.max(0,Math.min(player.y-height*.53,Math.max(0,map.height*16-height)))};
}

// Commit a scene only when its complete image is decoded; newer requests win.
export function sceneLoader(load,commit) {
  let revision=0;
  return async (...args)=>{
    const request=++revision;
    await load(...args);
    if(request!==revision) return false;
    commit(...args);return true;
  };
}
