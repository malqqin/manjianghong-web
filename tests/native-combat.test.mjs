import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { skillSets } from '../skills.js';
import { nativeDuration, drawNativeFrame } from '../native-effects.js';
import { animationFrame, battleAnimations, battleSequence } from '../presentation.js';
const metadata=JSON.parse(await readFile(new URL('../assets/native-combat.json',import.meta.url)));
const source=JSON.parse(await readFile(new URL('../assets/combat-skills-source.json',import.meta.url)));

test('All selectable skills use the original target/caster animation pair and first-rank MP cost',()=>{
  for(const skill of Object.values(skillSets).flat()) {
    const record=source.skills[skill.sourceIndex];
    assert.equal(record.name,skill.name);assert.equal(record['d.r'],skill.r);assert.equal(record['d.s'],skill.s);
    assert.equal(Math.abs(record['d.aShorts'][2]),skill.cost);
    assert.ok(nativeDuration(metadata.sprites.currency,skill.r)>0);
  }
});
test('Native battle frames decode packed indices and hold idle poses for the original 80ms ticks',()=>{
  assert.equal(metadata.tickMs,80);
  assert.deepEqual(metadata.sprites.linfy.animations[0].steps,[[0,5],[1,5]]);
  const steps=metadata.sprites.linfy.animations[0].steps;
  assert.equal(animationFrame(steps,399,80),0);assert.equal(animationFrame(steps,400,80),1);
  assert.equal(battleAnimations.ally.attack,3);assert.equal(battleAnimations.ally.skill,9);
  assert.equal(nativeDuration(metadata.sprites.currency,13),560);
  for(const sprite of Object.values(metadata.sprites)) {
    for(const frame of sprite.frames) for(const [part,flags] of frame) {
      assert.ok(part<sprite.parts.length);assert.ok(flags>=0 && flags<=3);
    }
    for(const animation of sprite.animations) for(const [frame,ticks] of animation.steps) {
      assert.ok(frame<sprite.frames.length);assert.ok(ticks>0);
    }
  }
});
test('Composite effects retain original part anchoring and individual mirror flags',()=>{
  const draws=[],transforms=[];
  const context={save(){},restore(){},translate(x,y){transforms.push(['translate',x,y]);},scale(x,y){transforms.push(['scale',x,y]);},drawImage(...args){draws.push(args.slice(1));}};
  const sprite={sourceWidth:20,parts:[[0,0,4,5]],frames:[[[0,1,7,-10]]]};
  drawNativeFrame(context,{width:80},sprite,0,100,200,2,false);
  assert.deepEqual(transforms,[['translate',114,180],['scale',-2,2]]);
  assert.deepEqual(draws[0],[0,0,16,20,0,0,4,5]);
  const plan=battleSequence([{source:'fei',target:1,type:'status',skill:{...skillSets.fei[1],duration:880}}],'skill')[0];
  assert.equal(plan.charge,0);assert.equal(plan.impact,880,'hit status follows the complete native animation');
});
