// Counts include worn copies; available copies exclude each character's equipment.
export const equipmentCount=(state,id)=>state.journey?.owned.includes(id)?state.journey.armCounts?.[id]??1:0;
export function equippedCount(state,id){return [state.journey.equipped,...Object.values(state.journey.companionEquipment||{})].reduce((n,slots)=>n+Object.values(slots).filter(value=>value===id).length,0);}
export const equipmentAvailable=(state,id)=>Math.max(0,equipmentCount(state,id)-equippedCount(state,id));
export function addEquipment(state,id,count=1){
 const j=state.journey,old=equipmentCount(state,id);j.armCounts||={};j.armCounts[id]=Math.min(99,old+count);if(!j.owned.includes(id))j.owned.push(id);return old===0;
}
export function removeEquipment(state,id,count=1){
 if(equipmentAvailable(state,id)<count)return false;
 const j=state.journey;j.armCounts||={};j.armCounts[id]=equipmentCount(state,id)-count;if(!j.armCounts[id])j.owned=j.owned.filter(value=>value!==id);return true;
}
