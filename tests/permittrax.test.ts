import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePermitTrax,type PermitTraxRow} from '../lib/permittrax.ts';
import {validatePermit} from '../lib/permit-request.ts';
const row:PermitTraxRow={id:'INSP_0002',name:'Foundation Footings',status:'',schedule:'',canSchedule:true,history:[]};
test('public calendar control with no result is available',()=>{
 assert.equal(normalizePermitTrax([row])[0].status,'available');
 assert.equal(normalizePermitTrax([{...row,canSchedule:false}])[0].status,'pending');
});
test('PermitTrax DONE/COMPLETE and dated approval are passed',()=>{
 const result=normalizePermitTrax([{...row,status:'DONE',schedule:'COMPLETE',history:[{Description:row.name,Date:'11/07/2025',Status:'INSPECTION APPROVED',Notes:'Verified'}]}])[0];
 assert.equal(result.status,'passed');assert.equal(result.date,'2025-11-07');assert.equal(result.history[0].Notes,'Verified');
});
test('latest correction remains pending even if checklist says DONE',()=>{
 const result=normalizePermitTrax([{...row,status:'DONE',schedule:'COMPLETE',history:[{Description:row.name,Date:'11/01/2025',Status:'INSPECTION APPROVED'},{Description:row.name,Date:'11/07/2025',Status:'CORRECTIONS REQUIRED'}]}])[0];
 assert.equal(result.status,'pending');assert.equal(result.sourceStatus,'CORRECTIONS REQUIRED');assert.equal(result.history.length,2);
});
test('scheduled and unknown statuses never become passed from an old approval',()=>{
 for(const status of ['SCHEDULED','PARTIAL','UNKNOWN'])assert.equal(normalizePermitTrax([{...row,status,history:[{Description:row.name,Date:'11/07/2025',Status:'INSPECTION APPROVED'}]}])[0].status,'pending');
});
test('same-day approval preserves PermitTrax newest-first order over partial approval',()=>{
 const result=normalizePermitTrax([{...row,status:'DONE',schedule:'COMPLETE',history:[{Description:row.name,Date:'01/07/2026',Status:'INSPECTION APPROVED'},{Description:row.name,Date:'01/07/2026',Status:'PARTIAL APPROVAL'}]}])[0];
 assert.equal(result.status,'passed');assert.equal(result.history.length,2);
});
test('a requestable row with a partial approval remains pending',()=>{
 assert.equal(normalizePermitTrax([{...row,history:[{Description:row.name,Date:'01/20/2026',Status:'PARTIAL APPROVAL'}]}])[0].status,'pending');
});
test('duplicate or malformed checklist fails instead of publishing partial data',()=>{
 assert.throws(()=>normalizePermitTrax([row,row]),/duplicate/);
 assert.throws(()=>normalizePermitTrax([{...row,name:''}]),/invalid/);
});
test('Clyde Hill can be requested through the existing add-permit flow',()=>{
 assert.deepEqual(validatePermit({city:'Clyde Hill',number:'bld2025-0125'}),{city:'Clyde Hill',number:'BLD2025-0125'});
});
