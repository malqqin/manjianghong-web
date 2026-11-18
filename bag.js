import {equipment,itemArt,equipItem,grantEquipment,clampPartyVitals}from'./journey.js';
import{equipmentCount,equipmentAvailable,removeEquipment}from'./inventory.js';
import{itemRecord,applyItem,addItem}from'./items.js';
import{characterStats}from'./progression.js';
import{partyNames}from'./skills.js';
import{characterRules}from'./character-rules.js';
import{originalRules}from'./original-rules.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slotNames={weapon:'武器',armor:'衣甲',bracer:'护腕',ring:'戒指',jade:'玉佩',quest:'信物'};
// Medicine and manuals share category illustrations; equipment uses its own artwork.
const supplyArt=index=>'assets/native/item-'+(index>=17&&index<=72?'book':[2,3,4,7].includes(index)?'flower':index===6?'jade':'potion')+'.png';
export function openBag(state,ui,title='行囊',selection={tab:'all',id:null}){
 const j=state.journey,actors=['hero',...j.members],slots=a=>a==='hero'?j.equipped:j.companionEquipment?.[a],render=()=>openBag(state,ui,title,selection);
 const entries=[...j.owned.filter(id=>equipmentCount(state,id)>0).map(id=>{
  const item=equipment[id];return {id:'gear:'+id,key:id,item,count:equipmentCount(state,id),kind:item.slot==='quest'?'quest':'gear',art:itemArt(item),wearers:actors.filter(a=>slots(a)?.[item.slot]===id)};
 }),...Object.entries(j.items||{}).filter(([,n])=>n>0).map(([id,count])=>({id:'item:'+id,key:id,item:itemRecord(id),count,kind:id>=17&&id<=72?'manual':'medicine',art:supplyArt(Number(id)),wearers:[]}))];
 const tabs=[['all','全部'],['gear','装备'],['medicine','药品'],['manual','秘籍'],['quest','信物']],shown=entries.filter(e=>selection.tab==='all'||e.kind===selection.tab);
 const selected=shown.find(e=>e.id===selection.id)||null;
 const cells=shown.map(e=>`<button class="bag-cell ${e.item.rarity==='神兵'?'rare':''}" data-bag-item="${e.id}" aria-pressed="${e===selected}" aria-label="${escape(e.item.name)}，${e.count}件${e.wearers.length?'，已装备':''}" title="${escape(e.item.name)}"><img src="${e.art}" alt=""><small>${e.count}</small>${e.wearers.length?'<b>装</b>':''}<span>${escape(e.item.name)}</span></button>`).join('');
 let detail='<div class="bag-empty-detail"><span aria-hidden="true">囊</span><p>轻点物品，查看详情</p><small>装备 · 药品 · 秘籍 · 信物</small></div>';
 if(selected){
  const e=selected,item=e.item,arm=item.originalId==null?null:originalRules.arms[item.originalId];
  const bonuses=arm?[['攻击',arm.stats[0]===arm.stats[1]?arm.stats[0]:arm.stats[0]+'—'+arm.stats[1]],['防御',arm.stats[2]],['生命',arm.stats[5]],['精气',arm.properties[4]]].filter(([,v])=>v&&v!=='0'):[];
  detail=`<div class="bag-detail-heading"><div class="bag-detail-art"><img src="${e.art}" alt="${escape(item.name)}"></div><div><small>${escape(item.rarity||slotNames[item.slot]||({manual:'武功秘籍',medicine:'药品'})[e.kind]||'随身物品')}</small><h3>${escape(item.name)}</h3><span>持有 ${e.count} 件</span></div></div><p class="bag-description">${escape(item.description)}</p>${bonuses.length?`<dl class="bag-stats">${bonuses.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`:''}${arm?`<p class="bag-condition">需 ${arm.properties[10]} 级 · ${item.actors.map(a=>partyNames[a]).join('、')}可用</p>`:''}${e.wearers.length?`<p class="bag-wearer">${e.wearers.map(a=>partyNames[a]).join('、')}正在佩戴 · 闲置 ${equipmentAvailable(state,e.key)} 件</p>`:''}${e.kind==='medicine'?`<p class="bag-condition">战斗中${item.properties[9]&1?'消耗一次行动':'不消耗行动'}</p>`:''}<div class="bag-detail-actions">${e.kind==='gear'?`<button class="native-confirm" data-equip="${e.key}">装备 / 卸下</button>`:e.kind==='quest'?'<span>剧情信物，随身保管</span>':`<button class="native-confirm" data-native-use="${e.key}">${e.kind==='manual'?'研习秘籍':'使用药品'}</button>`}</div>`;
 }
 ui.openSheet(title,`<div class="bag-toolbar"><span>随身物品 <b>${entries.length}</b></span><strong>${state.coins.toLocaleString()} <small>两</small></strong></div><div class="bag-tabs" role="group" aria-label="物品分类">${tabs.map(([id,label])=>`<button data-bag-tab="${id}" aria-pressed="${selection.tab===id}">${label}</button>`).join('')}</div><div class="bag-layout"><div class="bag-storage"><div class="bag-grid" aria-label="行囊物品">${cells}${Array.from({length:Math.max(0,20-shown.length)},()=>'<div class="bag-cell empty" aria-hidden="true"></div>').join('')}</div>${!shown.length?'<p class="bag-no-items">此分类暂无物品</p>':''}</div><section class="bag-detail" aria-label="物品详情" aria-live="polite">${detail}</section></div><div class="bag-footer"><small>轻点格子查看 · 标记「装」为已佩戴</small><button id="open-martial">人物与武功 →</button></div>`,'随身珍藏','bag');
 $$('[data-bag-tab]').forEach(button=>button.onclick=()=>{selection={tab:button.dataset.bagTab,id:null};render();});
 $$('[data-bag-item]').forEach(button=>button.onclick=()=>{selection.id=button.dataset.bagItem;render();$(`[data-bag-item="${selection.id}"]`)?.focus({preventScroll:true});});
 $('#open-martial').onclick=()=>ui.characters('hero','skills');
 $$('[data-equip]').forEach(button=>button.onclick=async()=>{
  const id=button.dataset.equip,item=equipment[id],eligible=actors.filter(a=>!item.actors||item.actors.includes(a)).filter(a=>!item.actor||item.actor===a);
  if(!eligible.length)return ui.toast('当前队伍尚无可使用这件装备的人物。');
  const options=[...eligible.map(a=>`交予${partyNames[a]}佩戴`),...eligible.filter(a=>(a==='hero'?j.equipped:j.companionEquipment?.[a])?.[item.slot]===id).map(a=>`卸下${partyNames[a]}的${item.name}`)];
  const worn=eligible.filter(a=>(a==='hero'?j.equipped:j.companionEquipment?.[a])?.[item.slot]===id),choice=await ui.prompt(item.name,options,-1);
  if(choice<0)return render();
  if(choice>=eligible.length){const a=worn[choice-eligible.length];delete (a==='hero'?j.equipped:j.companionEquipment[a])[item.slot];clampPartyVitals(state);}
  else if(!equipItem(state,id,eligible[choice])){render();return ui.toast('人物等级或使用条件不符，请查看装备说明。');}
  ui.renderHUD();ui.saveGame();render();
 });
 $$('[data-native-use]').forEach(button=>button.onclick=async()=>{
  const index=Number(button.dataset.nativeUse);if(index>=17&&index<=72){
   const choice=await ui.prompt('由谁研习',actors.map(a=>partyNames[a]),-1);if(choice<0)return render();return ui.characters(actors[choice],'skills');
  }
  const item=itemRecord(index),all=item.properties[2]===2,choice=all?0:await ui.prompt('交给谁服用',actors.map(a=>partyNames[a]),-1);
  if(choice<0)return render();
  const targets=all?actors:[actors[choice]];let used=false,message='';
  for(const actor of targets){
   const stats=characterStats(state,actor),source=actor==='hero'?state:(j.partyVitals||={})[actor]||((j.partyVitals[actor])={hp:stats.maxHP,mp:stats.maxMP});
   const target={...source,maxHP:stats.maxHP,maxMP:stats.maxMP},result=applyItem(target,index);message=result.message;
   if(result.ok){source.hp=target.hp;source.mp=target.mp;used=true;}
  }
  if(used){j.items[index]--;ui.renderHUD();ui.saveGame();}render();if(!used)ui.toast(message);
 });
}
export function openNativeShop(state,ui,kind,shopIndex){
 return new Promise(resolve=>{
  const stock=[...new Set(characterRules.shops[shopIndex*2]||[])],record=n=>kind===0?originalRules.arms[n]:itemRecord(n),count=n=>kind===0?equipmentAvailable(state,'arm-'+n):state.journey.items?.[n]||0;
  const render=()=>{
   const selling=kind===0?state.journey.owned.filter(id=>id.startsWith('arm-')&&equipmentAvailable(state,id)>0).map(id=>Number(id.slice(4))):Object.keys(state.journey.items||{}).map(Number).filter(n=>count(n)>0);
   ui.openSheet('商店',`<div class="wallet"><strong>${state.coins} 两</strong><span>${kind===0?'兵器装备':'药品与秘籍'}</span></div><h3>购入</h3>${stock.map(n=>{const item=record(n);return `<div class="manual-row"><div><strong>${escape(item.name)}</strong><p>${escape(item.description)} · ${item.properties[0]} 两</p></div><button data-native-buy="${n}" ${state.coins<item.properties[0]||(kind===0?equipmentCount(state,'arm-'+n):count(n))>=99?'disabled':''}>购入</button></div>`;}).join('')}<h3>出售</h3>${selling.map(n=>{const item=record(n);return `<div class="manual-row"><div><strong>${escape(item.name)} ×${count(n)}</strong><p>${item.properties[1]} 两</p></div><button data-native-sell="${n}">出售</button></div>`;}).join('')||'<p>没有可出售的物品，已佩戴的装备需先卸下。</p>'}<button id="native-shop-done" class="primary-button">离开商店</button>`,'购入 · 出售');
   ui.onDismiss(resolve);
   $$('[data-native-buy]').forEach(button=>button.onclick=()=>{const n=Number(button.dataset.nativeBuy),item=record(n);if(state.coins<item.properties[0])return;if(kind===0)grantEquipment(state,'arm-'+n);else addItem(state,n);state.coins-=item.properties[0];ui.saveGame();render();});
   $$('[data-native-sell]').forEach(button=>button.onclick=()=>{const n=Number(button.dataset.nativeSell),item=record(n);if(count(n)<1)return;if(kind===0){if(!removeEquipment(state,'arm-'+n))return;}else state.journey.items[n]--;state.coins+=item.properties[1];ui.saveGame();render();});
   $('#native-shop-done').onclick=ui.closeSheet;
  };render();
 });
}
