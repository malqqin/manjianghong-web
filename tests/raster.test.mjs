import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteRegion } from '../raster.js';

test('Exploration, flight and original HD storms sample full frames at either texture resolution',()=>{
  assert.deepEqual(spriteRegion({width:2304,height:64},35),[2240,0,64,64]);
  assert.deepEqual(spriteRegion({width:9216,height:256},35),[8960,0,256,256]);
  assert.deepEqual(spriteRegion({width:2048,height:256},7),[1792,0,256,256]);
  assert.deepEqual(spriteRegion({width:2304,height:256},8),[2048,0,256,256]);
  assert.deepEqual(spriteRegion({width:256,height:256},9),[0,0,256,256]);
});
