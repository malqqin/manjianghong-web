import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrail,recordTrail,trailPoint,followTrail,walkPath,cameraPosition,sceneLoader } from '../locomotion.js';

function walkers(trail) {
  return [16,32].map(gap=>{const distance=trail.distance-gap,p=trailPoint(trail,distance);
    return {...p,distance,direction:'right',moving:false,walkTime:0};});
}
test('Two followers interpolate every movement frame without threshold jumps, at different frame rates',()=>{
  const results=[];
  for(const hz of [30,60,120]) {
    const trail=createTrail([{x:0,y:0},{x:32,y:0}]),followers=walkers(trail);
    for(let frame=1;frame<=hz;frame++) {
      const previous=followers.map(f=>({...f}));
      recordTrail(trail,{x:32+64*frame/hz,y:0});followTrail(trail,followers,64,1/hz);
      followers.forEach((f,i)=>{
        assert.ok(f.x>previous[i].x,'every moving frame advances each follower');
        assert.ok(Math.hypot(f.x-previous[i].x,f.y-previous[i].y)<=64/hz+.00001,'bounded speed, no snaps');
        assert.ok(f.walkTime>previous[i].walkTime);
      });
    }
    results.push(followers.map(f=>Math.round(f.x)));
    assert.ok(Math.abs(followers[0].x-followers[1].x-16)<.00001,'second follower has independent path progress');
    const clocks=followers.map(f=>f.walkTime);
    followTrail(trail,followers,64,1/hz);
    assert.ok(followers.every(f=>!f.moving),'stop without walking in place');
    assert.deepEqual(followers.map(f=>f.walkTime),clocks);
  }
  assert.deepEqual(results,[[80,64],[80,64],[80,64]]);
});

test('Followers turn along the original path rather than cutting the corner or sharing one offset',()=>{
  const trail=createTrail([{x:0,y:0},{x:32,y:0}]),followers=walkers(trail);
  for(let i=1;i<=48;i++) {
    const player=i<=16?{x:32+i,y:0}:{x:48,y:i-16};recordTrail(trail,player);followTrail(trail,followers,64,1/64);
    for(const f of followers) assert.ok(f.y===0 || f.x===48,'must remain on the walked polyline');
  }
  assert.deepEqual(followers.map(f=>({x:f.x,y:f.y,direction:f.direction})),[
    {x:48,y:16,direction:'down'},{x:48,y:0,direction:'right'}]);
  for(let i=49;i<1000;i++) recordTrail(trail,{x:48,y:i});
  assert.ok(trail.points.length<165,'history stays bounded on long walks');
});

test('Walking carries remaining frame distance across grid anchors instead of pausing at each tile',()=>{
  const actor={x:8,y:8,direction:'right',walkTime:0},path=[{x:0,y:0},{x:1,y:0},{x:1,y:1}];
  const trail=createTrail([actor]);
  assert.equal(walkPath(actor,path,64,.3,p=>recordTrail(trail,p)),19.2);
  assert.ok(Math.abs(actor.y-11.2)<.00001);assert.equal(actor.x,24);assert.equal(actor.direction,'down');
  assert.equal(actor.walkTime,300);assert.equal(path.length,1);
  assert.deepEqual(trail.points.map(p=>[p.x,p.y]),[[8,8],[24,8],[24,11.2]]);
});

test('Scene switch waits for the decoded map and ignores stale loads; camera starts exactly on its final target',async()=>{
  const ready=new Map(),commits=[];
  const change=sceneLoader(id=>new Promise(resolve=>ready.set(id,resolve)),id=>commits.push(id));
  const first=change(4);assert.deepEqual(commits,[],'old scene remains until load completes');
  const second=change(19);ready.get(19)();assert.equal(await second,true);assert.deepEqual(commits,[19]);
  ready.get(4)();assert.equal(await first,false);assert.deepEqual(commits,[19],'late old request cannot rewind scene');
  const target=cameraPosition({x:600,y:500},{width:80,height:80},{w:390,h:700,zoom:2.5});
  assert.deepEqual(target,{x:522,y:351.6});
  assert.deepEqual(cameraPosition({x:0,y:0},{width:10,height:10},{w:390,h:700,zoom:2.5}),{x:0,y:0});
});
