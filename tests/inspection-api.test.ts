import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionApi} from '../lib/inspection-api.ts';
const defaults={base:'https://mock.invalid',key:'mock',pause:async()=>{}};
test('review recovers once from a dropped connection with the same draft',async()=>{
 let calls=0;const bodies:unknown[]=[];
 const result=await inspectionApi({...defaults,path:'/review',body:{intent:{phone:'4252240399'}},fetcher:async(_url,init)=>{
  calls++;bodies.push(init?.body);if(calls===1)throw new TypeError('Failed to fetch');return Response.json({state:'review'});
 }});
 assert.deepEqual(result,{state:'review'});assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);
});
test('persistent review connection failure stops after two attempts and explains no submission',async()=>{
 let calls=0;
 await assert.rejects(inspectionApi({...defaults,path:'/review',body:{},fetcher:async()=>{calls++;throw new TypeError('Failed to fetch');}}),/No inspection was submitted.*details are still here/);
 assert.equal(calls,2);
});
test('confirmation is never retried after a lost connection',async()=>{
 let calls=0;
 await assert.rejects(inspectionApi({...defaults,path:'/confirm',body:{id:'mock',confirm:true},fetcher:async()=>{calls++;throw new TypeError('Failed to fetch');}}),/Could not connect/);
 assert.equal(calls,1);
});
test('validation and authentication errors are preserved without retry',async()=>{
 let calls=0;
 await assert.rejects(inspectionApi({...defaults,path:'/review',body:{},fetcher:async()=>{calls++;return Response.json({error:'Invalid access key.'},{status:401});}}),/Invalid access key/);
 assert.equal(calls,1);
});
test('proxy HTML errors and timeouts get useful messages without automatic resubmission',async()=>{
 await assert.rejects(inspectionApi({...defaults,path:'/review',body:{},fetcher:async()=>new Response('<html>unavailable</html>',{status:502})}),/HTTP 502.*No inspection was submitted/);
 let calls=0;
 await assert.rejects(inspectionApi({...defaults,path:'/review',body:{},fetcher:async()=>{calls++;throw new DOMException('Timed out','TimeoutError');}}),/Could not connect/);
 assert.equal(calls,1);
});
