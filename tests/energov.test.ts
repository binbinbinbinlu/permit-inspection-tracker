import test from 'node:test';
import assert from 'node:assert/strict';
import {redmondBase,resolveRedmondPermitUrl,normalizeEnergov,parseEnergovChecklist,type EnergovHistory} from '../lib/energov.ts';
import {validatePermit} from '../lib/permit-request.ts';
const history:EnergovHistory={id:'inspection-1',name:'BLDG Footings/Setback',status:'Approved',date:'08/04/2026',time:'9:00 AM',inspector:'Inspector',notes:'Approved after corrections',url:'https://cityofredmondwa-energovweb.tylerhost.net/apps/selfservice#/inspectionDetail/inspection/example'};

test('tracked Redmond permits resolve even when portal search is unavailable',async()=>{
 const unavailable=async():Promise<never>=>{throw Error('Search timed out');};
 assert.equal(await resolveRedmondPermitUrl('BLDG-2025-07156',unavailable),redmondBase+'#/permit/654d0ef4-261a-4286-9797-b5035c2fc40c');
 assert.equal(await resolveRedmondPermitUrl('CGP-2025-07539',unavailable),redmondBase+'#/permit/b08eaa7a-8fed-4149-a825-6e0f32f35119');
});

test('new Redmond permits use search and validate its destination',async()=>{
 const path='#/permit/11111111-2222-3333-4444-555555555555';let searches=0;
 assert.equal(await resolveRedmondPermitUrl('BLDG-2026-00001',async()=>{searches++;return path;}),redmondBase+path);
 assert.equal(searches,1);
 assert.equal(await resolveRedmondPermitUrl('BLDG-2026-00001',async()=>redmondBase+path),redmondBase+path);
 for(const href of [null,'https://example.invalid/'+path,redmondBase+'?token=unexpected'+path,'#/permit/invalid','#/inspectionDetail/inspection/11111111-2222-3333-4444-555555555555']){
  await assert.rejects(resolveRedmondPermitUrl('BLDG-2026-00001',async()=>href),/permit link/);
 }
 await assert.rejects(resolveRedmondPermitUrl('BLDG-2026-00001',async()=>{throw Error('Search timed out');}),/Search timed out/);
});
test('Redmond latest approval supersedes corrections and retains original notes',()=>{
 const result=normalizeEnergov([],[{...history,id:'old',status:'Correction Required',date:'07/24/2026'},history])[0];
 assert.equal(result.status,'passed');assert.equal(result.history.length,2);assert.equal(result.history[0].Notes,history.notes);assert.equal(result.history[0].DocumentUrl,history.url);
});
test('same-day later correction takes precedence over earlier approval',()=>{
 const result=normalizeEnergov([],[history,{...history,id:'later',status:'Correction Required',time:'1:00 PM'}])[0];
 assert.equal(result.status,'pending');assert.equal(result.sourceStatus,'Correction Required');
});
test('later scheduled inspection reopens an older approved result',()=>{
 assert.equal(normalizeEnergov([],[history,{...history,id:'scheduled',status:'Scheduled',date:'08/05/2026',time:''}])[0].status,'pending');
});
test('available, restricted and reinspection rows are distinguished',()=>{
 const item={name:history.name,reinspection:false,requestable:true};
 assert.equal(normalizeEnergov([item],[])[0].status,'available');
 assert.equal(normalizeEnergov([{...item,requestable:false}],[])[0].status,'pending');
 assert.equal(normalizeEnergov([{...item,reinspection:true}],[history])[0].status,'pending');
});
test('partial approval and workload deferral remain pending',()=>{
 for(const status of ['Partial Approval','Not Done Due to Workload'])assert.equal(normalizeEnergov([],[{...history,status}])[0].status,'pending');
});
test('inspection not required is resolved with its original source label',()=>{
 const result=normalizeEnergov([],[{...history,status:'Inspection Not Required'}])[0];
 assert.equal(result.status,'passed');assert.equal(result.sourceStatus,'Inspection Not Required');
});
test('duplicate paginated records and incomplete approvals fail closed',()=>{
 assert.throws(()=>normalizeEnergov([],[history,history]),/duplicate/);
 assert.throws(()=>normalizeEnergov([],[{...history,date:''}]),/incomplete/);
});
test('both Redmond permit types can use the existing add-permit flow',()=>{
 for(const number of ['BLDG-2025-07156','CGP-2025-07539'])assert.deepEqual(validatePermit({city:'Redmond',number}),{city:'Redmond',number});
});
test('explicit Redmond no-content response is a valid empty checklist',()=>{
 assert.deepEqual(parseEnergovChecklist({StatusCode:204,Success:false,Result:null}),{total:0,loaded:0,notes:''});
});
test('Redmond checklist response retains comments and pagination totals',()=>{
 assert.deepEqual(parseEnergovChecklist({StatusCode:200,Success:true,TotalFound:11,Result:[{CheckListItem:'Inspection Comments',Comments:'Not ready '}]}),{total:11,loaded:1,notes:'Inspection Comments: Not ready'});
});
test('Redmond checklist errors never masquerade as no comments',()=>{
 for(const input of [null,{}, {StatusCode:500,Success:false,Result:null},{Success:true,TotalFound:0,Result:[{CheckListItem:'A'}]},{Success:true,TotalFound:1,Result:[{CheckListItem:123}]}])assert.throws(()=>parseEnergovChecklist(input),/invalid/);
});
