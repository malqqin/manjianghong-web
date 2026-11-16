import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileStory,trackKeys,sampleTrack,layoutPoem,dialoguePages,programInstructions,groupTransitions} from '../story-presentation.js';
const read=name=>readFile(new URL('../assets/'+name+'.json',import.meta.url)).then(JSON.parse);
const story=await read('original-story'),native=await read('native-story');

test('Original length-delimited event programs and nested branches decode without executing conditions',()=>{
  let programs=0;
  for(const scene of Object.values(native.scenes))for(const program of scene.programs){
    assert.ok(programInstructions(program.code));programs++;
  }
  assert.ok(programs>100);
  const code=[1,0,3,7,21,0,0,11,11,0,1,0,2,7,19,0,0];
  assert.deepEqual(groupTransitions({programs:[{code}]},2),{before:[{action:21,parameter:0}],after:[{action:19,parameter:0}]});
});

test('Native presentation preserves every main and post-battle dialogue in its original order',()=>{
  let count=0;
  for(const step of story.steps)for(const lines of [step.lines,step.afterLines||[]]){
    const events=compileStory(lines,native),text=events.filter(e=>['dialogue','caption'].includes(e.kind));
    assert.deepEqual(text.map(e=>e.line),lines,step.title);
    assert.deepEqual(text.map(e=>e.checkpoint),lines.map((_,i)=>i+1));count+=text.length;
    for(const event of events)assert.ok(event.checkpoint>=0&&event.checkpoint<=lines.length);
  }
  assert.equal(count,1877);
});

test('Rainy cliff scene retains the original poem, blackout and reveal between dialogue lines',()=>{
  const step=story.steps.find(s=>s.lines.some(l=>l.source.scene==='s4'&&l.source.group===1));
  const events=compileStory(step.lines,native),poem=events.find(e=>e.action===15&&e.text.includes('风似箭'));
  assert.ok(poem);assert.equal(poem.parameter,1);assert.equal(poem.scene,'s4');assert.equal(poem.group,1);
  assert.equal(poem.text,native.scenes.s4.strings[77]);
  const i=events.indexOf(poem);
  assert.ok(events.slice(0,i).some(e=>e.line?.source.string===63));
  assert.ok(events.slice(i+1).some(e=>e.line?.source.string===64));
  assert.ok(events.some(e=>e.action===21&&e.parameter===0));assert.ok(events.some(e=>e.action===18));
  const closing=compileStory(story.steps[4].lines,native);
  assert.equal(closing.filter(e=>e.kind==='effect').at(-1).action,19);
});

test('Resuming a saved dialogue never repeats an earlier dialogue or changes its source reference',()=>{
  for(const step of story.steps.filter(s=>s.lines.length)){
    const offset=Math.floor(step.lines.length/2),events=compileStory(step.lines,native,offset);
    assert.deepEqual(events.filter(e=>e.line).map(e=>e.line),step.lines.slice(offset));
    assert.ok(events.every(e=>e.checkpoint>=offset));
  }
});

test('Scene actors interpolate positions while holding the current direction, visibility and animation',()=>{
  const track=[3,0,10,20,0x2004,-1,0,0,10,110,40,0x8005,-1,0,0];
  assert.equal(trackKeys(track).length,2);
  assert.deepEqual([sampleTrack(track,5).x,sampleTrack(track,5).y],[60,30]);
  assert.equal(sampleTrack(track,5).pose,4);assert.equal(sampleTrack(track,5).mirror,true);
  assert.equal(sampleTrack(track,5).visible,true);assert.equal(sampleTrack(track,10).visible,false);
  assert.equal(sampleTrack(track,20).x,110);assert.equal(sampleTrack(track,5).elapsed,400);
  for(const scene of Object.values(native.scenes))for(const group of scene.groups)for(const t of group){
    assert.ok(scene.actors[t[0]],scene.key);
    for(const k of trackKeys(t))assert.ok(Number.isFinite(sampleTrack(t,k.tick).x));
  }
});

test('Vertical poems reveal from the right, keep explicit columns, colors and overflow pages',()=>{
  const pages=layoutPoem('#EEE9BF风似箭|霏霏细雨',true,3,4);
  assert.deepEqual(pages[0].map(c=>[c.char,c.x,c.y]),[['风',2,0],['似',2,1],['箭',2,2],['霏',1,0],['霏',1,1],['细',1,2],['雨',1,3]]);
  assert.ok(pages[0].every(c=>c.color==='#EEE9BF'));
  assert.equal(layoutPoem('一二三四五六七八九',true,2,2).length,3);
  assert.deepEqual(layoutPoem('天地|山河',false,3,2)[0].map(c=>[c.char,c.x,c.y]),[['天',0,0],['地',1,0],['山',0,1],['河',1,1]]);
});

test('Two-line touch dialogue pagination preserves long Chinese text, punctuation and explicit breaks',()=>{
  for(const cols of [10,13,18,30])for(const text of [...story.steps.flatMap(s=>s.lines).map(l=>l.text),'一二三四五六七八九十|南宋\n金军#112233来袭']){
    const pages=dialoguePages(text,cols,2);
    assert.equal(pages.join('').replaceAll('\n',''),text.replace(/#[0-9a-f]{6}/gi,'').replace(/[|\n]/g,''));
    assert.ok(pages.every(p=>p.split('\n').length<=2&&p.split('\n').every(l=>l.length<=cols)));
  }
});
