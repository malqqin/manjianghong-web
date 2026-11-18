import { originalRules } from './original-rules.js';
export const itemRecord = index => originalRules.items[index];
export function addItem(state,index,count=1){state.journey.items ||= {};state.journey.items[index]=Math.min(99,(state.journey.items[index]||0)+count);}
export function applyItem(target,index){
 const item=itemRecord(index),p=item?.properties;if(!p||index>=17&&index<=72)return {ok:false,message:'请在人物的武功秘籍页研习。'};
 const flags=p[9];if(target.hp<=0&&!(flags&2))return {ok:false,message:'这名人物已倒下，需要复活药品。'};
 if(flags&32)return {ok:true,escape:true,free:true,amount:0,message:item.name};
 const before=target.hp,beforeMP=target.mp;if(flags&2)target.hp=Math.max(1,target.hp);
 target.hp=Math.min(target.maxHP,target.hp+Math.trunc(target.maxHP*p[5]/100)+p[10]);
 target.mp=Math.min(target.maxMP,target.mp+Math.trunc(target.maxMP*p[6]/100)+p[11]);
 target.statuses ||= {freeze:0,burn:0,confuse:0};
 if(flags&4)target.statuses.freeze=0;if(flags&8)target.statuses.burn=0;if(flags&16)target.statuses.confuse=0;
 return {ok:true,amount:target.hp-before,manaAmount:target.mp-beforeMP,free:!(flags&1),message:item.name};
}
