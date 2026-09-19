import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,confirmed,httpGateway,type Live,type Intent,type Gateway} from '../backend/mbp.ts';
import {execute,reconcile,type Operation,type Store} from '../backend/actions.ts';
import worker from '../backend/worker.ts';
globalThis.fetch=(async()=>{throw Error('Real network is forbidden in inspection action tests.');}) as typeof fetch;
const target={city:'Bellevue',number:'26 112569 BR',jurisdiction:1};
const intent:Intent={kind:'schedule',description:'Footing',date:'2026-10-01',name:'Mock Contact',phone:'2065550100',email:'mock@example.invalid',message:'Mock only'};
const live:Live={available:[{Description:'Footing',InspectionType:'Building',InspectionDates:['2026-10-01T00:00:00'],InspectionRestricted:false,InspectionId:null,CancellationPhoneNumber:null}],scheduled:[],history:[]};
const booking={Description:'Footing',InspectionDate:'2026-10-01T00:00:00',UniqueId:'mock-booking',InspectionType:'Building',ConfirmationNumber:'mock-confirmation',InspectionCancellable:true};
const bellevueBooking={...booking,Description:'415 Elec-Rough In',UniqueId:'21-SEP-26 mock-booking',InspectionDate:'2026-09-21T00:00:00',InspectionType:null,ConfirmationNumber:null};
const cancelIntent:Intent={kind:'cancel',description:bellevueBooking.Description,date:'2026-09-21',bookingId:bellevueBooking.UniqueId};
function setup(){
 const records=new Map<string,Operation>();const locks=new Map<string,string>();
 const op:Operation={id:'mock-operation',action:prepare(target,intent,live),state:'review',message:'Review',expires:Date.now()+10000};records.set(op.id,structuredClone(op));
 const storage:Store={async get(id){return structuredClone(records.get(id)||null);},async put(v){records.set(v.id,structuredClone(v));},async claim(id,key){const current=records.get(id);if(locks.has(key)||current?.state!=='review')return false;locks.set(key,id);current.state='submitting';return true;},async release(key,id){if(locks.get(key)===id)locks.delete(key);}};
 return {op,storage,records,locks};
}
test('passed, restricted, stale dates and existing bookings cannot be scheduled',()=>{
 assert.throws(()=>prepare(target,intent,{...live,history:[{Description:'Footing',Status:'Passed',Date:'2026-09-01'}]}),/Passed/);
 assert.throws(()=>prepare(target,intent,{...live,available:[{...live.available[0],InspectionRestricted:true}]}),/restricted/);
 assert.throws(()=>prepare(target,{...intent,date:'2026-10-02'},live),/no longer available/);
 assert.throws(()=>prepare(target,intent,{...live,scheduled:[booking]}),/already has/);
});
test('cancellation requires exact current booking and online cancellation permission',()=>{
 const cancel:Intent={kind:'cancel',description:'Footing',date:'2026-10-01',bookingId:booking.UniqueId};
 assert.throws(()=>prepare(target,cancel,live),/cannot be cancelled/);
 assert.throws(()=>prepare(target,cancel,{...live,scheduled:[{...booking,InspectionCancellable:false}]}),/cannot be cancelled/);
 const action=prepare(target,cancel,{...live,scheduled:[booking]});
 assert.equal(action.body.confirmationNumber,'mock-confirmation');
 assert.equal(confirmed(action,{...live,available:[]}),false);
 assert.equal(confirmed(action,{...live,history:[{Description:'Footing',Date:'2026-10-01',Status:'Cancelled'}]}),true);
});
test('duplicate confirmations submit only once and success requires read-back',async()=>{
 const {op,storage}=setup();let posts=0;const gateway:Gateway={async read(){return posts?{...live,scheduled:[booking]}:live;},async send(){posts++;}};
 const results=await Promise.allSettled([execute(op.id,storage,gateway),execute(op.id,storage,gateway)]);
 assert.equal(posts,1);assert.ok(results.some(r=>r.status==='fulfilled'&&r.value.state==='succeeded'));
 await execute(op.id,storage,gateway);assert.equal(posts,1);
});
test('Bellevue cancellation without history requires a reopened future slot and no conflicting records',()=>{
 const action=prepare(target,cancelIntent,{...live,scheduled:[bellevueBooking]});
 const offer={...live.available[0],Description:bellevueBooking.Description,InspectionDates:['2026-09-21T00:00:00']};
 const reopened={...live,available:[offer]};
 const now=new Date('2026-09-20T20:00:00Z');
 assert.equal(confirmed(action,reopened,now),true);
 assert.equal(confirmed(action,{...reopened,available:[]},now),false);
 assert.equal(confirmed(action,{...reopened,available:[{...offer,InspectionRestricted:true}]},now),false);
 assert.equal(confirmed(action,{...reopened,available:[{...offer,InspectionDates:['2026-09-22']}]},now),false);
 assert.equal(confirmed(action,{...reopened,scheduled:[bellevueBooking]},now),false);
 assert.equal(confirmed(action,{...reopened,scheduled:[{...bellevueBooking,UniqueId:'replacement'}]},now),false);
 assert.equal(confirmed(action,{...reopened,history:[{Description:offer.Description,Date:cancelIntent.date,Status:'Passed'}]},now),false);
 assert.equal(confirmed(action,reopened,new Date('2026-09-21T07:00:00Z')),false);
 assert.equal(confirmed(action,reopened,new Date('2026-09-21T06:59:59Z')),true);
});
test('Bellevue cancellation sends empty optional fields just like MBP, using only mocked HTTP',async()=>{
 const action=prepare(target,cancelIntent,{...live,scheduled:[bellevueBooking]});
 assert.deepEqual(action.body,{jurisdictionId:1,permitNumber:target.number,inspId:bellevueBooking.UniqueId,confirmationNumber:'',inspectionDetail:{InspectionType:'',Description:'415 Elec-Rough In',InspectionDate:'09/21/2026',TimeOfDay:'',MessageToInspector:'',ContactName:'',ContactPhone:'',ContactEmail:''}});
 const calls:{url:string;options?:RequestInit}[]=[];
 const mock=(async(url:unknown,options?:RequestInit)=>{calls.push({url:String(url),options});return calls.length===1?new Response(null,{status:302,headers:{Location:'/InspectionDetails','Set-Cookie':'session=mock; HttpOnly'}}):Response.json({});}) as typeof fetch;
 await httpGateway(mock).send(action);
 assert.equal(calls.length,2);assert.ok(calls[1].url.endsWith('/CancelInspection'));
 assert.equal(calls[1].options?.method,'POST');assert.deepEqual(JSON.parse(calls[1].options?.body as string),action.body);
});
test('nullable confirmation does not bypass booking identity, date, description or cancellation permission',()=>{
 const current={...live,scheduled:[bellevueBooking]};
 for(const changed of [{bookingId:'other'},{date:'2026-09-22'},{description:'Other inspection'}])assert.throws(()=>prepare(target,{...cancelIntent,...changed},current),/cannot be cancelled/);
 assert.throws(()=>prepare(target,cancelIntent,{...live,scheduled:[{...bellevueBooking,InspectionCancellable:false}]}),/cannot be cancelled/);
 assert.throws(()=>prepare(target,{...cancelIntent,bookingId:''},{...live,scheduled:[{...bellevueBooking,UniqueId:''}]}),/cannot be cancelled/);
});
test('cancellation confirms read-back, retains uncertainty, and never repeats a submission',async()=>{
 for(const outcome of ['success','unknown','revoked']){
  const {op,storage,locks}=setup();op.action=prepare(target,cancelIntent,{...live,scheduled:[bellevueBooking]});await storage.put(op);
  let posts=0;
  const gateway:Gateway={async read(){return posts?{...live,history:outcome==='success'?[{Description:bellevueBooking.Description,Date:cancelIntent.date,Status:'Cancelled'}]:[]}:{...live,scheduled:[{...bellevueBooking,InspectionCancellable:outcome!=='revoked'}]};},async send(){posts++;if(outcome==='unknown')throw Error('Mock timeout');}};
  const result=await execute(op.id,storage,gateway);
  assert.equal(result.state,outcome==='success'?'succeeded':outcome==='revoked'?'failed':'unknown');
  assert.equal(posts,outcome==='revoked'?0:1);assert.equal(locks.size,outcome==='unknown'?1:0);
  await execute(op.id,storage,gateway);await reconcile(result,storage,gateway);assert.equal(posts,outcome==='revoked'?0:1);
 }
});
test('changed restrictions fail before any submission',async()=>{
 const {op,storage}=setup();let posts=0;const result=await execute(op.id,storage,{async read(){return {...live,available:[{...live.available[0],InspectionRestricted:true}]};},async send(){posts++;}});
 assert.equal(result.state,'failed');assert.equal(posts,0);
});
test('timeout retains unknown result and lock; checking never resubmits',async()=>{
 const {op,storage,locks}=setup();let posts=0;let observed=live;const gateway:Gateway={async read(){return observed;},async send(){posts++;throw Error('mock timeout');}};
 let result=await execute(op.id,storage,gateway);assert.equal(result.state,'unknown');assert.equal(locks.size,1);
 await execute(op.id,storage,gateway);assert.equal(posts,1);
 observed={...live,scheduled:[booking]};result=await reconcile(result,storage,gateway);assert.equal(result.state,'succeeded');assert.equal(posts,1);assert.equal(locks.size,0);
});
test('expired confirmation never submits',async()=>{const {op,storage}=setup();op.expires=0;await storage.put(op);await assert.rejects(execute(op.id,storage,{async read(){throw Error('must not read');},async send(){throw Error('must not send');}}),/expired/);});
test('HTTP adapter uses only mocked requests and submits the reviewed payload once',async()=>{
 const calls:{url:string;method:string;body?:string}[]=[];
 const mock=(async(url:unknown,options?:RequestInit)=>{assert.equal(options?.redirect,'manual');calls.push({url:String(url),method:options?.method||'GET',body:options?.body as string});return calls.length===1?new Response(null,{status:302,headers:{Location:'/InspectionDetails','Set-Cookie':'session=mock; HttpOnly'}}):Response.json({});}) as typeof fetch;
 const action=prepare(target,intent,live);await httpGateway(mock).send(action);assert.equal(calls.length,2);assert.equal(calls[1].method,'POST');assert.ok(calls[1].url.endsWith('/ScheduleInspection'));assert.deepEqual(JSON.parse(calls[1].body!),action.body);
});
test('backend rejects untrusted origins and unauthenticated requests before storage or upstream use',async()=>{
 const env={ALLOWED_ORIGIN:'https://binbinbinbinlu.github.io',ADMIN_TOKEN:'a'.repeat(40),DB:{} as D1Database};
 assert.equal((await worker.fetch(new Request('https://backend.invalid/confirm',{method:'POST',headers:{Origin:'https://attacker.invalid'}}),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://backend.invalid/confirm',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN}}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://backend.invalid/confirm',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:'{}'}),env)).status,503);
});
