import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEnergov,type EnergovHistory} from '../lib/energov.ts';
import {validatePermit} from '../lib/permit-request.ts';
const history:EnergovHistory={id:'inspection-1',name:'BLDG Footings/Setback',status:'Approved',date:'08/04/2026',time:'9:00 AM',inspector:'Inspector',notes:'Approved after corrections',url:'https://cityofredmondwa-energovweb.tylerhost.net/apps/selfservice#/inspectionDetail/inspection/example'};
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
