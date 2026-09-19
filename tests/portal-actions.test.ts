import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,confirmed,type Live,type Intent,type Prepared} from '../backend/mbp.ts';
import {submitPortalForm} from '../backend/portals.ts';
import type {Page} from 'playwright';
globalThis.fetch=(async()=>{throw Error('Real network forbidden in portal scheduling tests.');}) as typeof fetch;
const intent:Intent={kind:'schedule',description:'Footing',date:'2026-09-22',name:'Mock Contact',phone:'2065550100',email:'mock@example.invalid',message:'Mock only',timeSlot:'any'};
const inspection={id:'footing',name:'Footing',category:'Building',status:'available' as const,sourceStatus:'Available to request',date:'',dates:[],restricted:false,restriction:'',history:[]};
const live:Live={available:[{Description:'Footing',InspectionId:'mock-inspection',InspectionRestricted:false,InspectionDates:['2026-09-22'],CancellationPhoneNumber:null,timeSlots:[{value:'any',label:'ANY AVAILABLE'}]}],scheduled:[],history:[],inspections:[inspection]};
for(const city of ['Clyde Hill','Medina','Redmond'])test(city+' review rejects stale dates, restrictions, passed inspections, duplicates and invalid slots',()=>{
 const target={city,number:'MOCK-PERMIT',jurisdiction:0,sourceId:'mock-permit'};
 const action=prepare(target,intent,live);assert.equal(action.body.inspectionId,'mock-inspection');assert.match(action.label,/ANY AVAILABLE/);
 assert.throws(()=>prepare(target,{...intent,date:'2026-09-23'},live),/no longer available/);
 assert.throws(()=>prepare(target,{...intent,timeSlot:'invalid'},live),/time slot/);
 assert.throws(()=>prepare(target,{...intent,phone:'bad'},live),/contact/);
 assert.throws(()=>prepare(target,intent,{...live,inspections:[{...inspection,status:'passed'}]}),/not available/);
 assert.throws(()=>prepare(target,intent,{...live,available:[{...live.available[0],InspectionRestricted:true}]}),/not available/);
 assert.throws(()=>prepare(target,intent,{...live,scheduled:[{Description:'Footing',InspectionDate:intent.date,UniqueId:'mock',InspectionType:null,ConfirmationNumber:null,InspectionCancellable:false}]}),/already has/);
 assert.throws(()=>prepare(target,{...intent,kind:'cancel'},live),/source portal/);
 assert.equal(confirmed(action,live),false);
 assert.equal(confirmed(action,{...live,scheduled:[{Description:'Footing',InspectionDate:intent.date,UniqueId:'mock',InspectionType:null,ConfirmationNumber:null,InspectionCancellable:false}]}),true);
});
function fakePage(city:string,wrongPermit=false){
 const clicks:string[]=[],filled=new Map<string,string>();
 const locator=(selector:string):unknown=>({
  locator:(child:string)=>locator(child),first:()=>locator(selector),filter:({hasText}:{hasText:RegExp})=>locator(selector+' '+String(hasText)),
  async inputValue(){return selector.includes('Case.Id')?wrongPermit?'different':'mock-permit':selector==='#Id'?'mock-inspection':'Tuesday, September 22 2026';},
  async innerText(){return 'MOCK-PERMIT mock-inspection';},async waitFor(){},async press(){},
  async fill(value:string){filled.set(selector,value);},async selectOption(value:string){filled.set(selector,value);},async click(){clicks.push(selector);}
 });
 return {page:{locator,async waitForLoadState(){},async waitForNavigation(){},async waitForResponse(){}} as unknown as Page,clicks,filled};
}
for(const city of ['Clyde Hill','Medina','Redmond'])test(city+' adapter submits exactly one final control, using a fake page only',async()=>{
 const action:Prepared=prepare({city,number:'MOCK-PERMIT',jurisdiction:0,sourceId:'mock-permit'},intent,live);
 const fake=fakePage(city);await submitPortalForm(fake.page,action);
 const submits=fake.clicks.filter(s=>/SendRequest|SCHEDULE INSPECTION|button-Submit/.test(s));assert.equal(submits.length,1);
 assert.ok([...fake.filled.values()].some(value=>value.includes('mock@example.invalid')));
 if(city==='Medina'){assert.equal(fake.filled.get('select[name="CurrentInspectionOccurrence.RequestedForTimeSlot"]'),'any');const wrong=fakePage(city,true);await assert.rejects(submitPortalForm(wrong.page,action),/selected inspection changed/);assert.equal(wrong.clicks.length,0);}
 if(city==='Clyde Hill')assert.match(fake.clicks[0],/CONTINUE/);
});
