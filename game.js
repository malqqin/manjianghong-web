import { SAVE_KEY, clamp, walkable, component, nearestTile, findPath, newGame, validateSave, maxHP, maxMP, encounters, createBattle, battleTurn, intent } from './core.js';
import {advanceFieldActor} from './field-motion.js';
import { chapters, places, characters, entities as rawEntities, objectives, visibleEntity } from './world.js';
import { facingDirection, rasterActorFrame, animationFrame, battleAnimations, battleEventState, battleFacingScale, battlePosition, battleSequence } from './presentation.js';
import { touchingEncounter, touchesRect } from './encounters.js';
import { skillSets, nativeSkill, partyNames } from './skills.js';
import { learnedSkills } from './skills.js';
import { characterStats, actorLevel, learnedIndices, gainExperience, experienceRequired, learnManual } from './progression.js';
import { characterRules } from './character-rules.js';
import { originalRules } from './original-rules.js';
import { addItem, applyItem, itemRecord } from './items.js';
import { equipmentAvailable, removeEquipment } from './inventory.js';
import { openBag, openNativeShop } from './bag.js';
import { inventoryArt, supplyArt } from './inventory-art.js';
import { originalItemDrops } from './journey.js';
import { partyActors, availableActors, blockedByStatus } from './tactical.js';
import { NativeBattleEffects, nativeDuration, drawNativeFrame } from './native-effects.js';
import { scenePortals, routeExit, evaluateCondition, sceneEncounters, encounterAvailable } from './exploration.js';
import { storyStage, scenePrograms,nativeContactRects, executeNative, sceneActorLayout, mainCheckpoint } from './native-events.js';
import { trackKeys, compileGroup } from './story-presentation.js';
import { NativeStoryPlayer } from './story-player.js';
import { spriteRegion } from './raster.js';
import { createTrail, recordTrail, trailPoint, followTrail, walkPath, cameraPosition, sceneLoader, viewportZoom } from './locomotion.js';
import { STORY_COUNT, chapterNames, equipment, originalState, journeyObjective, advanceJourney, flightPath, journeyEncounter, canFly, grantEquipment, battleRewards } from './journey.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const canvas = $('#world'), ctx = canvas.getContext('2d');
const images = new Map(), maps = new Map(), tiles = new Map();
let sprites, battleSprites, entities, state = newGame(), saved = null, started = false, loaded = false;
let originalStory, storyBattleDone = null;
let nativeCombat, combatEffects, storyPlayer;
const hd = name => `assets/native/${name}.png`;
// Keep the editable source portraits for the hero, Mu Fei and Geng Jing.
// Story dialogue also reads these files directly from the original scene data.
const portraitNames = { lan: 'lan', boss: 'boss', li: 'li', lin: 'lin', general: 'general' };
for (const [id, c] of Object.entries(characters)) if (portraitNames[id]) c.portrait = `native/portrait-${portraitNames[id]}.png`;
Object.assign(characters, {
  li: { name: '完颜羽诚', portrait: 'native/portrait-li.png', role: '流浪剑客' },
  lin: { name: '林梓玥', portrait: 'native/portrait-lin.png', role: '故人' },
  general: { name: '金兀术', portrait: 'native/portrait-general.png', role: '金军大将' }
});
characters.hero.role = '长枪少年'; characters.fei.role = '双环女侠'; characters.lan.role = '兰氏郡主'; characters.boss.name = '厉天渡';
characters.lan.name = '兰芷萱';
function objective() { return state.journey ? journeyObjective(state, originalStory.steps) : objectives[state.stage]; }
function currentChapter() { return state.journey ? `${['一','二','三','四','五','六'][objective().chapter - 1]} · ${chapterNames[objective().chapter - 1]}` : chapters[state.stage]; }
function members() { return state.journey ? state.journey.members : state.party ? ['lan'] : []; }
let mainGoalCache = null;
let portalGraph={},nativeEntityCache=null,nativeScriptRunning=false;const stageCache=new Map();
function currentSceneKey(){return objective().map===state.map?objective().scene:state.journey?.scene&&storyPlayer.data.scenes[state.journey.scene]?.map===state.map?state.journey.scene:Object.keys(storyPlayer.data.scenes).find(key=>storyPlayer.data.scenes[key].map===state.map);}
function nativeVariables(){const j=state.journey,index=j.index;if(!stageCache.has(index))stageCache.set(index,index===63?52:storyStage(storyPlayer.data,originalStory.steps,index));const stage=j.nativeStageIndex===index?j.nativeVars?.[0]??stageCache.get(index):stageCache.get(index);return {...(j.nativeVars||{}),0:stage};}
function checkpointTarget(){const checkpoint=mainCheckpoint(state.journey?.index,nativeVariables()[0]);return checkpoint&&checkpoint.scene===currentSceneKey()?`native-npc-${checkpoint.scene}-${checkpoint.actorIndex}`:null;}
function mapExits(){return (portalGraph[currentSceneKey()]||[]).filter(e=>evaluateCondition(e.condition,nativeVariables(),{0:5,1:e.markerSprite,2:e.actorIndex,15:1})).map(e=>{if(!e.snapped){Object.assign(e,nearestTile(tiles.get(state.map),e.x,e.y),{map:state.map,snapped:true});}return e;});}
function nativeExploreEntities(){
 const key=currentSceneKey(),vars=nativeVariables(),cacheKey=key+':'+state.journey.index+':'+JSON.stringify(vars);
 if(nativeEntityCache?.key===cacheKey)return nativeEntityCache.entities;
 if(!storyPlayer.data.scenes[key])return [];
 const scene=storyPlayer.data.scenes[key],actors=sceneActorLayout(storyPlayer.data,key,vars,state.journey.nativeActors?.[key]),list=[...mapExits(),...sceneEncounters(storyPlayer.data,key,actors).map(e=>({...e,...nearestTile(tiles.get(state.map),e.x,e.y)}))];
 for(const [index,a]of actors.entries()){
  if(!(a.flags&4))continue;
  const p=nearestTile(tiles.get(state.map),(a.x-8)/16,(a.y-8)/16),common={...p,map:state.map,sprite:a.sprite,nativeActor:a,actorIndex:index,scene:key};
  if([39,40].includes(a.sprite)){list.push({...common,id:`native-chest-${key}-${index}`,kind:'chest',name:a.extra[2]?'上锁藏箱':'藏箱',scripted:scenePrograms(storyPlayer.data,key,index,vars,originalStory.steps).length>0,locked:!!a.extra[2],nativeItem:a.extra[0]===0?null:a.extra[1],loot:a.extra[0]===0?'arm-'+a.extra[1]:null});continue;}
  if(![5,6,7,12,13,14,15,16,20,22,44,45,46].includes(a.sprite))continue;
  const programs=scenePrograms(storyPlayer.data,key,index,vars,originalStory.steps);if(!programs.length)continue;
  const text=programs.flatMap(p=>p.items).find(i=>[13,14].includes(i.action)),name=text?(scene.strings[text.args[3]]||'').replace(/#[a-f\d]{6}/gi,'').match(/^([^：:“”]{1,8})[：:]/)?.[1]:null;
  const contactRects=a.sprite===22?[4,5].flatMap(event=>scenePrograms(storyPlayer.data,key,index,vars,originalStory.steps,event).length?nativeContactRects(a,[event]):[]):[];
  const rect=contactRects[0],contact=!!rect;
  const point=rect?nearestTile(tiles.get(state.map),(rect.x+rect.width/2-8)/16,(rect.y+rect.height/2-8)/16):p;
  list.push({...common,...point,id:`native-npc-${key}-${index}`,kind:'native-npc',contact,contactRects,discovery:[20,22].includes(a.sprite),sprite:a.sprite===22?undefined:a.sprite,name:name||([20,22].includes(a.sprite)?'探查':[44,45,46].includes(a.sprite)?'机关':'江湖人')});
 }
 nativeEntityCache={key:cacheKey,entities:list};return list;
}
function originalEntities() {
  const list = nativeExploreEntities().filter(e=>e.kind!=='encounter'||encounterAvailable(e,state.journey.clearedEncounters,state.journey.fieldClock||0));
  const q = objective();
  if (q.target && q.map === state.map&&!checkpointTarget()) {
    if (mainGoalCache?.index !== state.journey.index) {
      const p = nearestTile(tiles.get(state.map), q.x, q.y);
      const speaker = q.lines.find(line => !['hero','story'].includes(line.who))?.who;
      mainGoalCache = { ...p, index: state.journey.index, id: 'main-goal', map: state.map, name: q.title, kind: 'story', contact: q.kind === 'battle', windVariant: 1, sprite: q.kind === 'battle' ? 17 : ({ fei: 1, lan: 2, geng: 27, boss: 9, li: 7, lin: 2, general: 27 })[speaker] };
    }
    list.push(mainGoalCache);
  }
  return list;
}
let player = { x: 280, y: 168, direction: 'down', walkTime:0 }, path = [], pendingInteraction = null, destination = null;
let camera = { x: 0, y: 0 }, view = { w: 1, h: 1, zoom: 2.5, dpr: 1 };
let followers = [], followPath = createTrail([player]), followerKey = '', scenePending = false;
let sceneRequest = 0;
const actorAnimations = new Map();
let combatSequence = 0;
let encounterGraceUntil = 0, suppressedEncounter = null, battlePhase = '';
let dialogue = null, activeSheet = null, battle = null, battleBusy = false, selectedEnemy = 0;
let previousTime = performance.now(), animTime = 0, saveTimer, toastTimer, lastSave = 0, guideActive = false;
let sheetReturnFocus, sheetDismiss = null;
let settings = { sound: false, fast: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
try {
 settings={...settings,...JSON.parse(localStorage.getItem('mjh-settings')||'{}')};
 const raw=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');saved=validateSave(raw);
 if(saved&&raw.journey&&(raw.journey.rulesVersion||0)<2&&!localStorage.getItem('mjh-before-original-rules-v2'))localStorage.setItem('mjh-before-original-rules-v2',JSON.stringify(raw));
} catch {}

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3300);
}
function remember(text) {
  if (!state.journal.includes(text)) state.journal.push(text);
}
function saveGame(immediate = false) {
  if (!started || battle) return;
  clearTimeout(saveTimer);
  const write = () => {
    const safe = nearestTile(tiles.get(state.map), Math.round((player.x - 8) / 16), Math.round((player.y - 8) / 16));
    state.tile = { ...safe }; state.updated = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); $('#save-state').textContent = '已记下此程'; lastSave = performance.now(); }
    catch { $('#save-state').textContent = '存档空间不足'; toast('自动存档未能写入，请到设置导出存档。'); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 350);
}
function applySettings() {
  $('#sound-button').innerHTML = `音<span>${settings.sound ? '开' : '关'}</span>`;
  $('#sound-button').setAttribute('aria-label', settings.sound ? '关闭声音' : '开启声音');
  localStorage.setItem('mjh-settings', JSON.stringify(settings));
  if (settings.sound && started) music.start(); else music.stop();
}
const music = {
  context: null, timer: null, step: 0,
  start() {
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      this.context.resume(); if (this.timer) return;
      const notes = [220, 261.63, 293.66, 329.63, 392, 329.63, 293.66, 261.63, 196, 220, 293.66, 261.63];
      const play = () => {
        if (!settings.sound || document.hidden) return;
        const now = this.context.currentTime, osc = this.context.createOscillator(), gain = this.context.createGain();
        osc.type = 'sine'; osc.frequency.value = notes[this.step++ % notes.length] * (battle ? 1 : .5);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.045, now + .04);
        gain.gain.exponentialRampToValueAtTime(.001, now + 1.6); osc.connect(gain).connect(this.context.destination);
        osc.start(); osc.stop(now + 1.7);
      }; play(); this.timer = setInterval(play, 880);
    } catch { settings.sound = false; }
  },
  stop() { clearInterval(this.timer); this.timer = null; },
  hit() {
    if (!settings.sound || !this.context) return;
    const now = this.context.currentTime, osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.frequency.setValueAtTime(240, now); osc.frequency.exponentialRampToValueAtTime(60, now + .12);
    gain.gain.setValueAtTime(.07, now); gain.gain.exponentialRampToValueAtTime(.001, now + .15);
    osc.connect(gain).connect(this.context.destination); osc.start(); osc.stop(now + .16);
  }
};
function resize() {
  const rect = canvas.getBoundingClientRect();
  const map=maps.get(state.map),base=rect.width<760?2:3;
  const fullViewport=matchMedia('(max-width:760px), (max-height:550px), (pointer:coarse)').matches;
  view = { w: rect.width, h: rect.height, zoom: map?viewportZoom(rect.width,rect.height,map.width*16,map.height*16,fullViewport):base, fullViewport, dpr: Math.min(devicePixelRatio || 1, 2) };
  canvas.width = Math.round(rect.width * view.dpr); canvas.height = Math.round(rect.height * view.dpr);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  resizeBattle();
}
function resizeBattle(){
  if(!battle)return;
  const board=$('#battle-scene').getBoundingClientRect();
  $('#battle-scene').style.setProperty('--actor-scale',String(Math.max(.85,Math.min(2.15,Math.min(board.width/210,board.height/250)))));
}
function currentEntities() { return state.journey ? originalEntities() : entities.filter(e => e.map === state.map && visibleEntity(e, state)); }
function actorFrame(id, direction = 'down', moving = false, elapsed = animTime) { return [39,40,43].includes(id) ? 0 : rasterActorFrame(direction, moving, elapsed); }
function resetFollowers() {
  const ids=members();followerKey=ids.join(',');
  const ground=tiles.get(state.map), chain=[nearestTile(ground,(player.x-8)/16,(player.y-8)/16)];
  const behind=({up:[0,1],down:[0,-1],left:[1,0],right:[-1,0]})[player.direction];
  const spacing=state.journey?.flying?28:16;
  for(let i=0;i<ids.length*(state.journey?.flying?2:1);i++) {
    const last=chain.at(-1), choices=ground.filter(p=>Math.abs(p.x-last.x)+Math.abs(p.y-last.y)===1 && !chain.some(q=>p.x===q.x && p.y===q.y));
    chain.push(nearestTile(choices,last.x+behind[0],last.y+behind[1]) || last);
  }
  followPath=createTrail(chain.reverse().map(p=>({x:p.x*16+8,y:p.y*16+8})));
  recordTrail(followPath,player);
  followers=ids.map((id,index)=>{
    const distance=Math.max(0,followPath.distance-(index+1)*spacing),point=trailPoint(followPath,distance);
    return {id,sprite:id==='fei'?1:2,x:point.x,y:point.y,distance,direction:player.direction,moving:false,walkTime:0};
  });
}
function stopFollowers() { followers.forEach(f=>f.moving=false); }
function drawSprite(id, frame, x, y) {
  const image = images.get(`sprite-${id}.png`);
  if (image) ctx.drawImage(image, ...spriteRegion(image, frame), x-32, y-50, 64, 64);
}
function objectiveHere() {
  const objective = state.journey ? journeyObjective(state, originalStory.steps) : objectives[state.stage];
  if(state.journey&&checkpointTarget())return checkpointTarget();
  if (objective.map === undefined || objective.map === state.map) return objective.target;
  if (state.journey) return routeExit(portalGraph,currentSceneKey(),objective.scene)?.id||null;
  const route = {
    12: { 0: 'maple-gate', 4: 'maple-gate', 19: 'camp-gate' },
    0: { 4: 'cave-gate', 12: 'home-gate', 19: 'home-gate' },
    4: { 0: 'cave-return', 12: state.stage >= 4 ? 'shortcut' : 'cave-return', 19: 'shortcut' },
    19: { 12: 'camp-return', 0: 'camp-return', 4: 'camp-return' }
  };
  return route[state.map]?.[objective.map];
}
function drawWorld() {
  if (!loaded) return;
  if(storyPlayer?.stage&&(storyPlayer.running||nativeScriptRunning)){storyPlayer.draw(ctx,view);return;}
  const { w, h, zoom, dpr } = view, map = maps.get(state.map);
  const vw = w / zoom, vh = h / zoom;
  const desired = performance.now() < panUntil && !path.length ? pan : cameraPosition(player,map,view);
  camera.x += (desired.x - camera.x) * .13; camera.y += (desired.y - camera.y) * .13;
  if (settings.reducedMotion) camera = desired;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#294a3c'; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-Math.round(camera.x * zoom) / zoom, -Math.round(camera.y * zoom) / zoom);
  const background = images.get(`map-${state.map}.png`);
  if (background) ctx.drawImage(background, 0, 0, map.width * 16, map.height * 16);
  if (destination) {
    drawGroundMark(destination.x*16+8,destination.y*16+8,true);
  }
  path.forEach((p, i) => {ctx.save();ctx.fillStyle=i%3===Math.floor(animTime/180)%3?'#fffbed':'#ffde73';ctx.shadowColor='#ffcd4b';ctx.shadowBlur=6;ctx.beginPath();ctx.arc(p.x*16+8,p.y*16+8,2.8/zoom,0,Math.PI*2);ctx.fill();ctx.restore();});
  const visible = currentEntities();
  for(const e of visible.filter(e=>e.discovery||e.id==='main-goal'))drawGroundMark(e.x*16+8,e.y*16+8,e.id===objectiveHere());
  for (const e of visible.filter(e => e.kind === 'portal')) {
    const x = e.x * 16 + 8, y = e.y * 16 + 8;
    if(state.journey){
      drawGroundMark(x,y,e.id===objectiveHere());
      const meta=storyPlayer.data.sprites[e.markerSprite],image=images.get('original-'+meta?.source);
      if(meta&&image&&e.markerSprite===20){const steps=meta.animations[e.markerAnimation]?.steps||meta.animations[0].steps;drawNativeFrame(ctx,image,meta,animationFrame(steps,animTime,80),x,y-8,1.25);}
      continue;
    }
    ctx.fillStyle = '#f9ef9c44'; ctx.beginPath(); ctx.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff2a3aa'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    ctx.fillStyle = '#fff3b9'; ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.fillText('⌃', x, y + Math.sin(animTime / 250) - 2);
  }
  const actors = visible.filter(e => e.sprite !== undefined && e.kind !== 'herb').map(e => ({ ...e, px: e.x * 16 + 8, py: e.y * 16 + 8 }));
  actors.push({ id: 'player', sprite: 0, px: player.x, py: player.y });
  for(const follower of followers) actors.push({id:'companion-'+follower.id,sprite:follower.sprite,px:follower.x,py:follower.y,follower});
  actors.sort((a, b) => a.py - b.py);
  for (const actor of actors) {
    if (actor.kind !== 'chest' && actor.kind !== 'herb') { ctx.fillStyle = '#233c3455'; ctx.beginPath(); ctx.ellipse(actor.px, actor.py - 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    const frame = actor.sprite === 17 ? animationFrame(sprites[17].animations[actor.windVariant || 0].steps, settings.reducedMotion ? 0 : animTime, 24) : actor.id === 'player' ? actorFrame(0, player.direction, path.length > 0 && !dialogue && !activeSheet && !scenePending,player.walkTime) :
      actor.follower ? actorFrame(actor.sprite, actor.follower.direction, actor.follower.moving && !dialogue && !activeSheet && !scenePending,actor.follower.walkTime) : actor.kind === 'chest' ? (state.flags[actor.id] ? 1 : 0) : actorFrame(actor.sprite, actor.direction);
    const flying = state.journey?.flying && (actor.id === 'player' || actor.follower);
    if (flying) {
      const direction={up:0,down:1,left:2,right:3}[actor.follower?.direction || player.direction];
      const flightFrame=direction*2+(settings.reducedMotion?0:Math.floor(animTime/640)%2);
      const texture=images.get('flight-'+actor.sprite+'.png');
      if(texture)ctx.drawImage(texture,...spriteRegion(texture,flightFrame),actor.px-32,actor.py-50,64,64);
    } else if(actor.nativeActor){const meta=storyPlayer.data.sprites[actor.sprite],image=images.get('original-'+meta.source),animation=actor.kind==='chest'?(state.flags[actor.id]?0:1):actor.nativeActor.animation,steps=meta.animations[animation]?.steps||meta.animations[0].steps;if(image)drawNativeFrame(ctx,image,meta,animationFrame(steps,animTime,80),actor.px,actor.py,1);}
    else drawSprite(actor.sprite, frame, actor.px, actor.py);
  }
  for (const e of visible.filter(e => e.kind === 'herb')) ctx.drawImage(images.get('flower.png'), e.x * 16 - 4, e.y * 16 - 17, 24, 28);
  // Labels use screen pixels so they stay readable at any map zoom.
  ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const goal = objectiveHere();
  for (const e of visible) {
    delete e.hit;
    const sx = (e.x * 16 + 8 - camera.x) * zoom, sy = (e.y * 16 + 8 - camera.y) * zoom;
    if (sx < -70 || sx > w + 70 || sy < 0 || sy > h + 90) continue;
    const current = e.id === goal, opened = e.kind === 'chest' && state.flags[e.id];
    let label = e.name;
    if (opened) label += ' · 已取';
    ctx.font = `${current ? 'bold ' : ''}11px "Microsoft YaHei",sans-serif`;
    const textWidth = ctx.measureText(label).width, bw = textWidth + (current ? 28 : 16);
    const labelY = sy - (e.sprite === 17 ? 88 : e.kind === 'portal' || e.kind === 'chest' ? 28 : 63);
    ctx.fillStyle = current ? '#f3e4b5f5' : '#183c31df';
    ctx.fillRect(Math.round(sx - bw / 2), Math.round(labelY), bw, 24);
    if (current) { ctx.fillStyle = '#a6603c'; ctx.fillRect(sx - bw / 2, labelY, 3, 24); }
    ctx.fillStyle = current ? '#5c5431' : opened ? '#b1c29c' : '#f1eacc'; ctx.textAlign = 'center';
    ctx.fillText((current ? '◆ ' : '') + label, sx, labelY + 16);
    e.hit = { x: sx, y: sy, labelY, width: bw };
  }
  const gradient = ctx.createLinearGradient(0, h - 90, 0, h); gradient.addColorStop(0, '#153a2700'); gradient.addColorStop(1, '#153a2755');
  ctx.fillStyle = gradient; ctx.fillRect(0, h - 90, w, 90);
}
function drawGroundMark(x,y,active=false){
  ctx.save();const pulse=settings.reducedMotion?0:Math.sin(animTime/260),r=active?13:10;
  ctx.translate(x,y);ctx.shadowColor=active?'#ffcf48':'#7ce4f5';ctx.shadowBlur=active?12:7;ctx.strokeStyle=active?'#fff1a8':'#9af5fb';ctx.lineWidth=1.4/view.zoom;
  for(let i=0;i<2;i++){ctx.globalAlpha=i?.45:1;ctx.beginPath();ctx.ellipse(0,0,r+i*3+pulse,4+i*2,0,0,Math.PI*2);ctx.stroke();}
  ctx.globalAlpha=.9;ctx.fillStyle=active?'#fff6bc':'#ceffff';ctx.beginPath();ctx.arc(0,-2,2/view.zoom,0,Math.PI*2);ctx.fill();ctx.restore();
}
function step(dt) {
  if(storyPlayer?.running)return;
  if(nativeScriptRunning)return;
  if (!started || dialogue || battle || activeSheet || scenePending || document.hidden) return;
  if(followerKey!==members().join(',')) resetFollowers();
  state.playtime += dt;
  if(state.journey){
    const j=state.journey;
    // Migrate old wall-clock cooldowns once, preserving which enemies were cleared.
    if(j.fieldClock===undefined){j.fieldClock=0;for(const id of Object.keys(j.clearedEncounters||{}))j.clearedEncounters[id]=0;}
    j.fieldClock+=dt*1000;
  }
  if(state.journey)for(const e of currentEntities())if(e.kind==='encounter')advanceFieldActor(e,player,dt,(x,y)=>walkable(maps.get(state.map),Math.floor(x/16),Math.floor(y/16)),{flying:state.journey.flying});
  if (checkEncounterContact()) return;
  const walkingSpeed = state.journey?.flying ? 125 : settings.fast ? 94 : 64;
  const spacing=state.journey?.flying?28:16;
  if (!path.length) { followTrail(followPath,followers,walkingSpeed,dt,spacing); return; }
  walkPath(player,path,walkingSpeed,dt,point=>recordTrail(followPath,point));
  followTrail(followPath,followers,walkingSpeed,dt,spacing);
  if (checkEncounterContact()) return;
  if (!path.length) {
    destination = null; saveGame();
    const entity = pendingInteraction; pendingInteraction = null;
    if (entity) interact(entity);
  }
}
function checkEncounterContact() {
  if (!state.journey || performance.now() < encounterGraceUntil) return false;
  const nearby = currentEntities();
  const exit=nearby.find(e=>e.kind==='portal'&&Math.hypot(player.x-(e.x*16+8),player.y-(e.y*16+8))<10);
  if(exit){path=[];destination=null;pendingInteraction=null;interactOriginal(exit);return true;}
  const suppressed = nearby.find(e => e.id === suppressedEncounter);
  const rects=suppressed?.contactRects||[],distance=rects.length?
    Math.min(...rects.map(rect=>Math.hypot(player.x-clamp(player.x,rect.x,rect.x+rect.width),player.y-clamp(player.y,rect.y,rect.y+rect.height)))):
    suppressed?Math.hypot(player.x-(suppressed.x*16+8),player.y-(suppressed.y*16+8)):Infinity;
  if(distance>36)suppressedEncounter=null;
  const enemy = touchingEncounter(player, nearby, { flying: state.journey.flying, suppressed: suppressedEncounter });
  if (!enemy) return false;
  suppressedEncounter = enemy.id; path = []; destination = null; pendingInteraction = null; stopFollowers();
  interact(enemy.contactRects?.length?{...enemy,triggerEvent:enemy.contactRects.find(rect=>touchesRect(player,rect))?.event}:enemy); return true;
}
function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, .05); previousTime = now; animTime += dt * 1000;
  step(dt); syncGuideUI(); if (!battle && !scenePending && !document.hidden) drawWorld();
  if (battle && !document.hidden) updateBattleAnimations(now);
  if (started && !battle && now - lastSave > 25000) saveGame(true);
  requestAnimationFrame(frame);
}
function moveTo(tile, entity = null) {
  panUntil = 0;
  const start = path.length ? { ...path[0] } : nearestTile(tiles.get(state.map), Math.round((player.x - 8) / 16), Math.round((player.y - 8) / 16));
  let end = nearestTile(tiles.get(state.map), tile.x, tile.y);
  if (entity && entity.kind !== 'portal') {
    const adjacent = tiles.get(state.map).filter(p => Math.abs(p.x - entity.x) + Math.abs(p.y - entity.y) === 1);
    end = nearestTile(adjacent, start.x, start.y) || end;
  }
  const route = state.journey?.flying ? flightPath(maps.get(state.map), start, entity ? end : tile) : findPath(maps.get(state.map), start, end);
  pendingInteraction = entity; destination = end;
  // Finish at the current grid anchor before changing direction.
  path = [{ ...start }, ...route];
  $('#map-tip').style.opacity = '.5';
}
function sceneClick(event) {
  if(storyPlayer?.running)return;
  if(nativeScriptRunning)return;
  if (!started || activeSheet || battle || dialogue || scenePending) return;
  const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
  const candidates = currentEntities().map(e => {
    const hit = e.hit; if (!hit) return null;
    const onLabel = Math.abs(x - hit.x) <= hit.width / 2 + 8 && y >= hit.labelY - 5 && y <= hit.labelY + 29;
    const distance = Math.hypot(x - hit.x, y - (hit.y - 25));
    return onLabel || distance < 35 ? { e, distance: onLabel ? 0 : distance } : null;
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  guideActive = false;
  if (candidates.length) { const e = candidates[0].e; moveTo(e, e); }
  else moveTo({ x: (x / view.zoom + camera.x - 8) / 16, y: (y / view.zoom + camera.y - 8) / 16 });
}
const commitScene=sceneLoader(ensureMap,(mapId,spawn)=>{
  panUntil = 0;
  encounterGraceUntil = performance.now() + 1500;
  state.map = mapId;
  resize();
  if (state.journey && !state.journey.visited.includes(mapId)) state.journey.visited.push(mapId);
  const source = spawn || places[mapId].spawn, tile = nearestTile(tiles.get(mapId), source[0], source[1]);
  state.tile = { ...tile }; player.x = tile.x * 16 + 8; player.y = tile.y * 16 + 8;
  resetFollowers();
  path = []; destination = null; pendingInteraction = null;
  camera = cameraPosition(player,maps.get(mapId),view);
  renderHUD(); saveGame(true);
  drawWorld();
});
async function transition(mapId,spawn) {
  const request=++sceneRequest;
  scenePending=true;path=[];destination=null;pendingInteraction=null;stopFollowers();
  try {
    const committed=await commitScene(mapId,spawn);
    if(committed && guideActive) requestAnimationFrame(guide);
  } catch { guideActive=false; }
  finally { if(request===sceneRequest) scenePending=false; }
}
function renderHUD() {
  if(followerKey!==members().join(',')) resetFollowers();
  const q = objective(), place = places[state.map];
  $('#place-name').textContent = state.journey ? originalStory.scenes.find(s => s.map === state.map)?.name || place.name : place.name; $('#chapter-name').textContent = currentChapter();
  $('#scene-mood').textContent = state.journey ? ['西风卷红叶，山道有行人。','夜色沉沉，故人自远方来。','汴京灯火，照见人间心事。','山雨欲来，长枪破云。','古冢无声，忠魂未远。','花叶永不相见，缘注定生死。'][q.chapter-1] : place.mood;
  $('#quest-title').textContent = $('#mobile-quest-title').textContent = q.title;
  $('#quest-text').textContent = $('#mobile-quest-text').textContent = q.text;
  $('#quest-number').textContent = state.journey ? `${Math.min(state.journey.index + 1, STORY_COUNT)} / ${STORY_COUNT}` : ['壹', '壹', '贰', '贰', '叁', '肆', '终', '终'][state.stage];
  guidePresentationKey = ''; syncGuideUI();
  $('#flight-button').classList.toggle('hidden', !canFly(state));
  $('#flight-button').textContent = state.journey?.flying ? '落地 ↓' : '御剑 ↑';
  $('#map-tip span:last-child').textContent = state.journey ? '点地面行走 · 接触旋风遇敌' : '点地面行走 · 点人物交谈';
  $('#hero-level').textContent = `${state.level} 阶`;
  $('#hero-hp').style.width = `${state.hp / maxHP(state) * 100}%`;
  $('#hero-hp-text').textContent = `${state.hp} / ${maxHP(state)}`;
  $('#party-sidebar').innerHTML = ['hero', ...members()].map(id => {
    const c = characters[id]; return `<div class="party-mini"><img src="assets/${c.portrait}" alt="${c.name}"><div><strong>${c.name}</strong><small>${c.role}</small></div><span class="party-state">${id === 'hero' ? (state.journey ? '执枪' : '执剑') : '同行'}</span></div>`;
  }).join('');
}
let guidePresentationKey = '';
function syncGuideUI() {
  const guiding = !!(started && guideActive && !dialogue && !battle && !storyPlayer?.running && (path.length || scenePending));
  const ending = !!state.journey?.completed, legacy = !state.journey && state.stage === 7;
  const key = `${guiding}:${ending}:${legacy}`;
  if (key === guidePresentationKey) return;
  guidePresentationKey = key;
  $('#app').classList.toggle('is-guiding', guiding);
  $('#guide-button').innerHTML = `${ending ? '重温终章' : legacy ? '进入原作主线' : guiding ? '正在循迹' : '引路'} <span aria-hidden="true">↗</span>`;
  $('.quest-guide').textContent = ending ? '终章' : legacy ? '主线' : guiding ? '止步' : '引路';
  $('#mobile-quest').setAttribute('aria-label',guiding?'停止引路':`引路：${objective().title}`);
  $('.guide-note').textContent = guiding ? '正在循线前往 · 点地图可改道' : '循线而行，点地图可自由改道';
}
function guide() {
  if(storyPlayer?.running)return;
  if(nativeScriptRunning)return;
  if (!started || dialogue || battle || scenePending) return;
  if (state.journey) {
    closeSheet(); if (state.journey.completed) return originalEnding();
    guideActive = true; const q = objective();
    if (q.map !== state.map){const graph={...portalGraph,[currentSceneKey()]:mapExits()},exit=routeExit(graph,currentSceneKey(),q.scene);if(exit){const target=currentEntities().find(e=>e.id===exit.id);if(target){toast(`循路前往 · ${target.name}`);return moveTo(target,target);}}return transition(q.map);}
    const target = currentEntities().find(e => e.id === (checkpointTarget()||'main-goal'));
    if (!target) { guideActive = false; return toast('线索正在展开，请稍候再试。'); }
    toast(`循迹前往 · ${q.title}`); return moveTo(target, target);
  }
  if (state.stage === 7) return legacyBridge();
  closeSheet(); guideActive = true;
  const target = entities.find(e => e.id === objectiveHere());
  if (!target) return;
  toast(`循迹前往 · ${target.name}`); moveTo(target, target);
}
function setStage(stage, entry) {
  state.stage = stage; if (entry) remember(entry); guideActive = false; renderHUD(); saveGame();
}
function say(lines, onEnd = () => {}) {
  if(storyPlayer&&!lines.some(line=>line.choices))return playStory(lines,onEnd);
  path = []; pendingInteraction = null; destination = null; stopFollowers();
  dialogue = { lines, index: 0, onEnd };
  $('#app').classList.add('dialogue-open');
  $('#dialogue').classList.remove('hidden'); renderDialogue();
}
function playStory(lines,onEnd=()=>{},offset=0,base=null) {
  path=[];pendingInteraction=null;destination=null;guideActive=false;stopFollowers();
  const enriched=lines.map(line=>({...line,portrait:line.portrait||characters[line.who]?.portrait}));
  return storyPlayer.run(enriched,{offset,checkpoint:value=>{
    if(base!==null){state.journey.line=base+value;saveGame(true);}
  },complete:()=>{renderHUD();drawWorld();onEnd();}}).catch(error=>{
    console.error('Story presentation failed',error);toast('剧情演出加载失败，可点引路重试。');
  });
}
function renderDialogue() {
  const line = dialogue.lines[dialogue.index], c = characters[line.who || 'story'];
  const narration=!c.portrait;
  $('#dialogue').classList.toggle('narration',narration);
  $('#dialogue-context').textContent=narration?'山河纪事':state.journey?objective().title:'江湖话叙';
  $('#dialogue-role').textContent=(!line.speaker || line.speaker===c.name)?c.role:'';
  $('#dialogue-name').textContent = line.speaker || c.name; $('#dialogue-text').textContent = line.text;
  const portrait = $('#dialogue-portrait'); $('#dialogue-portrait-frame').classList.toggle('hidden',narration);
  if (c.portrait) { portrait.src = `assets/${c.portrait}`; portrait.alt = line.speaker || c.name; }
  $('#dialogue-count').textContent = `${String(dialogue.index + 1).padStart(2, '0')} / ${String(dialogue.lines.length).padStart(2, '0')}`;
  $('.dialogue-body').scrollTop=0;
  $('#dialogue-choices').replaceChildren();
  $('#dialogue-next').classList.toggle('hidden', !!line.choices);
  if (line.choices) for (const choice of line.choices) {
    const button = document.createElement('button'); button.textContent = choice.text;
    button.onclick = () => { choice.effect?.(); advanceDialogue(); }; $('#dialogue-choices').append(button);
  }
}
function advanceDialogue() {
  if(storyPlayer?.running){storyPlayer.advance();return;}
  if (!dialogue) return;
  dialogue.index++;
  if (state.journey && dialogue.storyOffset !== undefined) { state.journey.line = dialogue.storyOffset + dialogue.index; saveGame(true); }
  if (dialogue.index < dialogue.lines.length) renderDialogue();
  else { const end = dialogue.onEnd; dialogue = null; $('#dialogue').classList.add('hidden'); $('#app').classList.remove('dialogue-open'); renderHUD(); saveGame(); end(); }
}
function beginOriginalJourney() {
  const old = structuredClone(state);
  if (started && !old.journey) localStorage.setItem('mjh-legacy-backup-v1', JSON.stringify(old));
  forceCloseSheet(); mainGoalCache = null;
  state = originalState(newGame());
  state.coins = Math.max(state.coins, old.coins || 0); state.potions = Math.max(state.potions, old.potions || 0);
  started = true; $('#title-screen').classList.add('hidden');
  transition(0); remember('凤凰山上，少年凌飞云提枪下山。原作六章主线由此开始。');
  toast('原作主线已开启 · 点引路前往凤凰山');
}
function legacyBridge() {
  guideActive = false; path = []; pendingInteraction = null;
  openSheet('原作江湖 · 重新启程', `<p>你已走完旧版的四幕改编试玩。原作六章主线现在可以进入，故事从凤凰山开始，沿汴京、紫云山、衣冠冢一直走到「花与莲」。</p><p>旧试玩进度会自动另存。银两与药品可带入主线。</p><button class="primary-button" id="enter-original">进入原作主线 <span>→</span></button><div class="button-row"><button class="secondary-button" id="stay-legacy">留在旧篇回访</button></div>`, '旧篇已完成 · 后续入口');
  $('#enter-original').onclick = beginOriginalJourney; $('#stay-legacy').onclick = closeSheet;
}
function completeOriginalStep() {
  const title = objective().title;
  const previousItems=new Set(state.journey.owned), flightWasKnown=canFly(state);
  if (!advanceJourney(state, originalStory.steps)) return;
  remember(`【${currentChapter()}】${title} · 已完成`);
  guideActive = false; mainGoalCache = null; renderHUD(); saveGame(true);
  if (state.journey.completed) return originalEnding();
  const gifts=state.journey.owned.filter(id=>!previousItems.has(id)).map(id=>({id,count:1,fresh:true}));
  if(gifts.length) return showTreasure(gifts,!flightWasKnown&&canFly(state)?'御剑之术已习得':'故人相赠',title);
  toast(`下一程 · ${objective().title}`);
}
function playOriginalStep() {
  const q = objective(), index = state.journey.index;
  if (!q.target) return originalEnding();
  const after = () => {
    const lines = q.afterLines || [], offset = Math.max(0, state.journey.line - q.lines.length);
    if (offset >= lines.length) {
      completeOriginalStep();
      // ss9 program 0 continues directly into the gun-location dialogue after victory.
      if(q.scene==='ss9'&&q.battleTeams?.[0]===43&&objective().title==='沥泉神枪的下落')return playOriginalStep();
      return;
    }
    playStory(lines,completeOriginalStep,offset,q.lines.length);
  };
  if (state.journey.afterBattle === index) return after();
  const next = () => {
    if (state.journey.index !== index) return;
    if (q.kind === 'battle') {
      const wave=state.journey.battleWave||0,id = `original-${index}-${wave}`; encounters[id] = journeyEncounter(q, state, q.enemy, wave);
      storyBattleDone = () => {
        if(wave+1<(q.battleTeams?.length||1)) {
          state.journey.battleWave=wave+1;saveGame(true);
          if(q.betweenBattles&&wave===0)return say(q.betweenBattles,next);
          return next();
        }
        delete state.journey.battleWave;state.journey.afterBattle = index; state.journey.line = q.lines.length; saveGame(true); after();
      };
      beginBattle(id, wave===0?q.battleParty:null);
    } else after();
  };
  const offset = Math.min(state.journey.line, q.lines.length);
  if (offset >= q.lines.length) return next();
  playStory(q.lines,next,offset,0);
}
function interactOriginal(e) {
  if(e.kind==='native-npc'||e.scripted){
    if(e.contact)suppressedEncounter=e.id;
    return runNativeInteraction(e);
  }
  if(e.kind==='portal'){
    const q=objective(),next=originalStory.steps[state.journey.index+1];
    if(q.kind==='travel'&&q.map===state.map&&next&&routeExit(portalGraph,currentSceneKey(),next.scene)?.id===e.id){advanceJourney(state,originalStory.steps);mainGoalCache=null;}
    state.journey.scene=e.toScene;
    return transition(e.to,e.spawn);
  }
  guideActive = false;
  if (e.contact && e.id !== 'main-goal' && state.journey.flying) return toast('御剑时不会触发敌人。点「落地」后可交锋。');
  if (e.contact) suppressedEncounter = e.id;
  if (e.id === 'main-goal') return playOriginalStep();
  if (e.kind === 'encounter') {
    const id = `field-${e.id}`;
    const team=e.teams[Math.floor(Math.random()*e.teams.length)];
    const fight = journeyEncounter({ title: `${e.name} · 山道遭遇`, map: state.map,scene:e.scene,battleTeams:[team] }, state);
    encounters[id] = fight;
    state.journey.clearedEncounters||={};state.journey.clearedEncounters[e.id]=state.journey.fieldClock||0;
    storyBattleDone = () => { remember(`击散${e.name}，山路恢复平静。`); saveGame(true); toast(e.respawn?'敌群已散 · 稍后会重新出现':'敌群已散'); };
    suppressedEncounter = e.id;
    return beginBattle(id);
  }
  if (e.kind === 'chest') {
    if (state.flags[e.id]) return toast('箱中已空，物品已收入行囊。');
    if(e.locked&&!state.journey.lockpick)return promptNative('尚未学会妙手空空，是否学习？',['学习妙手空空','暂且离开']).then(answer=>{if(answer===0){state.journey.lockpick=true;remember('领悟妙手空空，可开启上锁藏箱。');saveGame();interactOriginal(e);}});
    if(e.nativeItem!=null){state.flags[e.id]=true;addItem(state,e.nativeItem);const item=itemRecord(e.nativeItem);saveGame(true);return say([{text:`打开藏箱，获得${item.name}。${item.description}`}]);}
    if(e.loot){state.flags[e.id]=true;const fresh=grantEquipment(state,e.loot);remember(`打开藏箱，获得${equipment[e.loot].name}。`);saveGame(true);return showTreasure([{id:e.loot,count:1,fresh}],equipment[e.loot].rarity==='神兵'?'神兵入手':'藏箱得宝',places[state.map].name);}
    return toast('箱中已空。');
  }
}
function promptNative(title,options,cancelValue=options.length-1){
  return new Promise(resolve=>{
    openSheet(title,`<div class="native-menu-list">${options.map((text,i)=>`<button data-native-answer="${i}">${escapeHTML(text)}</button>`).join('')}</div>`,'江湖抉择');
    sheetDismiss=()=>resolve(cancelValue);
    $$('[data-native-answer]').forEach(b=>b.onclick=()=>{sheetDismiss=null;closeSheet();resolve(Number(b.dataset.nativeAnswer));});
  });
}
function nativeShop(kind,shopIndex) {
 return openNativeShop(state,{openSheet,closeSheet,saveGame,toast,onDismiss:callback=>{sheetDismiss=callback;}},kind,shopIndex);
}
async function runNativeInteraction(entity){
 if(nativeScriptRunning)return;nativeScriptRunning=true;guideActive=false;path=[];pendingInteraction=null;destination=null;stopFollowers();
  const key=entity.scene,scene=storyPlayer.data.scenes[key],variables=nativeVariables(),startingIndex=state.journey.index;
 const actorOverrides=()=>{state.journey.nativeActors||={};return state.journey.nativeActors[key]||={};};
 const updateActor=(index,value)=>{actorOverrides()[index]={...actorOverrides()[index],...value};nativeEntityCache=null;};
 const dialogueAt=(index,action=13,parameter=0)=>new Promise(resolve=>{
  const text=scene.strings[index]||'',actor=scene.actors[parameter],meta=storyPlayer.data.sprites[actor?.sprite],portrait=meta?.source.includes('touxiang')?meta.source:undefined;
  say([{text,action,parameter,portrait}],resolve);
 });
 const originalFight=team=>new Promise(resolve=>{const id='native-'+key+'-'+team;encounters[id]=journeyEncounter({title:entity.name,map:state.map,battleTeams:[team]},state);storyBattleDone=(won=true)=>resolve(won);beginBattle(id);});
 const handlers={
   dialogue:dialogueAt,
   group:async group=>{
    await storyPlayer.run([],{events:compileGroup(storyPlayer.data,key,group)});
    for(const track of scene.groups[group]||[]){const end=trackKeys(track).at(-1);if(!end)continue;const actor=scene.actors[track[0]];updateActor(track[0],{x:end.x,y:end.y,animation:end.animation&255,flags:end.animation&0x4000?actor.flags&~4:actor.flags|12});}
   },
   actor:async(action,index,animation,x,y)=>{
    const actor=scene.actors[index];if(action===49){for(const [index,a]of scene.actors.entries())if(a.flags&0x100)updateActor(index,{flags:a.flags&~4});return;}
    if(!actor)return;if(action===7||action===9)updateActor(index,{x,y,animation,flags:actor.flags|12});if(action===8)updateActor(index,{animation,flags:actor.flags|12});if(action===10)updateActor(index,{flags:actor.flags&~4});
   },
   effect:async(action,parameter,extra)=>{const previous=storyPlayer.stage;if(!previous)storyPlayer.stage={key:key+':script',scene,tracks:[],tick:0};try{await storyPlayer.effect({action,parameter:action===17?extra:parameter,track:action===16||action===17?parameter:null});}finally{storyPlayer.stage=previous;}},
   gameOver:async index=>{await dialogueAt(index);state.hp=maxHP(state);state.mp=maxMP(state);state.journey.partyVitals={};},
   travel:async(index,x,y)=>{const target=storyPlayer.data.scenes[Object.keys(storyPlayer.data.scenes)[index]];if(target?.map!==36){state.journey.scene=Object.keys(storyPlayer.data.scenes)[index];await transition(target.map,x>=0&&y>=0?[(x-8)/16,(y-8)/16]:undefined);}},
   choice:indices=>promptNative(entity.name,indices.map(i=>scene.strings[i]||'继续')),
   confirm:async index=>(await promptNative(scene.strings[index]||'是否继续？',['是','否']))===0,
   inventory:(type,index)=>type===0?equipmentAvailable(state,'arm-'+index):state.journey.items?.[index]||0,
   grant:async(type,index,count)=>{if(type===0){const id='arm-'+index,fresh=grantEquipment(state,id,{count});if(!equipment[id])return;await new Promise(resolve=>{showTreasure([{id,count,fresh}],'获得宝物',entity.name);sheetDismiss=resolve;$('#treasure-confirm').onclick=()=>closeSheet();});}else{addItem(state,index,count);await new Promise(resolve=>say([{text:`获得${itemRecord(index).name} ×${count}`}],resolve));}},
   remove:(type,index)=>{if(type===0)removeEquipment(state,'arm-'+index);else if(state.journey.items?.[index]>0)state.journey.items[index]--;},
   experience:(index,amount)=>{const actors=index===-1?['hero',...members()]:[['hero','fei','lan'][index]].filter(Boolean);gainExperience(state,amount,actors);},
   teach:(index,skill)=>{const id=['hero',...members()][index];if(!id)return 0;const old=learnedIndices(state,id).find(n=>Math.floor(n/4)===Math.floor(skill/4));if(old>=skill)return 0;state.journey.learned||={};state.journey.learned[id]||=[];state.journey.learned[id].push(skill);return 1;},
   battle:originalFight,
   journal:index=>remember((scene.strings[index]||'').replace(/#[a-f\d]{6}/gi,'')),
   rest:()=>{state.hp=maxHP(state);state.mp=maxMP(state);state.journey.partyVitals={};},
   party:(index,add)=>{const id=['hero','fei','lan'][index];if(!id||id==='hero')return;state.journey.members=add?[...new Set([...members(),id])]:members().filter(a=>a!==id);},
   learn:async skill=>{if(state.journey[skill])return true;const yes=(await promptNative(skill==='lockpick'?'尚未学会妙手空空，是否学习？':'尚未学会高级御剑飞行，是否学习？',['学习','暂不学习']))===0;if(yes)state.journey[skill]=true;return yes;},
   money:amount=>{if(state.coins+amount<0)return false;state.coins+=amount;return true;},
   shop:nativeShop,
   document:async index=>dialogueAt(index),
   cg:async(index,text)=>{await new Promise(resolve=>{openSheet('江湖奇珍',`<img class="ending-art" src="assets/${scene.strings[index].replace(/^\//,'')}" alt="江湖奇珍"><p>${escapeHTML(scene.strings[text]||'')}</p><button class="primary-button" id="native-cg-confirm">继续</button>`);sheetDismiss=resolve;$('#native-cg-confirm').onclick=()=>closeSheet();});},
   challenge:async(cost,team)=>{const yes=await promptNative(`花费${cost}银挑战训练师，全体获得${cost*2}点经验，是否挑战？`,['挑战','离开']);if(yes!==0)return false;if(state.coins<cost){toast('银两不足。');return false;}state.coins-=cost;gainExperience(state,cost*2);await originalFight(team);return true;}
 };
 try{
  state.journey.nativeVars=variables;
  const programs=scenePrograms(storyPlayer.data,key,entity.actorIndex,variables,originalStory.steps,entity.triggerEvent??null);
  if(programs.length)await executeNative(programs[0].items,{variables,system:{0:entity.triggerEvent??programs[0].events.find(event=>event===4||event===5),1:entity.nativeActor.sprite,2:entity.actorIndex,15:1},handlers});
  state.journey.nativeVars={...variables};state.journey.nativeStageIndex=startingIndex;renderHUD();saveGame(true);
 }catch(error){console.error(error);toast('这段事件未能完成，请重新交谈。');}
 finally{nativeScriptRunning=false;nativeEntityCache=null;}
}
function originalEnding() {
  guideActive = false;
  openSheet('花与莲 · 终', `<img class="ending-art" src="${hd('landscape-snow')}" alt="昆仑山路"><h3 class="ending-title">花叶永不相见</h3><p class="ending-copy">为救沐霏，飞云将踏上昆仑望仙崖。千年雪莲能解天下奇毒，却会让服下它的人忘记心中最爱的人。烽烟、旧恨与未尽的情缘，终于归入这一问。</p><p class="ending-copy">彼岸花，开一千年，落一千年。花叶永不相见，情不为因果，缘注定生死。</p><div class="ending-tags"><span>六章主线已完成</span><span>${STORY_COUNT} 个剧情节点</span><span>终章已保存</span></div><button class="primary-button" id="ending-revisit">回访江湖</button><div class="button-row"><button class="secondary-button" id="ending-record">查看行侠录</button></div>`, '满江红二 · 铁骑红颜');
  $('#ending-revisit').onclick = closeSheet;
  $('#ending-record').onclick = () => showOriginalJournal();
}
function treasureCards(loot) {
  return loot.map(({id,count=1})=>{const item=equipment[id];return `<article class="treasure-card ${item.rarity==='神兵'?'rare':''}"><div class="treasure-art"><img src="${inventoryArt(item)}" alt="${item.name}"></div><div><small>${escapeHTML(item.rarity||'装备')} · 收入行囊</small><h3>${escapeHTML(item.name)} <span>×${count}</span></h3><p>${escapeHTML(item.description)}</p></div></article>`;}).join('');
}
function showTreasure(loot,title='获得宝物',source='',supplies='') {
  openSheet(title,`<div class="treasure-intro">${loot.some(x=>equipment[x.id].rarity==='神兵')?'金石有灵 · 神兵得主':'行囊添珍 · 江湖有缘'}</div>${treasureCards(loot)}${supplies?`<p class="treasure-supplies">${escapeHTML(supplies)}</p>`:''}<button id="treasure-confirm" class="primary-button">收好 · 继续前行</button>`,source,'treasure');
  $('#treasure-confirm').onclick=closeSheet;
}
function originalBag(title='行囊') {
 return openBag(state,{openSheet,toast,renderHUD,saveGame,prompt:promptNative,characters:originalCharacters},title);
}
function originalCharacters(id='hero',tab='attributes') {
  const ids=['hero',...members()],stats=characterStats(state,id),level=actorLevel(state,id),vitals=id==='hero'?state:state.journey.partyVitals?.[id]||{},hp=vitals.hp??stats.maxHP,mp=vitals.mp??stats.maxMP;
  const known=learnedSkills(state,id),knownIndices=learnedIndices(state,id),actorIndex=['hero','fei','lan'].indexOf(id),slots=id==='hero'?state.journey.equipped:state.journey.companionEquipment?.[id]||{};
  const attributes=[['生命',`${hp} / ${stats.maxHP}`],['精气',`${mp} / ${stats.maxMP}`],['攻击',`${stats.attackMin}—${stats.attackMax}`],['防御',stats.defense],['命中',stats.hit+'%'],['闪避',stats.dodge.toFixed(2)+'%'],['暴击',stats.critical.toFixed(2)+'%'],['减伤',stats.reduction+'%'],['冰冻抗性',stats.resistance[0]+'%'],['灼烧抗性',stats.resistance[1]+'%'],['混乱抗性',stats.resistance[2]+'%'],['怒气',`${id==='hero'?state.journey.rage||0:vitals.rage||0} / ${stats.rage}`]];
  const locked=skillSets[id].filter(s=>!known.some(k=>k.id===s.id)).map(s=>({...s,at:characterRules.autoLearn[actorIndex].indexOf(s.sourceIndex)}));
  const skillRows=known.map(s=>`<article class="learned-skill"><div><strong>${escapeHTML(s.name)}${s.sourceIndex<56?' · '+s.rank+'重':''}</strong><small>${s.passive?'被动':s.rageCost?'怒气 '+s.rageCost:'精气 '+s.cost}</small></div><p>${escapeHTML(s.description)}</p>${s.sourceIndex<56&&s.rank<4?`<p>下一重：${characterRules.minimumLevels[s.sourceIndex+1]}级 · 研习对应秘籍</p>`:''}</article>`).join('')+locked.map(s=>`<article class="learned-skill locked"><div><strong>${s.name}</strong><small>${s.at}级习得</small></div><p>${s.description}</p></article>`).join('');
  const manuals=Object.entries(state.journey.items||{}).filter(([n,count])=>count>0&&n>=17&&n<=72).map(([n,count])=>`<div class="manual-row"><img class="manual-icon" src="${supplyArt(Number(n))}" alt=""><div><strong>${escapeHTML(originalRules.items[n].name)} ×${count}</strong><p>${escapeHTML(originalRules.items[n].description)}</p></div><button data-study="${n}">研习</button></div>`).join('');
  openSheet('人物',`<div class="character-tabs" role="tablist">${ids.map(a=>`<button data-character="${a}" role="tab" aria-selected="${a===id}">${partyNames[a]}</button>`).join('')}</div><div class="character-heading"><img src="assets/${characters[id].portrait}" alt="${partyNames[id]}"><div><h3>${partyNames[id]}</h3><p>${level}级 · ${characters[id].role}</p><p>阅历 ${id==='hero'?state.xp:state.journey.actorXP?.[id]||0} / ${experienceRequired(level)===Infinity?'已满级':experienceRequired(level)}</p></div></div><div class="character-tabs"><button data-character-tab="attributes" aria-selected="${tab==='attributes'}">属性装备</button><button data-character-tab="skills" aria-selected="${tab==='skills'}">武功秘籍</button></div>${tab==='attributes'?`<div class="attribute-grid">${attributes.map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('')}</div><h3>随身装备</h3><div class="character-gear">${Object.entries({weapon:'武器',armor:'衣甲',bracer:'护腕',ring:'戒指',jade:'玉佩'}).map(([slot,label])=>`<div><small>${label}</small>${equipment[slots?.[slot]]?.name||'未装备'}</div>`).join('')}</div><button id="character-bag" class="secondary-button">整理行囊</button>`:`${skillRows}<h3>随身秘籍</h3>${manuals||'<p>暂无秘籍。探索藏箱、战胜敌人或拜访商人可以取得。</p>'}`}`,'人物属性 · 武功 · 装备');
  $$('[data-character]').forEach(b=>b.onclick=()=>originalCharacters(b.dataset.character,tab));
  $$('[data-character-tab]').forEach(b=>b.onclick=()=>originalCharacters(id,b.dataset.characterTab));
  $$('[data-study]').forEach(b=>b.onclick=()=>{const result=learnManual(state,id,Number(b.dataset.study));toast(result.message);if(result.ok){renderHUD();saveGame();originalCharacters(id,tab);}});
  $('#character-bag')?.addEventListener('click',()=>originalBag());
}
function showOriginalJournal() {
  const j = state.journey, q = objective();
  openSheet('行侠录', `<div class="wallet"><span>${currentChapter()}</span><span>${Math.min(j.index + 1, STORY_COUNT)} / ${STORY_COUNT}</span></div><h3>${q.title}</h3><p>${q.text}</p><button class="secondary-button" id="original-journal-guide">${j.completed ? '重温终章' : '前往当前目标'} ↗</button><h3>六章行迹</h3>${chapterNames.map((title, i) => {
    const chapterSteps = originalStory.steps.map((s, index) => ({ ...s, index })).filter(s => s.chapter === i + 1);
    const done = chapterSteps.filter(s => s.index < j.index).length;
    return `<details class="chapter-record" ${q.chapter === i+1 ? 'open' : ''}><summary>第${i+1}章 · ${title} <small>${done}/${chapterSteps.length}</small></summary>${chapterSteps.map(s => `<button data-replay="${s.index}" ${s.index >= j.index ? 'disabled' : ''}>${s.index < j.index ? '✓' : '○'} ${s.title}</button>`).join('')}</details>`;
  }).join('')}<h3>旅途记录</h3>${state.journal.slice(-20).reverse().map(t=>`<p class="journal-entry">${escapeHTML(t)}</p>`).join('')}`, '点已完成章节，回看对白与剧情演出');
  $('#original-journal-guide').onclick = guide;
  $$('[data-replay]').forEach(button => button.onclick = () => {
    const s = originalStory.steps[Number(button.dataset.replay)]; closeSheet();
    playStory(s.lines.length ? s.lines : [{ text: s.title }]);
  });
}

function interact(e) {
  player.direction = facingDirection(e.x * 16 + 8 - player.x, e.y * 16 + 8 - player.y, player.direction);
  e.direction = facingDirection(player.x - (e.x * 16 + 8), player.y - (e.y * 16 + 8), e.direction);
  stopFollowers();
  if (state.journey) return interactOriginal(e);
  if (e.kind === 'portal') {
    if (e.id === 'maple-gate' && state.stage === 0) return say([{ who: 'hero', text: '出发之前，先向耿大哥问问沐霏的伤势。' }]);
    if (e.id === 'cave-gate' && state.stage < 3) return say([{ who: 'lan', text: '山口被金军封住了。先料理那队斥候，再去采药。' }]);
    const spawns = { 'home-gate': [18, 27], 'cave-return': [12, 3], 'shortcut': [23, 11], 'camp-return': [29, 10] };
    transition(e.to, spawns[e.id]); return;
  }
  guideActive = false;
  if (e.kind === 'chest') {
    if (state.flags[e.id]) return toast('箱中已空，收获已经放进行囊。');
    state.flags[e.id] = true; state.potions += 2; state.coins += 35;
    if (e.id === 'maple-chest') { state.flags.intel = true; remember('在枫林军匣中发现布防图：金军营地东侧有缺口。决战时可削弱敌军。'); }
    remember(`打开${e.name}，获得金疮药 ×2、银两 ×35。`);
    toast(e.id === 'maple-chest' ? '获得金疮药 ×2、银两 ×35、金军布防图' : '获得金疮药 ×2、银两 ×35'); saveGame(); return;
  }
  if (e.id === 'geng') {
    if (state.stage === 0) return say([
      { who: 'geng', text: '飞云，沐霏替义军送信，中了金军的寒毒。她口中一直念着你。' },
      { who: 'hero', text: '可有解毒的办法？便是刀山火海，我也去。' },
      { who: 'geng', text: '栖霞山彼岸洞里，有一味花能解此毒。可山路已被金军封锁。纳兰姑娘熟悉那条路，去枫林找她。' },
      { who: 'geng', text: '记住，救人是大事，也莫把同行的人丢在风雨里。' }
    ], () => setStage(1, '沐霏身中寒毒。耿京托我去栖霞山寻彼岸花，先在十里枫林与纳兰芷萱会合。'));
    if (state.stage === 6) return chooseEnding();
    if (state.stage === 7) return say([{ who: 'geng', text: '乱世里能全身而退，也护得住身边人，已是极难得的侠义。去吧，江湖总有再见的时候。' }]);
    return say([{ who: 'geng', text: state.stage >= 5 ? '营地在江北。准备妥当后，从别院东口渡江。我在这里等你们平安归来。' : '山路虽险，莫急着赶路。药箱里还有些金疮药，带在身上。' }]);
  }
  if (e.id === 'fei') {
    if (state.stage === 4) return say([
      { who: 'fei', text: '我梦见枫叶落了好几回……你终于回来了。芷萱姑娘，也谢谢你。' },
      { who: 'lan', text: '花是飞云取的。至于照顾他这一路的糊涂事，日后再慢慢算。' },
      { who: 'hero', text: '药在这里，人也都在。往后，谁也不许独自逞强。' },
      { who: 'fei', text: '我截下的密信里说，铁骑今夜渡江。别为我耽误了正事。等你们回来，我煮一壶新茶。' }
    ], () => { state.hp = maxHP(state); state.mp = maxMP(state); state.potions++; setStage(5, '彼岸花解开了寒毒。沐霏无恙，并带来金军渡江的密报。芷萱与我决定夜袭营地。'); toast('全队休整完毕 · 金疮药 +1'); });
    if (state.stage >= 5) {
      state.hp = maxHP(state); state.mp = maxMP(state); renderHUD(); saveGame();
      return say([{ who: 'fei', text: '伤口该换药了。别动，坐一会儿。江湖再大，也总该有个能安心歇脚的地方。' }]);
    }
    return say([{ who: 'fei', text: '别担心我……窗外的荷花还没谢，我想和你一起看。路上小心。' }]);
  }
  if (e.id === 'lan') {
    if (state.stage === 1) return say([
      { who: 'lan', text: '凌少侠，又见面了。你这副神色，想必不是专程来看枫叶的。' },
      { who: 'hero', text: '沐霏中了寒毒。我需要进彼岸洞，可耿大哥说，只有你认得路。' },
      { who: 'lan', text: '若我说这条路凶险，而我的来历也未必清白，你还愿意跟我走？', choices: [
        { text: '我信眼前的你。我们一起去，也一起回来。', effect: () => { state.bond += 2; remember('我选择相信芷萱：来处可以不同，此刻的心意不假。'); } },
        { text: '来历可以慢慢说，眼下救人要紧。', effect: () => { state.bond++; remember('我与芷萱暂放疑虑，约定先救沐霏。'); } }
      ] },
      { who: 'lan', text: '那就说定了。前面有金军斥候，别硬接他们的蓄力招。我替你照看背后。' }
    ], () => { state.party = true; resetFollowers(); setStage(2, '纳兰芷萱加入队伍。她认得进洞的路，也愿意把背后交给我。'); toast('纳兰芷萱 · 加入同行'); });
    return say([{ who: 'lan', text: state.stage < 1 ? '别院还有人等你的消息，去见见耿京吧。' : '我在呢。往前走，不必总回头。' }]);
  }
  if (e.id === 'patrol') {
    if (state.stage < 2) return say([{ who: 'hero', text: '斥候有两人，先与芷萱会合再出手。' }]);
    return say([{ who: 'lan', text: '看他们的架势。第三回合会有重击，凝神防御，或用惊鸿一剑打断。出手吧！' }], () => beginBattle('patrol'));
  }
  if (e.id === 'herb') {
    if (state.stage < 3) return toast('先与芷萱击退枫林的斥候。');
    return say([
      { who: 'lan', text: '就是这株花。传闻服药的人会失去最深的记忆……可传闻，未必就是药方。' },
      { who: 'hero', text: '那就把花带回去，一起找出真正的解法。救一个人，不该以忘掉另一个人为代价。' },
      { who: 'lan', text: '嘘，洞口有人！看来这朵花，还得再借一回你的剑。' }
    ], () => beginBattle('cave'));
  }
  if (e.id === 'prisoner') return say([
    { who: 'story', text: '营帐后的乡民被缚住双手。他认出你腰间义军的剑穗，眼中才有了光。' },
    { who: 'hero', text: '沿西侧山道走，有人接应。别回头，今夜就回家。' },
    { who: 'lan', text: '他们的牢门钥匙上，还系着库房的封条。拿上吧，救人也得有盘缠。' }
  ], () => { state.flags.rescued = true; state.coins += 60; state.potions++; remember('我解救了营地的乡民。所谓山河，不过是无数个有人等归的家。'); saveGame(); toast('乡民获救 · 银两 +60 · 金疮药 +1'); });
  if (e.id === 'boss') return say([
    { who: 'boss', text: '两个无名小辈，也敢闯我的铁骑营？' },
    { who: 'hero', text: '名字不必记。记得今后，别再把刀指向无辜的人。' },
    { who: 'lan', text: state.flags.intel ? '布防图在手，东侧的伏兵已被引开。飞云，破他中军！' : '我断他的后路，你来正面破阵。小心统领的蓄力重击！' }
  ], () => beginBattle('boss'));
}

function beginBattle(id, fightingMembers = null) {
  clearTimeout(toastTimer);$('#toast').classList.remove('show');
  if (state.journey?.flying) { state.journey.flying = false; renderHUD(); }
  clearTimeout(saveTimer); saveGame(true);
  combatSequence++; stopBattleAnimations();
  const combatState = fightingMembers && state.journey ? { ...state, journey: { ...state.journey, members: fightingMembers } } : state;
  battle = createBattle(id, combatState); battleBusy = false; selectedEnemy = 0; battlePhase = '';
  path = []; destination = null; pendingInteraction = null; stopFollowers();
  $('#battle-outcome').classList.remove('show'); $('#battle-fx').replaceChildren();
  $('#app').classList.add('battle-mode'); $('#battle').classList.remove('hidden');
  $('#battle-title').textContent = encounters[id].name;
  $('#battle-scene').dataset.partySize = String(1 + battle.companions.length);
  $('#battle-scene').dataset.enemyCount=String(battle.enemies.length);
  requestAnimationFrame(resizeBattle);
  const landscape = encounters[id].landscape || (id === 'cave' ? 'cave' : id === 'boss' ? 'camp' : 'forest');
  $('#battle-scene').style.backgroundImage = `linear-gradient(#142e2511,#142e2533),url('${hd('landscape-' + landscape)}')`;
  const position = (side, index, sprite) => {
    const p = battlePosition(side, index, side==='ally'?1+battle.companions.length:battle.enemies.length);
    return `left:${p.x}%;top:${p.y}%;--battle-facing:${battleFacingScale(sprite, side)};--attack-direction:${side === 'ally' ? -1 : 1}`;
  };
  $('#allies').innerHTML = `<button class="battle-actor ally" id="battle-hero" data-ally="hero" data-sprite="linfy" style="${position('ally', 0, 'linfy')}"><div class="sprite-view" style="background-image:url('${hd('battle-linfy')}')"></div><span class="actor-label">凌飞云</span><span class="enemy-hp"><i></i></span></button>` +
    battle.companions.map((ally, i) => `<button class="battle-actor ally" id="battle-${ally.id}" data-ally="${ally.id}" data-sprite="${ally.sprite}" style="${position('ally', i+1, ally.sprite)}"><div class="sprite-view" style="background-image:url('${hd('battle-' + ally.sprite)}')"></div><span class="actor-label">${ally.name}</span><span class="enemy-hp"><i></i></span></button>`).join('');
  $('#party-tactics').replaceChildren();
  $('#skill-banner')?.remove(); $('#battle-scene').insertAdjacentHTML('beforeend', '<div id="skill-banner" role="status" aria-live="polite"></div>');
  $('#battle-cursors')?.remove(); $('#battle-scene').insertAdjacentHTML('beforeend', '<div id="battle-cursors" aria-hidden="true"><i class="battle-cursor actor-cursor"></i><i class="battle-cursor target-cursor"></i></div>');
  $('#enemies').innerHTML = battle.enemies.map((e, i) => `<button class="battle-actor enemy" data-sprite="${e.sprite}" data-enemy="${e.id}" aria-label="选择目标：${e.name}" style="${position('enemy', i, e.sprite)}"><span class="enemy-intent"></span><div class="sprite-view" style="background-image:url('${hd('battle-' + e.sprite)}')"></div><span class="actor-label">${e.name}</span><span class="enemy-hp"><i></i></span></button>`).join('');
  $('#sweep-action').classList.add('hidden');
  $$('.enemy').forEach(button => button.onclick = () => { if (!battleBusy) { selectedEnemy = Number(button.dataset.enemy); renderBattle(); } });
  $$('#allies [data-ally]').forEach(button => button.onclick = () => selectPartyActor(button.dataset.ally));
  $('#battle-log').textContent = state.journey ? '点选我方人物和敌方目标，再下达指令；每名队员分别操作。' : '点选敌人锁定目标，再选择招式。';
  $$('.battle-actor').forEach(el => playBattleAnimation(el, 'idle', { loop: true }));
  renderBattle();
}
function selectPartyActor(id) {
  if (!battle || battleBusy || battle.outcome) return;
  if (!availableActors(battle).some(a => a.id === id)) return toast('这名队员已行动或已倒下。');
  battle.activeActor = id; renderBattle();
  $('#battle-log').textContent = `轮到${partyNames[id]} · 选择敌人，然后攻击、施法或防御。`;
}
function renderActorStatus(element,status,hp) {
  let badge=element.querySelector('.battle-abnormal');
  if(!badge){badge=document.createElement('span');badge.className='battle-abnormal';element.append(badge);}
  const text=Object.entries({freeze:'冰冻',burn:'灼烧',confuse:'混乱'}).filter(([id])=>status?.[id]>0).map(([id,name])=>name+' '+status[id]).join(' · ');
  badge.textContent=hp>0?text:'';
  badge.hidden=!badge.textContent;
}
function battleElement(id) { return typeof id === 'number' ? $(`[data-enemy="${id}"]`) : $('#battle-' + id); }
function updateBattleCursors() {
  if (!battle || !$('#battle-cursors')) return;
  const acting = battleBusy ? $('#battle').dataset.actor : battle.activeActor;
  const activeId = ['hero','fei','lan'].includes(acting) ? acting : Number.isFinite(Number(acting)) ? Number(acting) : null;
  for (const [selector, id] of [['.actor-cursor', activeId], ['.target-cursor', selectedEnemy]]) {
    const el = battleElement(id), cursor = $(selector);
    const fallen = el?.dataset.defeated || el?.classList.contains('dead');
    cursor.hidden = battle.outcome || !el || !!fallen;
    if (cursor.hidden) continue;
    const point = battleAnchor(el), height = ({hero:39,fei:34,lan:35})[id] || 40;
    cursor.style.left = `${point.x - 9}px`; cursor.style.top = `${point.y-(height+3)*point.scale-14}px`;
  }
}
function renderBattle() {
  if (!battle) return;
  const actors = partyActors(battle), actor = actors.find(a => a.id === battle.activeActor) || actors[0];
  $('#battle-round').textContent = battle.outcome ? `战斗结束 · ${battle.outcome === 'victory' ? '胜利' : '暂退'}` : `第 ${battle.round} 回合 · ${battleBusy ? battlePhase || '交锋中' : '轮到'+actor.name}`;
  $('#battle-status').textContent = battleBusy ? battlePhase : `点头像换人 · 点敌人选目标${actor.focus ? ' · 凝神' : ''}`;
  const tactics = $('#party-tactics');
  tactics.innerHTML = actors.map(a => `<button data-party-actor="${a.id}" aria-pressed="${a.id===battle.activeActor}" aria-label="${a.name}，生命 ${a.hp}/${a.maxHP}，精气 ${a.mp}/${a.maxMP}，${a.hp<=0?'倒下':battle.spent.includes(a.id)?'已行动':a.id===battle.activeActor?'当前人物':'待行动，点击切换'}" class="${a.id===battle.activeActor?'active':''} ${a.hp<=0?'fallen':''}" ${battleBusy || battle.outcome || a.hp<=0 || battle.spent.includes(a.id) ? 'disabled' : ''}><i class="native-battle-face face-${a.id}" aria-hidden="true"></i><strong>${a.name}<em>${a.hp<=0?'倒下':battle.spent.includes(a.id)?'已动':''}</em></strong><span class="native-vital"><b>血</b><small>${a.hp}/${a.maxHP}</small><span><i style="width:${Math.max(0,a.hp/a.maxHP*100)}%"></i></span></span><span class="native-vital"><b>气</b><small>${a.mp}/${a.maxMP}</small><span><i class="mp" style="width:${Math.max(0,a.mp/a.maxMP*100)}%"></i></span></span></button>`).join('');
  tactics.querySelectorAll('[data-party-actor]').forEach(button => button.onclick = () => selectPartyActor(button.dataset.partyActor));
  for (const a of actors) {
    const el = battleElement(a.id); el.classList.toggle('current-actor', a.id===battle.activeActor && !battleBusy);
    el.classList.toggle('spent', battle.spent.includes(a.id));
    renderActorStatus(el,a.statuses,a.hp);
    el.querySelector('.enemy-hp i').style.width = `${a.hp/a.maxHP*100}%`;
    el.setAttribute('aria-label', `${a.name}，生命 ${a.hp}，精气 ${a.mp}${battle.spent.includes(a.id)?'，已行动':''}`);
    if(a.hp>0 && el.dataset.defeated) { delete el.dataset.defeated; el.classList.remove('fallen'); playBattleAnimation(el,'idle',{loop:true}); }
  }
  for (const e of battle.enemies) {
    const el = $(`[data-enemy="${e.id}"]`), plan = battle.native?{text:'',heavy:false}:intent(e, battle.round);
    renderActorStatus(el,e,e.hp);
    el.classList.toggle('selected', selectedEnemy === e.id && e.hp > 0); el.disabled = e.hp <= 0;
    el.querySelector('.enemy-hp i').style.width = `${Math.max(0, e.hp) / e.maxHP * 100}%`;
    el.querySelector('.enemy-intent').textContent = plan.text;
    el.querySelector('.enemy-intent').classList.toggle('heavy', plan.heavy);
    el.querySelector('.enemy-intent').classList.toggle('hidden', e.hp <= 0 || !!battle.outcome || !plan.text);
    el.setAttribute('aria-label', e.hp <= 0 ? `${e.name}，已击退` : `${e.name}，生命 ${e.hp} / ${e.maxHP}，意图：${plan.text}${selectedEnemy === e.id ? '，已选中' : ''}`);
  }
  $$('[data-action]').forEach(button => {
    const a = button.dataset.action;
    button.disabled = battleBusy || !!battle.outcome || (a === 'sweep' && (actor.id!=='hero' || actor.mp < 15 || state.level < 2));
  });
  $('[data-action="potion"] small').textContent = battle.native?'普通药耗行动 · 特级药不耗':`金疮药 ${battle.potions} · 清平丸 ${battle.antidotes || 0}`;
  $('[data-action="attack"]').title = `${actor.name} · ${battle.spear ? ({hero:'长枪',fei:'双环',lan:'兰剑'})[actor.id] : '流云剑'}，攻击所选敌人`;
  $('[data-action="attack"] small').textContent=battle.native?'消耗本次行动':'普攻 · 回气 3';
  $('[data-action="skill"] small').textContent = battle.spear ? `${actor.name} · 选择招式` : '真气 8 · 打断蓄力';
  $('[data-action="guard"]').title=battle.native?'提高50个百分点减伤，直到本回合结束':'减少伤害并恢复精气';
  $('[data-action="guard"] small').textContent=battle.native?'减伤提升 50%':'减伤 75% · 回气 9';
  $('#combat-shop').disabled = battleBusy || !!battle.outcome;
  $('#combat-status').textContent = Object.entries(actor.statuses || {}).filter(([,v])=>v>0).map(([id,n])=>`${({freeze:'冰冻',burn:'灼烧',confuse:'混乱'})[id]} ${n}`).join(' · ');
  updateBattleCursors();
}
function showBattleSkills(actor = battle?.activeActor || 'hero') {
  if (!battle || battleBusy || battle.outcome) return;
  if (!battle.spear) {
    const moves=[{id:'legacy-skill',name:'惊鸿一剑',description:'单体攻击 · 打断蓄力',cost:8,action:'skill'},...(state.level>=2?[{id:'legacy-sweep',name:'横扫千军',description:'攻击全体敌人',cost:12,action:'sweep'}]:[])];
    return battleChoiceMenu('技能', moves.map(s=>({...s,note:`精气 ${s.cost}`,disabled:battle.mp<s.cost,reason:'精气不足，可攻击或防御回气'})), choice=>takeTurn(choice.action), `凌飞云 · 精气 ${battle.mp}/${battle.maxMP}`);
  }
  const ally = battle.companions.find(a => a.id === actor), mp = ally ? ally.mp : battle.mp;
  const rage=ally?ally.rage||0:battle.rage||0;
  const choices=learnedSkills(state,actor).filter(s=>!s.passive).map(skill=>{const noTarget=skill.effect==='revive'&&!partyActors(battle).some(a=>a.hp<=0),lackRage=rage<skill.rageCost;return {...skill,name:skill.name+(skill.sourceIndex<56?` · ${skill.rank}重`:''),note:skill.rageCost?`怒气 ${skill.rageCost}`:`精气 ${skill.cost}`,disabled:mp<skill.cost||noTarget||lackRage,reason:mp<skill.cost?(battle.native?'精气不足，可用回气药品恢复':'精气不足，可攻击或防御回气'):lackRage?'怒气不足':noTarget?'没有倒下的队友':''};});
  battleChoiceMenu('技能',choices,skill=>{
    if(['heal','revive'].includes(skill.effect)) chooseAllyTarget('skill',skill.id,skill.effect==='revive');
    else takeTurn('skill',skill.id);
  },`${partyNames[actor]} · 精气 ${mp}/${ally?ally.maxMP:battle.maxMP}`,'施放');
}
function battleChoiceMenu(title, choices, confirm, subtitle, confirmLabel='确定') {
  if (!battle || battleBusy || battle.outcome) return;
  const first=choices.find(c=>!c.disabled)||choices[0]; let selected=first;
  openSheet(title, `<div class="native-choice-list">${choices.map(c=>`<button class="native-choice ${c.disabled?'unavailable':''}" data-battle-choice="${c.id}" aria-pressed="${c===selected}"><i class="skill-seal fx-${c.fx||'item'}" aria-hidden="true">${escapeHTML(c.name[0])}</i><span><strong>${escapeHTML(c.name)}</strong><em>${escapeHTML(c.description||'')}</em></span><small>${escapeHTML(c.note||'')}</small></button>`).join('')}</div><p id="native-choice-description" role="status"></p><div class="native-menu-foot"><span id="native-choice-target"></span><button id="native-choice-confirm" class="native-confirm">${confirmLabel}</button></div>`, subtitle, 'battle-menu');
  const preview=()=>{
    $$('[data-battle-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.battleChoice===selected.id)));
    $('#native-choice-description').textContent=selected.disabled?`${selected.description} · ${selected.reason||'无法使用'}`:selected.description;
    $('#native-choice-confirm').disabled=!!selected.disabled;
    $('#native-choice-target').textContent=title==='技能'?(['heal','revive'].includes(selected.effect)?'下一步选择我方目标':['attackBuff','defenseBuff'].includes(selected.effect)?'目标：我方全体':`目标：${battle.enemies.find(e=>e.id===selectedEnemy)?.name||'敌人'}`):'';
  };
  $$('[data-battle-choice]').forEach(button=>button.onclick=()=>{selected=choices.find(c=>c.id===button.dataset.battleChoice);preview();});
  $('#native-choice-confirm').onclick=()=>{if(selected.disabled)return;closeSheet();confirm(selected);};
  preview();
}
function showBattleItems() {
  if (!battle || battleBusy || battle.outcome) return;
  if(battle.spear){
    const choices=Object.entries(battle.itemCounts||{}).filter(([n,count])=>(n<17||Number(n)===73)&&count>0).map(([n,count])=>({id:'item-'+n,index:Number(n),name:itemRecord(n).name,note:'×'+count,description:itemRecord(n).description}));
    if(battle.potions)choices.push({id:'potion',name:'金疮药',note:'×'+battle.potions,description:'旧行囊补给 · 回复65生命'});
    if(!choices.length)return toast('行囊中没有药品，可在战斗商店补给。');
    return battleChoiceMenu('道具',choices,item=>{
      if(item.index!=null&&itemRecord(item.index).properties[2]===2)return takeTurn('item',String(item.index),battle.activeActor);
      const targets=partyActors(battle).filter(a=>item.index!=null?(itemRecord(item.index).properties[9]&2)||a.hp>0:a.hp>0);
      battleChoiceMenu('选择我方目标',targets.map(a=>({id:a.id,name:a.name,note:`血 ${a.hp}/${a.maxHP}`,description:`精气 ${a.mp}/${a.maxMP}`})),target=>takeTurn(item.id==='potion'?'potion':'item',item.index==null?'rainbow':String(item.index),target.id),item.name,'使用');
    },'普通药品消耗出手 · 特级药品不耗出手','选择人物');
  }
  battleChoiceMenu('道具',[
    {id:'potion',name:'金疮药',note:`×${battle.potions}`,description:'单体恢复 65 点生命，使用后选择我方目标。',disabled:!battle.potions,reason:'金疮药已用尽'},
    {id:'cleanse',name:'清平丸',note:`×${battle.antidotes||0}`,description:'解除当前人物的冰冻、灼烧与混乱。',disabled:!battle.antidotes,reason:'清平丸已用尽'}
  ],item=>item.id==='potion'&&battle.spear?chooseAllyTarget('potion'):takeTurn(item.id),`${partyNames[battle.activeActor]} · 随身药品`,'使用');
}
function chooseAllyTarget(action, skillId, revive = false) {
  if(!battle || battleBusy) return;
  const candidates=partyActors(battle).filter(a=>revive?a.hp<=0:a.hp>0);
  if(!candidates.length) return toast('没有可以选择的队友。');
  battleChoiceMenu('选择我方目标',candidates.map(a=>({id:a.id,name:a.name,note:`血 ${a.hp}/${a.maxHP}`,description:revive?'复活并恢复生命。':'为这名队员恢复生命。'})),target=>takeTurn(action,skillId,target.id),action==='potion'?'金疮药':nativeSkill(battle.activeActor,skillId).name,'确定目标');
}
function stopBattleAnimations() {
  for (const [element, animation] of actorAnimations) { element.classList.remove('acting', 'hurt', 'preparing'); animation.resolve?.(); }
  actorAnimations.clear();
}
function playBattleAnimation(element, pose, { loop = false, lunge = false, hold = false, duration = 0 } = {}) {
  if (!element) return Promise.resolve();
  const sprite = element.querySelector('.sprite-view'), meta = battleSprites[element.dataset.sprite];
  if (!sprite || !meta) return Promise.resolve();
  const previous = actorAnimations.get(element); previous?.resolve?.();
  element.classList.remove('acting');
  if (lunge && !settings.reducedMotion) { void element.offsetWidth; element.classList.add('acting'); }
  const names = element.classList.contains('enemy')&&meta.animations.length<10 ? battleAnimations.enemy : battleAnimations.ally;
  const steps = meta.animations[names[pose] ?? 0] || meta.animations[0];
  const ticks = steps.reduce((n, step) => n + Math.max(1, step[1]), 0);
  const length = duration || Math.max(ticks * 80, loop ? 0 : pose === 'defeat' ? 480 : pose === 'hurt' ? 320 : 400);
  element.style.setProperty('--action-duration', `${length}ms`);
  const width=meta.cellWidth||96,height=meta.cellHeight||96;
  sprite.style.width=width+'px';sprite.style.height=height+'px';sprite.style.marginLeft=(width/2-(meta.originX||48))+'px';sprite.style.marginTop=(80-(meta.originY||80))+'px';
  sprite.style.transformOrigin=`${meta.originX||48}px ${meta.originY||80}px`;
  sprite.style.backgroundSize = `${meta.frames * width}px ${height}px`;
  element.dataset.pose = pose;
  sprite.style.backgroundPosition = `${-width * steps[0][0]}px 0`;
  return new Promise(resolve => actorAnimations.set(element, { steps, start: performance.now(), loop, hold, resolve,
    duration: length, frameMs: 80, nativeLength: ticks * 80,cellWidth:width }));
}
function updateBattleAnimations(now) {
  for (const [element, animation] of actorAnimations) {
    const elapsed = now - animation.start;
    if (!animation.loop && elapsed >= animation.duration) {
      actorAnimations.delete(element); element.classList.remove('acting');
      if (animation.hold) element.querySelector('.sprite-view').style.backgroundPosition = `${-animation.cellWidth * animation.steps.at(-1)[0]}px 0`;
      else playBattleAnimation(element, 'idle', { loop: true });
      animation.resolve();
    } else element.querySelector('.sprite-view').style.backgroundPosition = `${-animation.cellWidth * animationFrame(animation.steps, animation.loop ? elapsed : Math.min(elapsed, animation.nativeLength-1), animation.frameMs)}px 0`;
  }
  updateBattleCursors();
}
function battleAnchor(element) {
  const rect = element.querySelector('.sprite-view').getBoundingClientRect(), board = $('#battle-scene').getBoundingClientRect();
  const meta=battleSprites[element.dataset.sprite],scale=rect.width/(meta.cellWidth||96);
  const origin=battleFacingScale(element.dataset.sprite,element.classList.contains('enemy')?'enemy':'ally')<0?(meta.cellWidth||96)-(meta.originX||48):(meta.originX||48);
  return { x: rect.left - board.left + origin*scale, y: rect.top - board.top + (meta.originY||80)*scale, scale };
}
async function playBattleEffect(index, element, options = {}) {
  if (!element || element.classList.contains('dead')) return;
  return combatEffects.play(index, element, { mirror: element.classList.contains('enemy'), ...options });
}
async function retireBattleActor(element) {
  if (!element || element.dataset.defeated) return;
  element.dataset.defeated = 'true'; element.classList.remove('hurt', 'selected', 'acting');
  const sequence = combatSequence;
  const animation = playBattleAnimation(element, 'defeat', { hold: true, duration: 480 });
  await animation;
  if (sequence !== combatSequence) return;
  if (element.classList.contains('enemy')) {
    element.classList.add('defeating');
    await Promise.all([playBattleEffect(1, element), sleep(800)]);
    if (sequence === combatSequence) element.classList.add('dead');
  } else element.classList.add('fallen');
}
async function showBattleEvent(event) {
  const el = battleElement(event.target);
  if (!el) return;
  if (event.type === 'damage') {
    music.hit();
    if (!event.defeated) playBattleAnimation(el, 'hurt');
  }
  if (event.amount !== undefined) {
    const point = battleAnchor(el), hit = document.createElement('span');
    hit.className = 'floating-hit' + (event.type === 'heal' ? ' heal' : '');
    hit.textContent = event.type==='heal'&&event.manaAmount&&!event.amount?'+'+event.manaAmount+' 气':(event.type === 'heal' ? '+' : '−') + event.amount;
    hit.style.left = `${point.x - 15}px`; hit.style.top = `${point.y - 72}px`;
    $('#battle-fx').append(hit);
    const effect = event.type === 'damage' && !event.skill ? playBattleEffect(typeof event.source==='number'?7:5, el) : Promise.resolve();
    await Promise.all([effect, event.defeated ? retireBattleActor(el) : sleep(400)]);
    hit.remove();
  }
}
async function takeTurn(action, skillId = 'rainbow', allyTarget = battle?.activeActor) {
  if (!battle || battleBusy || battle.outcome) return false;
  const actorId = (action==='status-turn'?availableActors(battle).find(blockedByStatus)?.id:battle.activeActor) || 'hero';
  const result = battleTurn(battle, action, selectedEnemy, skillId, actorId, allyTarget);
  if (result.error) {toast(result.error);return false;}
  const sequence = combatSequence, active = () => battle && sequence === combatSequence;
  battleBusy = true; renderBattle();
  for (const plan of battleSequence(result.events, action)) {
    if (!active()) return;
    const element = battleElement(plan.source), name = partyNames[plan.source] ||
      battle.enemies.find(e => e.id === plan.source)?.name || '灼烧';
    const move = plan.events.find(e => e.skill)?.skill;
    if(plan.cast&&move){plan.duration=plan.impact=Math.max(400,nativeDuration(nativeCombat.sprites.currency,move.s),nativeDuration(nativeCombat.sprites.currency,move.r));}
    $('#skill-banner').innerHTML = `<small>${name}</small><strong>${move?.name || (plan.pose === 'attack' ? '攻击' : plan.events[0].text)}</strong>`;
    $('#skill-banner').classList.add('show'); $('#battle').dataset.actor = String(plan.source);
    if (plan.windup) {
      battlePhase = name + '准备出手'; $('#battle').dataset.stage = 'preparing';
      element?.classList.add('preparing'); renderBattle(); await sleep(plan.windup);
      if (!active()) return; element?.classList.remove('preparing');
    }
    battlePhase = name + (plan.cast ? '施法' : plan.pose === 'attack' ? '出招' : '调息');
    $('#battle').dataset.stage = plan.cast ? 'casting' : 'acting'; renderBattle();
    $('#battle-log').textContent = plan.events[0].text + '——';
    const target = battleElement(plan.events.find(e=>e.type==='damage')?.target);
    const melee = plan.pose==='attack' && element && target && element!==target && !move;
    if (melee) {
      const from=battleAnchor(element), to=battleAnchor(target);
      element.style.translate = `${to.x+(element.classList.contains('enemy')?-42:42)*from.scale-from.x}px ${to.y-from.y}px`;
      element.style.zIndex='5';
    }
    const acting = playBattleAnimation(element, plan.pose, {duration:plan.duration});
    const effects = plan.cast && move ? [playBattleEffect(move.s,element),
      ...[...new Set(plan.events.filter(e=>!e.casterEffect&&!(move.effect==='drain' && e.type==='heal')).map(e=>e.target))].map((id,i)=>playBattleEffect(move.r,battleElement(id),{ambient:i===0}))] : [];
    await Promise.all([sleep(plan.impact), ...effects]);
    if (!active()) return;
    $('#battle').dataset.stage = 'impact';
    const hits = [];
    for (const event of plan.events) {
      battle = battleEventState(battle, event); renderBattle();
      $('#battle-log').textContent = event.text + (event.type==='heal'&&event.manaAmount&&!event.amount?` · 恢复 ${event.manaAmount} 点精气`:event.amount !== undefined ?
        ' · ' + (event.type === 'heal' ? '恢复' : '造成') + ' ' + event.amount + ' 点' + (event.type === 'heal' ? '生命' : '伤害') : '');
      hits.push(showBattleEvent(event));
    }
    await Promise.all([acting,...hits]); if (!active()) return;
    if(element) { element.style.translate=''; element.style.zIndex=''; }
    battlePhase = name + '收招'; $('#battle').dataset.stage = 'recovering'; renderBattle();
    await sleep(plan.recovery); $('#skill-banner').classList.remove('show');
  }
  if (!active()) return;
  battle = result;
  if (!battle.enemies.some(e => e.id === selectedEnemy && e.hp > 0)) selectedEnemy = battle.enemies.find(e => e.hp > 0)?.id ?? 0;
  battleBusy = !!battle.outcome; battlePhase = '';
  $('#battle').dataset.stage = battle.outcome ? 'finished' : 'ready';
  renderBattle();
  if (!battle.outcome && battle.native && availableActors(battle).some(blockedByStatus)) return takeTurn('status-turn');
  if (!battle.outcome) $('#battle-log').textContent = `轮到${partyNames[battle.activeActor]} · 点选人物可切换，选好目标再出招。`;
  if (battle.outcome) {
    if (battle.outcome === 'victory') await Promise.all(partyActors(battle).filter(a=>a.hp>0).map(a=>playBattleAnimation(battleElement(a.id),'victory',{hold:true})));
    if (!active()) return;
    $('#battle-outcome').textContent = battle.outcome === 'victory' ? '战斗胜利' : '暂退 · 再起';
    $('#battle-outcome').classList.add('show'); await sleep(850); if(active()) finishBattle();
  }
  return true;
}
function leaveBattle() {
  combatSequence++; stopBattleAnimations(); $('#battle-fx').replaceChildren(); $('#battle-outcome').classList.remove('show');
  encounterGraceUntil = performance.now() + 1800; battlePhase = '';
  battle = null; battleBusy = false; $('#battle').classList.add('hidden'); $('#app').classList.remove('battle-mode'); renderHUD();
}
function finishBattle() {
  if (!battle) return;
  const b = battle, encounter = encounters[b.id];
  if(b.outcome==='escaped'){
    state.hp=b.hp;state.mp=b.mp;state.journey.items=structuredClone(b.itemCounts);state.journey.partyVitals=Object.fromEntries(b.companions.map(a=>[a.id,{hp:a.hp,mp:a.mp,rage:a.rage}]));
    const done=nativeScriptRunning?storyBattleDone:null;storyBattleDone=null;forceCloseSheet();leaveBattle();saveGame(true);toast('遁返脱身 · 未获得本场战利品');done?.(false);return;
  }
  if(b.outcome==='defeat'&&encounter.expectedOutcome==='defeat'){
    state.journey.items=structuredClone(b.itemCounts||{});
    openSheet('战局未利', '<p>众人力战不敌，故事仍将继续。</p><button class="primary-button" id="story-defeat-continue">继续剧情</button>',encounter.name);
    $('#story-defeat-continue').onclick=()=>{
      const done=storyBattleDone;storyBattleDone=null;forceCloseSheet();leaveBattle();state.hp=maxHP(state);state.mp=maxMP(state);state.journey.partyVitals={};saveGame(true);done?.(false);
    };
    return;
  }
  if (b.outcome === 'defeat') {
    openSheet('暂歇锋芒', `<div class="victory-reward"><span>胜负未定</span></div><p>你退到安全处休整，已取得的物品和主线进度保留。</p><p>${b.native?'留意人物等级、装备与敌人的异常招式。防御可提高减伤，精气可用药品恢复。':'留意敌人的「蓄力重击」：防御可减少 75% 伤害。'}分别指挥队员，治疗时选中需要恢复的同伴。</p><button class="primary-button" id="retry-battle">休整后再战</button><div class="button-row"><button class="secondary-button" id="retreat-battle">暂退休整</button></div>`, '不必独自扛下所有风雨');
    const rest = () => { state.hp = maxHP(state); state.mp = maxMP(state); if(state.journey) state.journey.partyVitals={}; };
    $('#retry-battle').onclick = () => { forceCloseSheet(); leaveBattle(); rest(); beginBattle(b.id, b.companions.map(a => a.id)); };
    $('#retreat-battle').onclick = () => {const done=nativeScriptRunning?storyBattleDone:null;if(done)storyBattleDone=null;forceCloseSheet();leaveBattle();rest();transition(state.journey ? state.map : 12);done?.(false);};
    return;
  }
  state.hp = b.hp; state.mp = b.mp; state.potions = b.potions; state.coins += encounter.reward;if(!state.journey)state.xp += encounter.xp;
  if (state.journey) { state.journey.antidotes = b.antidotes;
    state.journey.items=structuredClone(b.itemCounts||{});
    state.journey.partyVitals ||= {};
    state.journey.rage=b.rage||0;for(const a of b.companions) state.journey.partyVitals[a.id]={hp:a.hp,mp:a.mp,rage:a.rage||0};
  }
  const loot=state.journey?battleRewards(state,encounter):[];
  const itemLoot=state.journey?originalItemDrops(state,encounter):[];
  for(const entry of loot)remember(`【${encounter.name}】获得${equipment[entry.id].name}。`);
  const oldLevel=state.level,progress=state.journey?gainExperience(state,encounter.xp):null;
  if(!state.journey)state.level=Math.min(4,1+Math.floor(state.xp/85));
  const leveled=oldLevel<state.level;
  for(const skill of progress?.learned||[])remember(`${partyNames[skill.actor]}领悟${skill.name}。`);
  if (leveled) { state.hp = maxHP(state); state.mp = maxMP(state); if(state.journey) state.journey.partyVitals={}; }
  openSheet('战斗胜利', `<div class="native-rewards"><p><span>获得经验</span><strong>${encounter.xp}</strong></p><p><span>获得金钱</span><strong>${encounter.reward} 两</strong></p></div>${loot.length?`<div class="loot-heading">战利品 · 已收入行囊</div>${treasureCards(loot)}`:'<p class="no-loot">此战未掉落装备</p>'}${leveled ? `<p class="native-level-up">等级提升至 ${state.level} 阶 · 生命精气全满</p>` : ''}<button id="battle-reward" class="primary-button">确定 · 继续前行</button>`, encounter.name);
  $('#battle-reward').insertAdjacentHTML('beforebegin',itemLoot.map(i=>`<p>获得 ${escapeHTML(i.name)} ×${i.count}</p>`).join('')+(progress?.learned||[]).map(s=>`<p class="native-level-up">${partyNames[s.actor]}领悟 ${s.name}</p>`).join(''));
  $('#battle-reward').onclick = () => {
    forceCloseSheet(); leaveBattle();
    if (state.journey) { const done = storyBattleDone; storyBattleDone = null; done?.(); renderHUD(); saveGame(true); return; }
    if (b.id === 'patrol') setStage(3, '与芷萱合力击退金军斥候，通往彼岸洞的山道已经打开。');
    if (b.id === 'cave') { state.flags.flower = true; setStage(4, '取得彼岸花。我们决定一起寻找解毒之法，不以失去记忆换取团圆。'); }
    if (b.id === 'boss') {
      setStage(6, '铁骑统领败退，渡江计划被破。天明后，该回去赴那一壶新茶的约了。');
      say([{ who: 'lan', text: '天亮了。你说过的，一起去，也一起回来。' }, { who: 'hero', text: '走，回家。还有人在等我们的消息。' }], () => transition(12, [17, 10]));
    }
    saveGame(true);
  };
}
function chooseEnding() {
  say([
    { who: 'geng', text: '金军退了，城中百姓都在说你们的故事。若有一日再起烽烟，你想过要往何处去么？' },
    { who: 'fei', text: '茶已煮好。这回，你可以慢慢想。' },
    { who: 'hero', text: '这一程之后，我愿……', choices: [
      { text: '与故人同守山河，也同看人间烟火。', effect: () => { state.ending = 'together'; } },
      { text: '携芷萱行遍江湖，仍记得回别院的路。', effect: () => { state.ending = 'wander'; } }
    ] }
  ], () => { setStage(7, state.ending === 'wander' ? '我与芷萱约定携手远游。沐霏在别院留了盏灯，江湖再远，也有归处。' : '我们选择留下。有人守城，有人行医，有人提剑，风雨来时彼此照应。'); saveGame(true); endingPanel(); });
}
function endingPanel() {
  if (state.journey) return originalEnding();
  const together = state.ending !== 'wander';
  openSheet('此程有归处', `<img class="ending-art" src="${hd('map-'+(together ? 12 : 39))}" alt="${together ? '荷池边的听雨别院' : '山河与归途'}"><h3 class="ending-title">${together ? '山河故人' : '天涯共此心'}</h3><p class="ending-copy">${together ? '沐霏的药庐又开了门，芷萱偶尔在树下练剑。飞云从城头归来时，总有人留一盏灯。江湖还很远，故人都在眼前。' : '枫林的叶子落了又生。飞云与芷萱并马南行，走过许多山河。每逢雨夜，别院的茶香便会在记忆里升起。归途一直都在。'}</p><div class="ending-tags"><span>彼岸花已取</span><span>${state.bond >= 2 ? '肝胆相照' : '并肩同行'}</span>${state.flags.rescued ? '<span>乡民平安</span>' : ''}${state.flags.intel ? '<span>知己知彼</span>' : ''}<span>故人无恙</span></div><p style="text-align:center">四幕故事已完成 · 江湖仍可自由回访</p><button id="ending-continue" class="primary-button">再看一眼江湖 <span>→</span></button>`, '满江红 · 彼岸归途');
  $('#ending-continue').textContent = '进入原作六章主线 →';
  $('#ending-continue').onclick = legacyBridge;
}

function openSheet(title, content, subtitle = '江湖随身笺', variant = '') {
  clearTimeout(toastTimer);$('#toast').classList.remove('show');
  if (!activeSheet) sheetReturnFocus = document.activeElement;
  activeSheet = title;
  $('#sheet-backdrop').dataset.kind = variant;
  $('#sheet-backdrop').classList.toggle('battle-menu', variant === 'battle-menu');
  $('#sheet-title').textContent = title; $('#sheet-subtitle').textContent = subtitle;
  $('#sheet-close').classList.toggle('hidden', !!battle?.outcome);
  $('#sheet-content').innerHTML = content; $('#sheet-backdrop').classList.remove('hidden'); $('#app').classList.add('modal-open');
  $('#sheet').scrollTop = 0;
  if (battle?.outcome) $('#sheet-content button')?.focus(); else $('#sheet-close').focus();
}
function closeSheet() {
  if (!activeSheet) return;
  if (battle?.outcome) return; // Rewards and recovery must be acknowledged explicitly.
  activeSheet = null; $('#sheet-backdrop').classList.add('hidden'); $('#app').classList.remove('modal-open');
  sheetReturnFocus?.focus?.();
  const dismiss=sheetDismiss;sheetDismiss=null;dismiss?.();
}
function forceCloseSheet() {
  activeSheet = null; $('#sheet-backdrop').classList.add('hidden'); $('#app').classList.remove('modal-open');
  const dismiss=sheetDismiss;sheetDismiss=null;dismiss?.();
}
function showPanel(name) {
  if(storyPlayer?.running)return;
  if(nativeScriptRunning)return;
  if (!started || dialogue) return;
  if (battle) return toast('交锋中先专心出招，战后再整理行囊。');
  if (state.journey && name === 'bag') return originalBag();
  if (state.journey && name === 'journal') return showOriginalJournal();
  if (state.journey && name === 'party') return originalCharacters();
  if (name === 'party') {
    const card = (id, description) => `<div class="character-card"><img src="assets/${characters[id].portrait}" alt="${characters[id].name}"><div><h3>${characters[id].name}</h3><small>${characters[id].role}</small><p>${description}</p>${id === 'hero' ? `<div class="stat-line"><span>境界 ${state.level}</span><span>阅历 ${state.xp}</span><span>真气 ${state.mp}/${maxMP(state)}</span></div>` : ''}</div></div>`;
    openSheet('携友同行', card('hero', state.journey ? '凤凰山上的长枪少年。普攻回复真气，长虹贯日可以打断敌人蓄力。' : '剑护山河，也护身边人。普攻回复真气，凝神守势后下一剑威力提高。') +
      members().map(id => card(id, id === 'fei' ? '耿京之女，擅使双环。患难结识，战斗中可直接选中，独立下达攻击、双环招式或防御指令。' : '兰氏郡主，身负一段未了的旧事。战斗中可独立攻击、施法，为选中的队友治疗或复活。')).join('') +
      (!state.party ? '<p>江湖路上，等待与你相逢的人。</p>' : ''), '江湖路远，幸得同行');
  }
  if (name === 'bag') {
    openSheet('行囊', `<div class="wallet"><span>随身银两</span><strong>${state.coins} 两</strong></div><div class="item-row"><img src="assets/native/item-potion.png" alt=""><div><strong>金疮药 × ${state.potions}</strong><p>恢复 65 点生命，战斗中可使用。</p></div><button id="use-potion" ${!state.potions || state.hp >= maxHP(state) ? 'disabled' : ''}>服用</button></div><div class="item-row"><img src="assets/native/item-sword.png" alt=""><div><strong>流云剑 · ${state.level} 阶</strong><p>随境界成长，不必反复更换。${state.level >= 2 ? '已习得横扫千军。' : '二阶习得横扫千军。'}</p></div><small>已佩备</small></div>${state.flags.flower ? '<div class="item-row"><div><strong>彼岸花</strong><p>' + (state.stage >= 5 ? '已入药，故人安好。' : '能解寒毒的药引。快交给沐霏。') + '</p></div><small>信物</small></div>' : ''}${state.flags.intel ? '<div class="item-row"><div><strong>金军布防图</strong><p>决战时两名敌人的初始生命各降低 30。</p></div><small>情报</small></div>' : ''}<h3>别院药铺</h3><p>路途辛苦，备些伤药。每份 25 两。</p><button id="buy-potion" class="primary-button" ${state.coins < 25 || state.potions >= 99 ? 'disabled' : ''}>购入金疮药 · 25 两</button>`, '好好吃饭，也好好赶路');
    $('#use-potion').onclick = () => { if (!state.potions || state.hp >= maxHP(state)) return; state.potions--; state.hp = Math.min(maxHP(state), state.hp + 65); renderHUD(); saveGame(); showPanel('bag'); toast('服下金疮药，气息渐稳。'); };
    $('#buy-potion').onclick = () => { if (state.coins < 25 || state.potions >= 99) return; state.coins -= 25; state.potions++; saveGame(); showPanel('bag'); toast('购入金疮药 ×1'); };
  }
  if (name === 'journal') openSheet('江湖记', `<div class="wallet"><span>${chapters[state.stage]}</span><span>${Math.floor(state.playtime / 60)} 分钟</span></div><h3>${objectives[state.stage].title}</h3><p>${objectives[state.stage].text}</p><button class="secondary-button" id="journal-guide">循迹引路 ↗</button><div style="height:24px"></div>` + (state.journal.length ? state.journal.map((entry, i) => `<div class="journal-entry"><i>${String(i + 1).padStart(2, '0')}</i><p>${escapeHTML(entry)}</p></div>`).reverse().join('') : '<p>江湖的第一页，等你亲手写下。</p>') + (state.ending ? '<button class="primary-button" id="view-ending">重温结局</button>' : ''), '走过的路，见过的人');
  $('#journal-guide')?.addEventListener('click', guide); $('#view-ending')?.addEventListener('click', endingPanel);
}
function mapPanel() {
  if(storyPlayer?.running)return;
  if (!started || dialogue || battle) return;
  if (state.journey) {
    const j = state.journey, q = objective(), ids = [...new Set([...j.visited, ...(q.map !== undefined ? [q.map] : [])])];
    openSheet('山河行路图', `<p>点场景直接前往。已到过的地方和当前主线目的地均可抵达。</p><div class="map-list">${ids.map(id => `<button class="map-card ${id===state.map?'current':''}" data-story-travel="${id}"><img src="${hd('map-'+id)}" alt="${originalStory.scenes.find(s=>s.map===id)?.name || places[id].name}"><strong>${originalStory.scenes.find(s=>s.map===id)?.name || places[id].name}</strong><small>${id===state.map?'此刻所在':id===q.map?'当前主线 ↗':'回访 ↗'}</small></button>`).join('')}</div>`, '山川相连 · 行路无碍');
    $$('[data-story-travel]').forEach(button => button.onclick = () => { closeSheet(); guideActive = false; transition(Number(button.dataset.storyTravel)); });
    return;
  }
  const unlocked = id => id === 12 || id === 0 && state.stage >= 1 || id === 4 && state.stage >= 3 || id === 19 && state.stage >= 5;
  openSheet('山河行路图', `<p>已走通的地方可直接前往。每一条归途，都有人在等。</p><div class="map-list">${Object.entries(places).map(([id, p]) => `<button class="map-card ${state.map === Number(id) ? 'current' : ''}" data-travel="${id}" ${!unlocked(Number(id)) ? 'disabled' : ''}><img src="${hd('map-'+id)}" alt=""><strong>${p.name}</strong><small>${state.map === Number(id) ? '此刻所在' : unlocked(Number(id)) ? '轻点前往 ↗' : '随故事开启'}</small></button>`).join('')}</div><div style="height:20px"></div><button class="primary-button" id="map-guide">循当前线索引路</button>`, '山河不远，点选即行');
  $$('[data-travel]').forEach(button => button.onclick = () => { const id = Number(button.dataset.travel); if (unlocked(id)) { closeSheet(); guideActive = false; transition(id); } });
  $('#map-guide').onclick = guide;
}
function returnToTitle() {
  closeSheet(); if (started) saveGame(true);
  path = []; destination = null; pendingInteraction = null; guideActive = false; stopFollowers();
  started = false; music.stop(); refreshTitle(); $('#title-screen').classList.remove('hidden');
}
function gameMenu() {
  if (battle || dialogue || storyPlayer?.running) return toast('请先完成眼前这段交锋或对话。');
  const entries = started ? [
    ['resume', '继续游戏', '返回江湖'], ['party', '人物状态', '同伴'], ['bag', '物品装备', '行囊'],
    ['journal', '任务记录', '江湖记'], ['settings', '游戏设置', ''], ['help', '游戏帮助', ''],
    ['about', '关于游戏', ''], ['title', '返回封面', '自动保存']
  ] : [['resume', '返回封面', ''], ['settings', '游戏设置', ''], ['help', '游戏帮助', ''], ['about', '关于游戏', '']];
  openSheet('游戏菜单', `${started ? `<div class="menu-location">${escapeHTML(currentChapter())}<br>${escapeHTML($('#place-name').textContent)}</div>` : ''}<div class="native-menu-list">${entries.map(([id,label,hint]) => `<button data-menu="${id}">${label}${hint ? `<small>${hint}</small>` : ''}</button>`).join('')}</div>`, '满江红二 · 铁骑红颜', 'game-menu');
  const actions = {resume:closeSheet, party:()=>showPanel('party'), bag:()=>showPanel('bag'), journal:()=>showPanel('journal'), settings:()=>settingsPanel(gameMenu), help:()=>helpPanel(gameMenu), about:()=>aboutPanel(gameMenu), title:returnToTitle};
  $$('[data-menu]').forEach(button => button.onclick = actions[button.dataset.menu]);
}
function helpPanel(back = gameMenu) {
  openSheet('游戏帮助', `<div class="help-section"><span>壹</span><div><h3>行走与引路</h3><p>点地面自动寻路，点人物走近交谈。点「引路」前往当前主线目标，途中点地图可自由改道。拖动查看地图，双击回到身边。</p></div></div><div class="help-section"><span>贰</span><div><h3>交锋与施法</h3><p>先点我方人物或下方头像，头顶箭头表示当前人物；再点敌方选定目标，选择攻击、技能、道具或防御。每位同伴独立下令，治疗与用药可选择队友。</p></div></div><div class="help-section"><span>叁</span><div><h3>存档与按键</h3><p>进度自动保存在当前浏览器。换设备前在设置中导出存档，再导入新设备。电脑支持方向键 / WASD 行走，空格 / Enter 继续，G 引路，J 江湖记，Esc 关闭菜单。</p></div></div><button class="secondary-button menu-back" id="help-back">返回</button>`, '指尖行江湖');
  $('#help-back').onclick = back;
}
function aboutPanel(back = gameMenu) {
  openSheet('关于游戏', '<div class="about-mark">满江红二 · 铁骑红颜</div><p>原版作品由仙掌软件制作。本网页版沿用原作六章文字与过场记录，画面参考原素材进行 AI 高清重绘，适配手机点触和电脑操作。</p><p>已串联 67 个主线节点及 1,877 条对白、旁白，支持逐人手动战斗、原版技能动画、装备、御剑与两项汴京支线。封面、米黄窗框和红字菜单参考 Java 原版。</p><p>回合编排、伤害公式和任务触发使用网页实现；原版速度算法、全部隐藏事件及完整引擎行为仍有差异。</p><div class="about-links"><a href="https://github.com/malqqin/manjianghong-web" target="_blank" rel="noopener noreferrer">GitHub 项目 ↗</a></div><button class="secondary-button menu-back" id="about-back">返回</button>', '原作六章 · 触屏重制');
  $('#about-back').onclick = back;
}
function settingsPanel(back = gameMenu) {
  if (battle || dialogue || storyPlayer?.running) return toast('请先完成眼前这段交锋或对话。');
  openSheet('游戏设置', `<div class="settings-row"><span>游戏声音<small>背景音乐与交锋音效</small></span><button id="setting-sound" role="switch" aria-label="游戏声音" aria-checked="${settings.sound}">${settings.sound ? '开' : '关'}</button></div><div class="settings-row"><span>行走速度<small>探索地图时的移动速度</small></span><button id="setting-speed" role="switch" aria-label="快速行走" aria-checked="${settings.fast}">${settings.fast ? '快速' : '普通'}</button></div><div class="settings-row"><span>减少动态<small>减少画面闪动与震动</small></span><button id="setting-motion" role="switch" aria-label="减少动态" aria-checked="${settings.reducedMotion}">${settings.reducedMotion ? '开' : '关'}</button></div><p class="settings-caption">随行即存。换设备前，可将这段江湖导出留存。</p><div class="button-row"><button class="secondary-button" id="export-save" ${!started && !saved ? 'disabled' : ''}>导出存档</button><button class="secondary-button" id="import-save">导入存档</button></div><input class="file-input" id="save-file" type="file" accept=".json,application/json"><button class="secondary-button menu-back" id="settings-back">返回</button>`, '满江红二 · 铁骑红颜', 'settings');
  const toggle = (id,key,labels) => { const button = $(id); button.onclick = () => { settings[key] = !settings[key]; applySettings(); button.setAttribute('aria-checked', String(settings[key])); button.textContent = labels[Number(settings[key])]; }; };
  toggle('#setting-sound','sound',['关','开']);
  toggle('#setting-speed','fast',['普通','快速']);
  toggle('#setting-motion','reducedMotion',['关','开']);
  $('#settings-back').onclick = back;
  $('#export-save').onclick = () => {
    if (started) saveGame(true);
    const blob = new Blob([JSON.stringify(started ? state : saved, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '满江红-江湖存档.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  $('#import-save').onclick = () => $('#save-file').click();
  $('#save-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 100000) throw new Error();
      const imported = validateSave(JSON.parse(await file.text())); if (!imported) throw new Error();
      forceCloseSheet(); state = imported; started = true; $('#title-screen').classList.add('hidden'); transition(state.map, [state.tile.x, state.tile.y]); applySettings(); toast('前缘已续，欢迎归来。');
    } catch { toast('这份存档无法读取，请选择本游戏导出的 JSON 存档。'); }
  };
}
function refreshTitle() {
  saved = null;
  try { saved = validateSave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch {}
  $('#continue-game').disabled = !saved;
  $('#continue-detail').textContent = saved ? saved.journey ? `主线 ${Math.min(saved.journey.index+1,STORY_COUNT)}/${STORY_COUNT}` : '旧篇存档' : '暂无存档';
}
function startNew() {
  if (saved) {
    openSheet('另启新程', '<p>当前浏览器已有一段旅程。开始新故事会替换当前自动存档，建议先在设置里导出留念。</p><button class="primary-button" id="confirm-new">开始新的故事</button><div class="button-row"><button class="secondary-button" id="keep-old">续写原来的旅程</button></div>', '每一程，都值得记住');
    $('#confirm-new').onclick = () => { forceCloseSheet(); launch(false); };
    $('#keep-old').onclick = () => { forceCloseSheet(); launch(true); };
  } else launch(false);
}
function launch(resume) {
  const migrating = resume && saved && !saved.journey;
  if (migrating) {
    localStorage.setItem('mjh-legacy-backup-v1', JSON.stringify(saved));
    state = originalState(newGame());
    state.coins = Math.max(state.coins, saved.coins); state.potions = Math.max(state.potions, saved.potions);
  } else state = resume && saved ? structuredClone(saved) : originalState(newGame());
  started = true; mainGoalCache = null;
  $('#title-screen').classList.add('hidden');
  transition(state.map, [state.tile.x, state.tile.y]); applySettings();
  if (!resume || migrating) {
    remember('凤凰山上，少年凌飞云提枪下山。');
    playStory([{ who: 'story', text: originalStory.opening }]);
    if (migrating) toast('旧四幕存档已另行备份 · 进入原作凤凰山开篇');
  }
}

// A drag explores the map without walking. A simple tap always means move/interact.
let drag = null, pan = { x: 0, y: 0 }, panUntil = 0;
canvas.addEventListener('pointerdown', event => {
  if(storyPlayer?.running)return;
  if (!started || dialogue || battle || activeSheet || scenePending) return;
  drag = { x: event.clientX, y: event.clientY, camera: { ...camera }, moved: false };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) > 10) drag.moved = true;
    if (drag.moved) { const map = maps.get(state.map); pan = { x: clamp(drag.camera.x - dx / view.zoom, 0, Math.max(0,map.width * 16 - view.w / view.zoom)), y: clamp(drag.camera.y - dy / view.zoom, 0, Math.max(0,map.height * 16 - view.h / view.zoom)) }; camera = { ...pan }; panUntil = Infinity; }
});
canvas.addEventListener('pointerup', event => {
  if (!drag) return;
  const wasDrag = drag.moved; drag = null;
  if (!wasDrag) { panUntil = 0; sceneClick(event); }
});
canvas.addEventListener('pointercancel', () => drag = null);
canvas.addEventListener('dblclick', () => panUntil = 0);
$('#dialogue-next').onclick = advanceDialogue;
$('#dialogue-text').onclick = () => { if(storyPlayer?.running)storyPlayer.advance();else if (dialogue && !dialogue.lines[dialogue.index].choices) advanceDialogue(); };
$('#dialogue').addEventListener('click',event=>{if(storyPlayer?.running&&!event.target.closest('button,#dialogue-text'))storyPlayer.advance();});
$('#native-caption').onclick=$('#native-poem').onclick=$('#native-cg').onclick=()=>storyPlayer?.advance();
$('#start-game').onclick = startNew;
$('#continue-game').onclick = () => launch(true);
$('#title-settings').onclick = () => settingsPanel(closeSheet);
$('#title-help').onclick = () => helpPanel(closeSheet);
$('#title-about').onclick = () => aboutPanel(closeSheet);
$('#sheet-close').onclick = closeSheet;
$('#sheet-backdrop').onclick = event => { if (event.target === $('#sheet-backdrop')) closeSheet(); };
$('#guide-button').onclick = $('#mobile-quest').onclick = $('#nav-guide').onclick = () => {if(guideActive){guideActive=false;path=[];destination=null;pendingInteraction=null;stopFollowers();syncGuideUI();return;}guide();};
$('#map-button').onclick = mapPanel;
$('#settings-button').onclick = gameMenu;
$('#brand-home').onclick = event => { event.preventDefault(); gameMenu(); };
$('#sound-button').onclick = () => { settings.sound = !settings.sound; applySettings(); };
$('#flight-button').onclick = () => {
  if(storyPlayer?.running)return;
  if (!started || !state.journey || dialogue || battle || activeSheet || scenePending) return;
  if(!canFly(state))return toast('尚未习得御剑之术，请先继续主线。');
  const j = state.journey; j.flying = !j.flying;
  path = []; destination = null; pendingInteraction = null; guideActive = false;
  if (!j.flying) {
    const safe = nearestTile(tiles.get(state.map), (player.x-8)/16, (player.y-8)/16);
    player.x = safe.x*16+8; player.y = safe.y*16+8;
  }
  resetFollowers();
  renderHUD(); saveGame(); toast(j.flying ? '御剑而行 · 点地面可穿越障碍' : '已在安全地面落下');
};
$('#combat-shop').onclick = () => {
  if (!battle || battleBusy || battle.outcome) return;
  if(battle.spear)return battleChoiceMenu('战斗商店',originalRules.items.slice(0,6).map(item=>({id:'buy-'+item.index,index:item.index,name:item.name,description:item.description,note:item.properties[0]+'两',disabled:state.coins<item.properties[0],reason:'银两不足'})),item=>{
    const choices=partyActors(battle).filter(a=>a.hp>0||(itemRecord(item.index).properties[9]&2));
    battleChoiceMenu('选择我方目标',choices.map(a=>({id:a.id,name:a.name,note:`血 ${a.hp}/${a.maxHP}`,description:`精气 ${a.mp}/${a.maxMP}`})),choice=>{
      const record=itemRecord(item.index);if(state.coins<record.properties[0])return;
      // Purchased special medicines share the bag's original flags and action path.
      state.coins-=record.properties[0];battle.itemCounts[item.index]=(battle.itemCounts[item.index]||0)+1;
      takeTurn('item',String(item.index),choice.id).then(ok=>{if(!ok&&battle){state.coins+=record.properties[0];battle.itemCounts[item.index]--;}});
    },item.name,'购入并服用');
  },`银两 ${state.coins} · 购买不消耗出手`,'选择人物');
  const actor=partyActors(battle).find(a=>a.id===battle.activeActor);
  openSheet('商店', `<div class="wallet"><span>金钱</span><strong>${state.coins} 两</strong></div><div class="native-shop-item"><img src="${hd('item-potion')}" alt=""><strong>九衍丹</strong><span>60 两</span></div><p>为${actor.name}恢复 95 点生命，不消耗出手次数。${actor.hp>=actor.maxHP?'当前生命已满。':state.coins<60?'银两不足。':''}</p><button class="primary-button" id="buy-combat-heal" ${state.coins<60 || actor.hp>=actor.maxHP ? 'disabled' : ''}>购入并服用</button>`, `${actor.name} · 游戏内银两`);
  $('#buy-combat-heal').onclick = () => {
    if (!battle || state.coins < 60 || actor.hp >= actor.maxHP) return;
    state.coins -= 60;
    if(actor.id==='hero') battle.hp=Math.min(battle.maxHP,battle.hp+95);
    else battle.companions.find(a=>a.id===actor.id).hp=Math.min(actor.maxHP,actor.hp+95);
    renderBattle(); closeSheet(); toast(`${actor.name}生命已恢复 · 本回合仍可行动`);
  };
};
$$('[data-panel]').forEach(button => button.onclick = () => showPanel(button.dataset.panel));
$$('[data-action]').forEach(button => button.onclick = () => {
  if(button.dataset.action==='skill') showBattleSkills();
  else if(button.dataset.action==='potion') showBattleItems();
  else takeTurn(button.dataset.action);
});
document.addEventListener('keydown', event => {
  if(storyPlayer?.running){if([' ','Enter'].includes(event.key)){event.preventDefault();storyPlayer.advance();}return;}
  if (event.key === 'Escape') { closeSheet(); return; }
  if (activeSheet) {
    if (event.key === 'Tab') {
      const focusable = $$('#sheet button:not(:disabled),#sheet a,#sheet input:not(.file-input)');
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    } return;
  }
  if (!started || battle || scenePending) return;
  if (dialogue) { if ([' ', 'Enter'].includes(event.key) && !dialogue.lines[dialogue.index].choices) { event.preventDefault(); advanceDialogue(); } return; }
  const key = event.key.toLowerCase(), directions = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
  if (directions[key]) {
    event.preventDefault(); const [dx, dy] = directions[key], tile = { x: Math.round((player.x - 8) / 16) + dx, y: Math.round((player.y - 8) / 16) + dy };
    moveTo(tile); panUntil = 0;
  }
  if ([' ', 'Enter'].includes(event.key)) {
    event.preventDefault(); const nearby = currentEntities().sort((a, b) => Math.hypot(a.x * 16 + 8 - player.x, a.y * 16 + 8 - player.y) - Math.hypot(b.x * 16 + 8 - player.x, b.y * 16 + 8 - player.y))[0];
    if (nearby && Math.hypot(nearby.x * 16 + 8 - player.x, nearby.y * 16 + 8 - player.y) < 48) moveTo(nearby, nearby);
  }
  if (key === 'j') showPanel('journal'); if (key === 'g') guide();
});
window.addEventListener('pagehide', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(true); music.stop(); } else if (settings.sound && started) music.start(); });
new ResizeObserver(resize).observe(canvas);
new ResizeObserver(resizeBattle).observe($('#battle-scene'));

const mapRequests = new Map();
function ensureMap(id) {
  const key = `map-${id}.png`;
  if (images.has(key)) return Promise.resolve(images.get(key));
  if (mapRequests.has(id)) return mapRequests.get(id);
  const promise = new Promise((resolve, reject) => {
    const img = new Image(); img.onload = async () => {
      try { await img.decode(); images.set(key,img); mapRequests.delete(id); resolve(img); }
      catch(error) { mapRequests.delete(id); reject(error); }
    };
    img.onerror = () => { mapRequests.delete(id); toast('场景载入失败，请检查网络后刷新。'); reject(new Error(key)); };
    img.src = hd('map-'+id);
  });
  mapRequests.set(id,promise); return promise;
}
async function initialize() {
  $('#title-screen').classList.add('loading');
  try {
    const data = await Promise.all(['maps', 'sprites', 'battle', 'original-story', 'native-combat','native-story'].map(name => fetch(`assets/${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json(); })));
    originalStory = data[3];
    for (const map of data[0]) {
      maps.set(map.id, map);
      if (!places[map.id]) places[map.id] = { name: originalStory.scenes.find(s=>s.map===map.id)?.name || '山河之间', mood: '山河入梦，故人入心。', spawn: [Math.floor(map.width/2),map.height-5] };
      tiles.set(map.id, component(map));
    }
    sprites = data[1]; battleSprites = data[2];
    nativeCombat=data[4];
    data[5].mapSizes=Object.fromEntries(data[0].map(map=>[map.id,[map.width*16,map.height*16]]));
    storyPlayer=new NativeStoryPlayer(data[5],images,ensureMap,()=>settings.reducedMotion);
    portalGraph=Object.fromEntries(Object.keys(data[5].scenes).map(key=>[key,scenePortals(data[5],key)]));
    for(const [name,meta] of Object.entries(battleSprites)) meta.animations=nativeCombat.sprites[name]?.animations.map(a=>a.steps) || (meta.tickMs===80?meta.animations:meta.animations.map(steps=>steps.map(([f,t])=>[f,Math.max(1,t/4)])));
    for(const skill of Object.values(skillSets).flat()) skill.duration=Math.max(nativeDuration(nativeCombat.sprites.currency,skill.r),nativeDuration(nativeCombat.sprites.currency,skill.s));
    const effectImage=new Image(); effectImage.src=hd('native-currency'); await effectImage.decode();
    combatEffects=new NativeBattleEffects($('#battle-scene'),$('#battle-fx'),nativeCombat.sprites.currency,effectImage,battleAnchor);
    entities = rawEntities.map(e => ({ ...e, ...nearestTile(tiles.get(e.map), e.x, e.y) }));
    const names = [...[0,12,4,19,39].map(id => `map-${id}.png`), ...[0, 1, 2, 7, 9, 13, 17, 27, 39, 40, 43, 44, 45, 46, 47].map(id => `sprite-${id}.png`), 'flower.png', 'fx-wave.png', 'fx-aura.png', 'fx-fire.png', 'slash.png'];
    names.push('flight-0.png','flight-1.png','flight-2.png');
    await Promise.all([...new Set(data[5].sprites.map(s=>s.source))].map(async name=>{
      const image=new Image();image.src='assets/'+name;await image.decode();images.set('original-'+name,image);
    }));
    let done = 0;
    await Promise.all(names.map(name => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => { images.set(name, image); done++; $('#loading-status').textContent = `正在铺开山河 · ${Math.round(done / names.length * 100)}%`; resolve(); };
      image.onerror = () => reject(new Error(name)); image.src = hd(name === 'flower.png' ? 'item-flower' : name.replace('.png',''));
    })));
    loaded = true; $('#loading-status').textContent = '山河已备，静候君来。'; $('#title-screen').classList.remove('loading');
    resize(); renderHUD(); refreshTitle(); applySettings(); requestAnimationFrame(frame);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (error) {
    $('#loading-status').textContent = '山河未能展开，请刷新重试。';
    $('#fatal').classList.remove('hidden'); $('#fatal').textContent = `资源加载失败（${error.message}）。请通过启动游戏.cmd 或 npm start 启动后，用浏览器打开 http://localhost:4173。`;
  }
}
initialize();
