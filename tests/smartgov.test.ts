import test from 'node:test';
import assert from 'node:assert/strict';
import {medinaPermitId,medinaPermitUrl,normalizeSmartGov,type SmartGovRow} from '../lib/smartgov.ts';
import {validatePermit,parseIssue} from '../lib/permit-request.ts';
const sourceId='f8ca2f6a-b0aa-4d73-a823-b3fc013cb003';
const row:SmartGovRow={name:'Building-Foundation Footings',date:'',status:'',canRequest:true,resultUrl:''};
test('Medina requestable inspection is grey; unknown restriction is pending',()=>{
 assert.equal(normalizeSmartGov([row])[0].status,'available');
 assert.equal(normalizeSmartGov([{...row,canRequest:false}])[0].status,'pending');
});
test('Medina approval retains its date and result report',()=>{
 const report='https://ci-medina-wa.smartgovcommunity.com/Application/CaseApplication/InspectionReport/'+sourceId;
 const result=normalizeSmartGov([{...row,status:'Approved',date:'8/13/2026',canRequest:false,resultUrl:report}])[0];
 assert.equal(result.status,'passed');assert.equal(result.date,'2026-08-13');assert.equal(result.history[0].DocumentUrl,report);
});
test('later scheduled or partial results reopen a previous approval',()=>{
 for(const status of ['Scheduled','Partial Approval','Corrections Required']){
  const result=normalizeSmartGov([{...row,status:'Approved',date:'8/13/2026'},{...row,status,date:'8/14/2026'}])[0];
  assert.equal(result.status,'pending');assert.equal(result.history.length,2);
 }
});
test('malformed Medina records fail rather than looking available',()=>{
 assert.throws(()=>normalizeSmartGov([{...row,status:'Approved'}]),/incomplete/);
 assert.throws(()=>normalizeSmartGov([{...row,name:''}]),/incomplete/);
});
test('Medina links accept only the known portal and a permit GUID',()=>{
 assert.equal(medinaPermitId(medinaPermitUrl(sourceId)),sourceId);
 for(const link of ['https://example.com/Permitting/PermitLandingPage/Index/'+sourceId,'https://ci-medina-wa.smartgovcommunity.com/Public/Home','javascript:alert(1)'])assert.throws(()=>medinaPermitId(link));
 assert.throws(()=>medinaPermitUrl('../../Public/Home'));
});
test('Medina add-permit requests preserve the source ID without credentials',()=>{
 const permit={city:'Medina',number:'B-26-012',sourceId};
 assert.deepEqual(validatePermit({...permit,password:'discard',username:'discard'}),permit);
 assert.throws(()=>validatePermit({city:'Medina',number:'B-26-012'}),/link/);
 assert.deepEqual(parseIssue({issue:{title:'Add permit: Medina B-26-012',author_association:'OWNER',body:'```json\n'+JSON.stringify(permit)+'\n```'}}),permit);
});
