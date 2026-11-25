import {equipment,equipItem,grantEquipment,clampPartyVitals}from'./journey.js';
import{equipmentCount,equipmentAvailable,removeEquipment}from'./inventory.js';
import{itemRecord,applyItem,addItem}from'./items.js';
import{inventoryArt,supplyArt}from'./inventory-art.js';
import{characterStats,learnManual}from'./progression.js';
import{partyNames}from'./skills.js';
import{characterRules}from'./character-rules.js';
import{originalRules}from'./original-rules.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slotNames={weapon:'武器',armor:'衣甲',bracer:'护腕',ring:'戒指',jade:'玉佩',quest:'信物'};
const isManual=index=>index>=17&&index<=72;
const rankLabel=index=>'第'+((index-17)%4+1)+'重';
const manualOwner=index=>index<33?'hero':index<49?'fei':index<69?'lan':null;
function manualDetails(index){
 const skill=characterRules.skills[index-17],rank=(index-17)%4+1,owner=manualOwner(index);
 return `<p class="bag-condition">${escape(skill.name)} · ${rankLabel(index)} · ${characterRules.minimumLevels[index-17]||1} 级<br>${owner?partyNames[owner]:'全队均可研习'}${rank>1?' · 需先领悟第 '+(rank-1)+' 重':''}</p>`;
}
export function openBag(state,ui,title='行囊',selection={tab:'all',id:null}){
 const j=state.journey,actors=['hero',...j.members],slots=a=>a==='hero'?j.equipped:j.companionEquipment?.[a],render=()=>openBag(state,ui,title,selection);
 const entries=[...j.owned.filter(id=>equipmentCount(state,id)>0).map(id=>{
  const item=equipment[id];return {id:'gear:'+id,key:id,item,count:equipmentCount(state,id),kind:item.slot==='quest'?'quest':'gear',art:inventoryArt(item),wearers:actors.filter(a=>slots(a)?.[item.slot]===id)};
 }),...Object.entries(j.items||{}).filter(([,n])=>n>0).map(([id,count])=>({id:'item:'+id,key:id,item:itemRecord(id),count,kind:id>=17&&id<=72?'manual':'medicine',art:supplyArt(Number(id)),wearers:[]}))];
 const tabs=[['all','全部'],['gear','装备'],['medicine','药品'],['manual','秘籍'],['quest','信物']],shown=entries.filter(e=>selection.tab==='all'||e.kind===selection.tab);
 const selected=shown.find(e=>e.id===selection.id)||null;
 const storageScroll=$('.bag-storage')?.scrollTop||0;
 const cells=shown.map(e=>`<button class="bag-cell ${e.item.rarity==='神兵'?'rare':''}" data-bag-item="${e.id}" aria-pressed="${e===selected}" aria-label="${escape(e.item.name)}，${e.count}件${e.wearers.length?'，已装备':''}" title="${escape(e.item.name)}"><img src="${e.art}" alt=""><small>${e.count}</small>${e.wearers.length?'<b>装</b>':''}<span>${escape(e.item.name)}</span></button>`).join('');
 let detail='<div class="bag-empty-detail"><span aria-hidden="true">囊</span><p>轻点物品，查看详情</p><small>装备 · 药品 · 秘籍 · 信物</small></div>';
 if(selected){
  const e=selected,item=e.item,arm=item.originalId==null?null:originalRules.arms[item.originalId];
  const bonuses=arm?[
    ...(arm.stats[0]&&arm.stats[1]?[['攻击',arm.stats[0]===arm.stats[1]?arm.stats[0]:arm.stats[0]+'—'+arm.stats[1]]]:
      [['最小攻击',arm.stats[0]],['最大攻击',arm.stats[1]]]),['防御',arm.stats[2]],['生命',arm.stats[5]],['精气',arm.properties[4]],
    ['生命上限',arm.properties[5]&&arm.properties[5]*100+'%'],
    ['精气上限',arm.properties[6]&&arm.properties[6]*100+'%'],
    ['闪避',arm.stats[3]&&arm.stats[3]/100+'%'],['暴击',arm.stats[4]&&arm.stats[4]/100+'%'],
    ['命中',arm.rates[0]&&arm.rates[0]+'%'],['减伤',arm.rates[1]&&arm.rates[1]+'%'],
    ...['冰冻','灼烧','混乱'].map((name,i)=>[name+'抗性',arm.status[i][0]&&arm.status[i][0]+'%'])
  ].filter(([,v])=>v):[];
  detail=`<div class="bag-detail-heading"><div class="bag-detail-art"><img src="${e.art}" alt="${escape(item.name)}"></div><div><small>${escape(item.rarity||slotNames[item.slot]||({manual:'武功秘籍',medicine:'药品'})[e.kind]||'随身物品')}</small><h3>${escape(item.name)}</h3><span>持有 ${e.count} 件</span></div></div><p class="bag-description">${escape(item.description)}</p>${e.kind==='manual'?manualDetails(Number(e.key)):''}${bonuses.length?`<dl class="bag-stats">${bonuses.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`:''}${arm?`<p class="bag-condition">需 ${arm.properties[10]} 级 · ${item.actors.map(a=>partyNames[a]).join('、')}可用</p>`:''}${e.wearers.length?`<p class="bag-wearer">${e.wearers.map(a=>partyNames[a]).join('、')}正在佩戴 · 闲置 ${equipmentAvailable(state,e.key)} 件</p>`:''}${e.kind==='medicine'?`<p class="bag-condition">战斗中${item.properties[9]&1?'消耗一次行动':'不消耗行动'}</p>`:''}<div class="bag-detail-actions">${e.kind==='gear'?`<button class="native-confirm" data-equip="${e.key}">装备 / 卸下</button>`:e.kind==='quest'?'<span>剧情信物，随身保管</span>':`<button class="native-confirm" data-native-use="${e.key}">${e.kind==='manual'?'研习秘籍':'使用药品'}</button>`}</div>`;
 }
 ui.openSheet(title,`<div class="bag-toolbar"><span>随身物品 <b>${entries.length}</b></span><strong>${state.coins.toLocaleString()} <small>两</small></strong></div><div class="bag-tabs" role="group" aria-label="物品分类">${tabs.map(([id,label])=>`<button data-bag-tab="${id}" aria-pressed="${selection.tab===id}">${label}</button>`).join('')}</div><div class="bag-layout"><div class="bag-storage"><div class="bag-grid" aria-label="行囊物品">${cells}${Array.from({length:Math.max(0,20-shown.length)},()=>'<div class="bag-cell empty" aria-hidden="true"></div>').join('')}</div>${!shown.length?'<p class="bag-no-items">此分类暂无物品</p>':''}</div><section class="bag-detail" aria-label="物品详情" aria-live="polite">${detail}</section></div><div class="bag-footer"><small>轻点格子查看 · 标记「装」为已佩戴</small><button id="open-martial">人物与武功 →</button></div>`,'随身珍藏','bag');
 $('.bag-storage').scrollTop=selection.id?storageScroll:0;
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
   const owner=manualOwner(index),candidates=actors.filter(a=>!owner||a===owner);
   if(!candidates.length)return ui.toast('适合研习这本秘籍的人物尚未加入队伍。');
   const choice=await ui.prompt('由谁研习',candidates.map(a=>partyNames[a]),-1);
   if(choice<0)return render();
   const result=learnManual(state,candidates[choice],index);
   if(result.ok){ui.renderHUD();ui.saveGame();if(!j.items[index])selection.id=null;}
   render();ui.toast(result.message);return;
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
  const arms=kind===0,title=arms?'武器铺':'药铺';
  const stock=[...new Set(characterRules.shops[shopIndex*2]||[])];
  const record=n=>arms?originalRules.arms[n]:itemRecord(n);
  const count=n=>arms?equipmentAvailable(state,'arm-'+n):state.journey.items?.[n]||0;
  const total=n=>arms?equipmentCount(state,'arm-'+n):count(n);
  let tab='buy';
  const render=()=>{
   const buying=tab==='buy',scroll=$('.shop-cards')?.scrollTop||0;
   const selling=arms?state.journey.owned.filter(id=>id.startsWith('arm-')&&equipmentAvailable(state,id)>0).map(id=>Number(id.slice(4))):
    Object.keys(state.journey.items||{}).map(Number).filter(n=>count(n)>0);
   const cards=(buying?stock:selling).filter(n=>record(n)).map(n=>{
    const item=record(n),price=item.properties[buying?0:1],art=arms?inventoryArt(equipment['arm-'+n]):supplyArt(n);
    const disabled=buying&&(state.coins<price||total(n)>=99);
    const label=disabled?(total(n)>=99?'已达上限':'银两不足'):buying?'买入':'出售';
    const category=arms?slotNames[equipment['arm-'+n].slot]:isManual(n)?'秘籍 · '+rankLabel(n):'药品';
    return `<article class="shop-card"><div class="shop-art"><img src="${art}" alt=""></div><div class="shop-copy">
     <small>${category} · ${buying?'持有 '+total(n):'可出售 '+count(n)} 件</small><h3>${escape(item.name)}</h3>
     <p>${escape(item.description)}</p></div><div class="shop-price"><b>${price.toLocaleString()} <small>两</small></b>
     <button data-shop-item="${n}" ${disabled?'disabled':''}>${label}</button></div></article>`;
   }).join('');
   ui.openSheet(title,`<div class="shop-merchant"><div><strong>${arms?'兵器与防具':'药品与武功秘籍'}</strong><p>${arms?'已佩戴的装备卸下后可出售。':'选购补给或研习所需的秘籍。'}</p></div>
    <div class="shop-balance"><small>随身银两</small><b>${state.coins.toLocaleString()} 两</b></div></div>
    <div class="bag-tabs shop-tabs" aria-label="交易方式"><button data-shop-tab="buy" aria-pressed="${buying}">买入</button><button data-shop-tab="sell" aria-pressed="${!buying}">出售</button></div>
    <div class="shop-cards">${cards||'<p class="shop-empty">这里暂时没有可交易的物品。</p>'}</div>
    <div class="shop-footer"><button id="native-shop-done" class="secondary-button">离开商店</button></div>`,arms?'兵器装备':'医药补给','shop');
   $('.shop-cards').scrollTop=scroll;
   ui.onDismiss(resolve);
   $$('[data-shop-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.shopTab;$('.shop-cards').scrollTop=0;render();});
   $$('[data-shop-item]').forEach(button=>button.onclick=()=>{
    const n=Number(button.dataset.shopItem),item=record(n);
    if(buying){
     const price=item.properties[0];
     if(state.coins<price||total(n)>=99)return;
     if(arms)grantEquipment(state,'arm-'+n);else addItem(state,n);
     state.coins-=price;
    }else{
     if(count(n)<1)return;
     if(arms){if(!removeEquipment(state,'arm-'+n))return;}
     else state.journey.items[n]--;
     state.coins+=item.properties[1];
    }
    ui.saveGame();render();
    ui.toast?.((buying?'已买入':'已出售')+item.name);
   });
   $('#native-shop-done').onclick=ui.closeSheet;
  };
  render();
 });
}
